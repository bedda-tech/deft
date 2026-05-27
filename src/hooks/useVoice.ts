/**
 * usePushToTalk — push-to-talk voice input hook.
 *
 * Press-and-hold gesture flow:
 *   1. startRecording(): requests mic permission, begins audio capture
 *   2. stopRecording():  stops capture, transcribes, calls onTranscript()
 *   3. cancel():         aborts without emitting a transcript
 *
 * When Whisper is loaded (isWhisperReady() returns true), audio is captured
 * via expo-av as 16 kHz mono PCM WAV and passed to transcribeAudio(). If
 * Whisper is not ready, falls back to expo-speech-recognition.
 */

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  isWhisperReady,
  subscribeIsSTTReady,
  transcribeAudio,
} from '../voice/voiceBridge';

export type PTTState = 'idle' | 'recording' | 'processing';

export interface UsePushToTalkResult {
  pttState: PTTState;
  whisperAvailable: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  cancel: () => void;
}

export function usePushToTalk(
  onTranscript: (text: string) => void,
): UsePushToTalkResult {
  const [pttState, setPttState] = useState<PTTState>('idle');
  const [whisperAvailable, setWhisperAvailable] = useState(isWhisperReady());
  const recordingRef = useRef<unknown>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return subscribeIsSTTReady((ready) => setWhisperAvailable(ready));
  }, []);

  const startRecording = useCallback(async () => {
    if (pttState !== 'idle') return;
    cancelledRef.current = false;
    setPttState('recording');

    if (whisperAvailable) {
      try {
        const { Audio } = require('expo-av') as typeof import('expo-av');
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') {
          setPttState('idle');
          return;
        }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync({
          android: {
            extension: '.wav',
            outputFormat: 0,  // AndroidOutputFormat.DEFAULT → raw PCM on most devices
            audioEncoder: 0,  // AndroidAudioEncoder.DEFAULT
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 256000,
          },
          ios: {
            extension: '.wav',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            outputFormat: 'lpcm' as any,
            audioQuality: 127,  // HIGH
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 256000,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
          web: {},
        });
        await recording.startAsync();
        recordingRef.current = { type: 'whisper', recording };
        return;
      } catch {
        // Fall through to expo-speech-recognition
      }
    }

    // Fallback: expo-speech-recognition (tap semantics adapted to PTT)
    await startSpeechRecognitionPTT(onTranscript, setPttState, cancelledRef, recordingRef);
  }, [pttState, whisperAvailable, onTranscript]);

  const stopRecording = useCallback(async () => {
    if (pttState !== 'recording') return;
    const handle = recordingRef.current as PTTHandle | null;
    recordingRef.current = null;

    if (handle?.type === 'whisper') {
      setPttState('processing');
      try {
        await handle.recording.stopAndUnloadAsync();
        const uri = handle.recording.getURI();
        if (uri && !cancelledRef.current) {
          const waveform = await readWavAsFloat32(uri);
          const transcript = await transcribeAudio(waveform);
          if (!cancelledRef.current && transcript.trim()) {
            onTranscript(transcript.trim());
          }
        }
      } catch { /* transcription failed — silent */ }
      setPttState('idle');
    } else if (handle?.type === 'sr') {
      // Stop speech recognition; final result arrives via registered listener
      try {
        const { ExpoSpeechRecognitionModule } =
          require('expo-speech-recognition') as typeof import('expo-speech-recognition');
        ExpoSpeechRecognitionModule.stop();
      } catch { /* not linked */ }
    } else {
      setPttState('idle');
    }
  }, [pttState, onTranscript]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    const handle = recordingRef.current as PTTHandle | null;
    recordingRef.current = null;
    if (handle?.type === 'whisper') {
      handle.recording.stopAndUnloadAsync().catch(() => {});
    } else if (handle?.type === 'sr') {
      try {
        const { ExpoSpeechRecognitionModule } =
          require('expo-speech-recognition') as typeof import('expo-speech-recognition');
        ExpoSpeechRecognitionModule.abort();
      } catch { /* not linked */ }
    }
    setPttState('idle');
  }, []);

  return { pttState, whisperAvailable, startRecording, stopRecording, cancel };
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface WhisperHandle {
  type: 'whisper';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recording: any;
}

interface SRHandle {
  type: 'sr';
}

type PTTHandle = WhisperHandle | SRHandle;

// ---------------------------------------------------------------------------
// Speech-recognition PTT helper
// ---------------------------------------------------------------------------

type SetState = (s: PTTState) => void;

async function startSpeechRecognitionPTT(
  onTranscript: (text: string) => void,
  setPttState: SetState,
  cancelledRef: React.MutableRefObject<boolean>,
  recordingRef: React.MutableRefObject<unknown>,
): Promise<void> {
  try {
    const sr = require('expo-speech-recognition') as typeof import('expo-speech-recognition');
    const { status } = await sr.ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (status !== 'granted') {
      setPttState('idle');
      return;
    }

    const subs: Array<{ remove(): void }> = [];

    const cleanup = () => subs.forEach((s) => s.remove());

    subs.push(
      sr.addSpeechRecognitionListener('result', (event) => {
        if (event.isFinal) {
          cleanup();
          const text = event.results[0]?.transcript ?? '';
          if (!cancelledRef.current && text.trim()) {
            onTranscript(text.trim());
          }
          setPttState('idle');
        }
      }),
      sr.addSpeechRecognitionListener('end', () => {
        cleanup();
        setPttState('idle');
      }),
      sr.addSpeechRecognitionListener('error', () => {
        cleanup();
        setPttState('idle');
      }),
    );

    sr.ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: false,
      continuous: false,
    });

    recordingRef.current = { type: 'sr', cleanup };
  } catch {
    setPttState('idle');
  }
}

// ---------------------------------------------------------------------------
// WAV → Float32Array decoder
// ---------------------------------------------------------------------------

async function readWavAsFloat32(uri: string): Promise<Float32Array> {
  const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const dataOffset = findWavDataOffset(bytes);
  const numSamples = (bytes.length - dataOffset) / 2;
  const view = new DataView(bytes.buffer);
  const float32 = new Float32Array(Math.max(0, numSamples));
  for (let i = 0; i < float32.length; i++) {
    const sample = view.getInt16(dataOffset + i * 2, true);
    float32[i] = sample / 32768;
  }
  return float32;
}

function findWavDataOffset(bytes: Uint8Array): number {
  // Scan for 'data' chunk header after the RIFF/WAVE/fmt chunks
  for (let i = 12; i < Math.min(bytes.length - 8, 256); i++) {
    if (
      bytes[i] === 0x64 && bytes[i + 1] === 0x61 &&
      bytes[i + 2] === 0x74 && bytes[i + 3] === 0x61
    ) {
      return i + 8; // Skip 'data' + 4-byte chunk size
    }
  }
  return 44; // Standard PCM WAV header fallback
}
