/**
 * Settings store.
 *
 * Persists user preferences to AsyncStorage with an in-memory cache.
 * Call loadSettings() once at startup; subsequent reads via getSettings()
 * are synchronous so the agent loop can access them without await.
 */

export interface Settings {
  /** Which Gemma variant to use for on-device inference. */
  model: 'E2B' | 'E4B';
  /** Fall back to a cloud LLM when the local model is unavailable. */
  cloudFallback: boolean;
  /** API key for the cloud provider (OpenAI or Anthropic). */
  cloudApiKey: string;
  /**
   * Cloud model identifier.
   * OpenAI example: 'gpt-4o'
   * Anthropic example: 'claude-sonnet-4-6'
   */
  cloudModel: string;
  /** Maximum number of agent loop steps before giving up. */
  maxSteps: number;
  /** Milliseconds to wait after each action before observing the result. */
  settleMs: number;
  /** Enable multimodal vision: take a screenshot at each step and pass it to the LLM. */
  useVision: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  model: 'E4B',
  cloudFallback: false,
  cloudApiKey: '',
  cloudModel: 'claude-sonnet-4-6',
  maxSteps: 20,
  settleMs: 500,
  useVision: false,
};

const SETTINGS_KEY = '@deft/settings';

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function getStorage(): AsyncStorageLike {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-async-storage/async-storage').default as AsyncStorageLike;
  } catch {
    const mem: Record<string, string> = {};
    return {
      async getItem(k: string) { return mem[k] ?? null; },
      async setItem(k: string, v: string) { mem[k] = v; },
    };
  }
}

let _cache: Settings = { ...DEFAULT_SETTINGS };
let _loaded = false;

/** Load settings from storage. Call once at app startup. */
export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await getStorage().getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      _cache = { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // Ignore parse errors -- fall back to defaults
  }
  _loaded = true;
  return { ..._cache };
}

/** Synchronous read of the cached settings. */
export function getSettings(): Settings {
  return { ..._cache };
}

/** Merge a partial patch into the settings and persist. */
export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  _cache = { ..._cache, ...patch };
  try {
    await getStorage().setItem(SETTINGS_KEY, JSON.stringify(_cache));
  } catch {
    // Ignore storage errors
  }
}

/** Reset all settings to factory defaults. */
export async function resetSettings(): Promise<void> {
  _cache = { ...DEFAULT_SETTINGS };
  try {
    await getStorage().setItem(SETTINGS_KEY, JSON.stringify(_cache));
  } catch {
    // Ignore storage errors
  }
}

export function isSettingsLoaded(): boolean {
  return _loaded;
}
