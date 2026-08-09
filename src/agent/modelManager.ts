/**
 * Model manager: download and initialize the on-device Gemma model.
 *
 * Used by both the onboarding ModelDownloadScreen and the Settings screen so
 * the same download + init logic runs regardless of where it's triggered.
 */

import * as Device from 'expo-device';
import {
  registerGenerateFn,
  registerGenerateWithImageFn,
  unregisterLLM,
} from './llmBridge';

// ---------------------------------------------------------------------------
// Device RAM guard
// ---------------------------------------------------------------------------

// docs/functiongemma-schema-ram-report.md section 4.1/4.2: below this floor,
// on-device Gemma 4 (E2B or E4B) cannot reliably load — route to cloud instead.
export const MIN_DEVICE_RAM_GB = 3;

/**
 * True if the device has enough RAM to attempt on-device model loading.
 * Permissive (returns true) when RAM can't be determined — e.g. web, or a
 * platform expo-device doesn't support — so dev/simulator flows are unaffected.
 */
export function hasEnoughRamForOnDevice(): boolean {
  const totalBytes = Device.totalMemory;
  if (totalBytes == null) return true;
  const totalGB = totalBytes / 1024 ** 3;
  return totalGB >= MIN_DEVICE_RAM_GB;
}

const LOW_RAM_ERROR =
  `This device has less than ${MIN_DEVICE_RAM_GB} GB of RAM, which isn't enough to run the on-device model. Use cloud mode instead.`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DownloadCallbacks {
  onProgress: (progress: number) => void;
  onComplete: () => void;
  onError: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Executorch lazy-require helpers
// ---------------------------------------------------------------------------

type ModelConfig = {
  modelName: string;
  capabilities: readonly string[];
  modelSource: string;
  tokenizerSource: string;
  tokenizerConfigSource: string;
  generationConfigSource: string;
};

type LLMInstance = {
  generate: (messages: { role: string; content: string }[], tools?: unknown[]) => Promise<string>;
  forward: (input: string, imagePaths?: string[]) => Promise<string>;
};

function getExecutorch(): {
  LLMModule: { fromModelName: (config: ModelConfig) => Promise<LLMInstance> };
  downloadModel: (config: ModelConfig, onProgress: (p: number) => void) => Promise<void>;
  GEMMA4_E2B_QUANTIZED: ModelConfig;
  GEMMA4_E4B_QUANTIZED: ModelConfig;
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-executorch');
}

function modelConfig(model: 'E2B' | 'E4B'): ModelConfig {
  const ex = getExecutorch();
  return model === 'E2B' ? ex.GEMMA4_E2B_QUANTIZED : ex.GEMMA4_E4B_QUANTIZED;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Download the specified Gemma model to device storage.
 * Falls back to a simulated download in __DEV__ environments where executorch
 * is not linked (for UI testing).
 */
export async function downloadModel(
  model: 'E2B' | 'E4B',
  callbacks: DownloadCallbacks,
): Promise<void> {
  if (!hasEnoughRamForOnDevice()) {
    callbacks.onError(LOW_RAM_ERROR);
    return;
  }
  try {
    const ex = getExecutorch();
    await ex.downloadModel(modelConfig(model), callbacks.onProgress);
    callbacks.onComplete();
  } catch (err) {
    if (__DEV__) {
      await simulateDownload(callbacks);
    } else {
      callbacks.onError(err instanceof Error ? err.message : 'Download failed');
    }
  }
}

/**
 * Load the specified Gemma model from device storage and register its
 * inference functions in the llmBridge singleton.
 * Throws if executorch is not linked or the model has not been downloaded.
 */
export async function initModel(model: 'E2B' | 'E4B'): Promise<void> {
  if (!hasEnoughRamForOnDevice()) {
    throw new Error(LOW_RAM_ERROR);
  }
  const ex = getExecutorch();
  const llm = await ex.LLMModule.fromModelName(modelConfig(model));

  registerGenerateFn(async (prompt: string) => {
    return llm.generate([{ role: 'user', content: prompt }]);
  });

  registerGenerateWithImageFn(async (prompt: string, imagePath: string) => {
    return llm.forward(prompt, [imagePath]);
  });
}

/**
 * Download the model and immediately initialize it.
 * Convenience wrapper for use in Settings.
 */
export async function downloadAndInitModel(
  model: 'E2B' | 'E4B',
  callbacks: DownloadCallbacks,
): Promise<void> {
  let downloadCompleted = false;
  await downloadModel(model, {
    onProgress: callbacks.onProgress,
    onComplete: async () => {
      downloadCompleted = true;
      try {
        await initModel(model);
        callbacks.onComplete();
      } catch (err) {
        callbacks.onError(err instanceof Error ? err.message : 'Failed to load model');
      }
    },
    onError: callbacks.onError,
  });
  // In the simulated-download path onComplete fires synchronously inside
  // downloadModel, so we only fall through here if download itself threw.
  if (!downloadCompleted) {
    callbacks.onError('Download did not complete');
  }
}

/** Unload the currently loaded model (e.g. before switching variants). */
export function unloadModel(): void {
  unregisterLLM();
}

// ---------------------------------------------------------------------------
// Dev simulation
// ---------------------------------------------------------------------------

async function simulateDownload(callbacks: DownloadCallbacks): Promise<void> {
  const STEPS = 40;
  for (let i = 1; i <= STEPS; i++) {
    await new Promise<void>((r) => setTimeout(r, 50));
    callbacks.onProgress(i / STEPS);
  }
  callbacks.onComplete();
}
