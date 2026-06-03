/**
 * Watchdog store.
 *
 * A watchdog is a recurring agent check: the user describes a condition
 * (e.g. "Uber is within 5 minutes") and an interval; the agent loop runs on
 * that cadence and fires a notification when the condition is true.
 *
 * State is persisted to AsyncStorage so watchdogs survive hot reloads.
 * In-memory API is synchronous; persistence is fire-and-forget.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface WatchdogConfig {
  id: string;
  /** Natural-language condition (e.g. "Uber is within 5 minutes"). */
  task: string;
  /** Interval between checks in milliseconds. */
  intervalMs: number;
  /** Tool preset name (default: 'read_only'). */
  toolPreset: string;
  /** Unix timestamp (ms) when the watchdog was created. */
  createdAt: number;
  /** Unix timestamp (ms) of the last tick, or null if never run. */
  lastRunAt: number | null;
  /** How the watchdog is currently behaving. */
  status: 'active' | 'paused' | 'triggered' | 'cancelled';
  /** Total number of ticks run (successful checks + failed checks). */
  triggerCount: number;
  /** Auto-cancel after this many consecutive non-triggering ticks. Default: 50. */
  maxTicks: number;
}

const STORAGE_KEY = 'deft:watchdogs';
const MAX_TICKS_DEFAULT = 50;

let _watchdogs: WatchdogConfig[] = [];
let _listeners: Array<(watchdogs: WatchdogConfig[]) => void> = [];

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function _load(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      _watchdogs = JSON.parse(raw) as WatchdogConfig[];
    }
  } catch { /* ignore */ }
}

function _save(): void {
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(_watchdogs)).catch(() => {});
}

function _notify(): void {
  const copy = [..._watchdogs];
  for (const l of _listeners) {
    l(copy);
  }
}

// Load on module import.
void _load();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function subscribeWatchdogs(
  callback: (watchdogs: WatchdogConfig[]) => void,
): () => void {
  _listeners.push(callback);
  callback([..._watchdogs]);
  return () => {
    _listeners = _listeners.filter((l) => l !== callback);
  };
}

export function getWatchdogs(): WatchdogConfig[] {
  return [..._watchdogs];
}

export function getActiveWatchdogs(): WatchdogConfig[] {
  return _watchdogs.filter((w) => w.status === 'active');
}

/** Create and persist a new watchdog. Returns the generated config. */
export function createWatchdog(
  task: string,
  intervalMs: number,
  toolPreset = 'read_only',
  maxTicks = MAX_TICKS_DEFAULT,
): WatchdogConfig {
  const config: WatchdogConfig = {
    id: Math.random().toString(36).slice(2, 10),
    task,
    intervalMs,
    toolPreset,
    createdAt: Date.now(),
    lastRunAt: null,
    status: 'active',
    triggerCount: 0,
    maxTicks,
  };
  _watchdogs = [config, ..._watchdogs];
  _save();
  _notify();
  return config;
}

/** Record a completed tick (did not trigger). */
export function recordWatchdogTick(id: string): void {
  _watchdogs = _watchdogs.map((w) =>
    w.id === id
      ? { ...w, triggerCount: w.triggerCount + 1, lastRunAt: Date.now() }
      : w,
  );
  _save();
  _notify();
}

/** Mark the watchdog as triggered (condition met). */
export function triggerWatchdog(id: string): void {
  _watchdogs = _watchdogs.map((w) =>
    w.id === id ? { ...w, status: 'triggered', lastRunAt: Date.now() } : w,
  );
  _save();
  _notify();
}

/** Pause a watchdog (stops ticks but keeps config). */
export function pauseWatchdog(id: string): void {
  _watchdogs = _watchdogs.map((w) =>
    w.id === id ? { ...w, status: 'paused' } : w,
  );
  _save();
  _notify();
}

/** Resume a paused watchdog. */
export function resumeWatchdog(id: string): void {
  _watchdogs = _watchdogs.map((w) =>
    w.id === id ? { ...w, status: 'active' } : w,
  );
  _save();
  _notify();
}

/** Cancel and permanently remove a watchdog. */
export function cancelWatchdog(id: string): void {
  _watchdogs = _watchdogs.map((w) =>
    w.id === id ? { ...w, status: 'cancelled' } : w,
  );
  _save();
  _notify();
}

/** Remove all cancelled/triggered watchdogs (cleanup). */
export function clearFinishedWatchdogs(): void {
  _watchdogs = _watchdogs.filter(
    (w) => w.status !== 'cancelled' && w.status !== 'triggered',
  );
  _save();
  _notify();
}
