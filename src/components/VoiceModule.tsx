/**
 * VoiceModule — mounts react-native-executorch STT and TTS hooks and
 * registers their functions in voiceBridge.ts so the rest of the app
 * can call transcribeAudio() and speakText() without importing React hooks.
 *
 * Mount once at the root of the app (App.tsx). Renders nothing.
 *
 * Models loaded:
 *   STT: Whisper Tiny EN (quantized) — ~40 MB, fast, English-only
 *   TTS: Kokoro Small + af_heart voice — ~60 MB, low-latency
 *
 * Audio playback for Kokoro:
 *   forward() returns a 22050 Hz Float32 PCM array. We encode it as a WAV
 *   file in the Expo cache directory and play it via expo-av.
 *   Falls back to expo-speech if expo-file-system / expo-av are not linked.
 */

import React, { useEffect } from 'react';
import {
  useSpeechToText,
  useTextToSpeech,
  WHISPER_TINY_EN_QUANTIZED,
  KOKORO_SMALL,
  KOKORO_VOICE_AF_HEART,
} from 'react-native-executorch';
import {
  registerSpeakFn,
  registerTranscribeFn,
  unregisterSpeakFn,
  unregisterTranscribeFn,
} from '../voice/voiceBridge';

export function VoiceModule(): null {
  const stt = useSpeechToText({ model: WHISPER_TINY_EN_QUANTIZED });
  const tts = useTextToSpeech({ model: KOKORO_SMALL, voice: KOKORO_VOICE_AF_HEART });

  useEffect(() => {
    if (!stt.isReady) return;
    const transcribeFn = async (waveform: Float32Array): Promise<string> => {
      const result = await stt.transcribe(waveform);
      return result.text ?? '';
    };
    registerTranscribeFn(transcribeFn);
    return () => unregisterTranscribeFn();
  }, [stt.isReady, stt.transcribe]);

  useEffect(() => {
    if (!tts.isReady) return;
    const speakFn = async (text: string): Promise<void> => {
      const samples = await tts.forward({ text });
      await playPcmAudio(samples);
    };
    registerSpeakFn(speakFn);
    return () => unregisterSpeakFn();
  }, [tts.isReady, tts.forward]);

  return null;
}

// ---------------------------------------------------------------------------
// PCM → WAV → expo-av playback
// ---------------------------------------------------------------------------

const KOKORO_SAMPLE_RATE = 22050;
const TTS_CACHE_FILENAME = 'kokoro_tts_output.wav';

async function playPcmAudio(samples: Float32Array): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Audio } = require('expo-av') as typeof import('expo-av');

    const uri = (FileSystem.cacheDirectory ?? '') + TTS_CACHE_FILENAME;
    const wavBytes = encodeWav(samples, KOKORO_SAMPLE_RATE);
    const b64 = uint8ArrayToBase64(wavBytes);
    await FileSystem.writeAsStringAsync(uri, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const { sound } = await Audio.Sound.createAsync({ uri });
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
      }
    });
  } catch {
    // expo-file-system or expo-av not linked — silent; voiceBridge falls back to expo-speech
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const numSamples = samples.length;
  const pcmByteLen = numSamples * 2;
  const buf = new ArrayBuffer(44 + pcmByteLen);
  const view = new DataView(buf);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcmByteLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);   // chunk size
  view.setUint16(20, 1, true);    // PCM format
  view.setUint16(22, 1, true);    // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);    // block align
  view.setUint16(34, 16, true);   // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, pcmByteLen, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buf);
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
