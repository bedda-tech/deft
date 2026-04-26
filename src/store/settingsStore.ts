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
  /**
   * Restricts which tools are offered to the LLM.
   * 'full'       → all PHONE_TOOLS (default)
   * 'navigation' → tap/swipe/scroll/global actions only; no text input
   * 'text_input' → form-filling: tap + type_text + scroll
   * 'read_only'  → read_screen + screenshot only; no actions
   * 'in_app'     → full interaction within the current app; no open_app / global_action
   */
  toolPreset: 'full' | 'navigation' | 'text_input' | 'read_only' | 'in_app';
  /** Fall back to a cloud LLM when the local model is unavailable. */
  cloudFallback: boolean;
  /** API key for the cloud provider. */
  cloudApiKey: string;
  /**
   * Cloud model identifier.
   * OpenAI example: 'gpt-4o'
   * Anthropic example: 'claude-sonnet-4-6'
   * OpenRouter example: 'google/gemma-3-27b-it'
   */
  cloudModel: string;
  /**
   * Cloud provider selection.
   * 'auto' detects Anthropic vs OpenAI by model name prefix.
   */
  cloudProvider: 'auto' | 'anthropic' | 'openai' | 'openrouter';
  /** Maximum number of agent loop steps before giving up. */
  maxSteps: number;
  /** Milliseconds to wait after each action before observing the result. */
  settleMs: number;
  /** Enable multimodal vision: take a screenshot at each step and pass it to the LLM. */
  useVision: boolean;
  /** Number of times to retry a failed LLM call before giving up (0 = no retries). */
  retryOnError: number;
  /** Extra instructions appended to the agent system prompt. */
  customInstructions: string;
  /**
   * When true, a complex task is first decomposed into subtasks by the LLM,
   * then each subtask is executed sequentially by AgentLoop (TaskPlanner mode).
   */
  planMode: boolean;
  /**
   * Maximum number of subtasks the TaskPlanner may generate for a single command.
   * Only relevant when planMode is true. Default: 5.
   */
  maxSubTasks: number;
  /**
   * Maximum wall-clock seconds the agent may run before timing out.
   * 0 means no timeout. Stored as seconds for display convenience;
   * multiply by 1000 before passing to AgentLoop's `timeoutMs` option.
   */
  timeoutSecs: number;
  /**
   * Maximum number of action + observation history entries included in each
   * prompt. Older entries are dropped when the limit is exceeded to protect
   * the LLM context window on long tasks. 0 = no limit.
   */
  maxHistoryItems: number;
  /**
   * Maximum character length of the serialized accessibility tree included in
   * each prompt. When the tree exceeds this limit, only interactive nodes are
   * kept. 0 disables truncation (not recommended for complex screens).
   * Corresponds to AgentOptions.maxScreenLength (default: 6000).
   */
  maxScreenLength: number;
  /** Speak agent responses aloud via text-to-speech when true. */
  ttsEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  model: 'E4B',
  toolPreset: 'full',
  cloudFallback: false,
  cloudApiKey: '',
  cloudModel: 'claude-sonnet-4-6',
  cloudProvider: 'auto',
  maxSteps: 20,
  settleMs: 500,
  useVision: false,
  retryOnError: 0,
  customInstructions: '',
  planMode: false,
  maxSubTasks: 5,
  timeoutSecs: 0,
  maxHistoryItems: 0,
  maxScreenLength: 6000,
  ttsEnabled: false,
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

type SettingsListener = (settings: Settings) => void;
const _listeners = new Set<SettingsListener>();

/** Subscribe to settings changes. Returns an unsubscribe function. */
export function subscribeSettings(fn: SettingsListener): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

function _notify(): void {
  const snapshot = { ..._cache };
  _listeners.forEach((fn) => fn(snapshot));
}

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
  _notify();
  try {
    await getStorage().setItem(SETTINGS_KEY, JSON.stringify(_cache));
  } catch {
    // Ignore storage errors
  }
}

/** Reset all settings to factory defaults. */
export async function resetSettings(): Promise<void> {
  _cache = { ...DEFAULT_SETTINGS };
  _notify();
  try {
    await getStorage().setItem(SETTINGS_KEY, JSON.stringify(_cache));
  } catch {
    // Ignore storage errors
  }
}

export function isSettingsLoaded(): boolean {
  return _loaded;
}
