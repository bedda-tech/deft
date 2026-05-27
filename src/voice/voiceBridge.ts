/**
 * Voice bridge: singleton registration point for on-device STT and TTS.
 *
 * Pattern mirrors llmBridge.ts:
 *   1. VoiceModule.tsx initializes useSpeechToText + useTextToSpeech hooks
 *      and registers their functions here.
 *   2. ChatScreen.tsx reads the registered functions for voice I/O.
 *   3. When Kokoro TTS is not yet ready, speakText falls back to expo-speech.
 */

type SpeakFn = (text: string) => Promise<void>;
type StopFn = () => Promise<void>;
type TranscribeFn = (waveform: Float32Array) => Promise<string>;
type ReadyListener = (ready: boolean) => void;

let _speakFn: SpeakFn | null = null;
let _stopKokoroFn: StopFn | null = null;
let _transcribeFn: TranscribeFn | null = null;
const _ttsListeners = new Set<ReadyListener>();
const _sttListeners = new Set<ReadyListener>();

// ---------------------------------------------------------------------------
// TTS
// ---------------------------------------------------------------------------

export function registerSpeakFn(fn: SpeakFn): void {
  _speakFn = fn;
  _ttsListeners.forEach((cb) => cb(true));
}

export function unregisterSpeakFn(): void {
  _speakFn = null;
  _ttsListeners.forEach((cb) => cb(false));
}

export function registerStopKokoroFn(fn: StopFn): void {
  _stopKokoroFn = fn;
}

export function unregisterStopKokoroFn(): void {
  _stopKokoroFn = null;
}

export function subscribeIsTTSReady(fn: ReadyListener): () => void {
  _ttsListeners.add(fn);
  return () => { _ttsListeners.delete(fn); };
}

export function isTTSReady(): boolean {
  return _speakFn !== null;
}

/**
 * Speak text using Kokoro if ready, otherwise fall back to expo-speech.
 */
export async function speakText(text: string): Promise<void> {
  if (_speakFn) {
    try {
      await _speakFn(text);
      return;
    } catch { /* fall through to expo-speech */ }
  }
  // Fallback: expo-speech
  try {
    interface SpeechModule { speak(text: string, opts?: object): void }
    const Speech = require('expo-speech') as SpeechModule;
    Speech.speak(text, { rate: 0.9 });
  } catch { /* expo-speech not linked — silent */ }
}

export function stopSpeech(): void {
  _stopKokoroFn?.().catch(() => {});
  try {
    interface SpeechModule { stop(): void }
    const Speech = require('expo-speech') as SpeechModule;
    Speech.stop();
  } catch { /* ignored */ }
}

// ---------------------------------------------------------------------------
// STT (Whisper)
// ---------------------------------------------------------------------------

export function registerTranscribeFn(fn: TranscribeFn): void {
  _transcribeFn = fn;
  _sttListeners.forEach((cb) => cb(true));
}

export function unregisterTranscribeFn(): void {
  _transcribeFn = null;
  _sttListeners.forEach((cb) => cb(false));
}

export function subscribeIsSTTReady(fn: ReadyListener): () => void {
  _sttListeners.add(fn);
  return () => { _sttListeners.delete(fn); };
}

export function isWhisperReady(): boolean {
  return _transcribeFn !== null;
}

/**
 * Transcribe a PCM waveform (Float32 at 16 kHz) using Whisper.
 * Throws if Whisper is not loaded.
 */
export async function transcribeAudio(waveform: Float32Array): Promise<string> {
  if (!_transcribeFn) {
    throw new Error('Whisper STT is not ready. Download the STT model from Settings.');
  }
  return _transcribeFn(waveform);
}
