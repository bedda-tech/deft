/**
 * Watchdog bridge.
 *
 * Manages recurring agent checks ("watchdogs"). A watchdog runs the agent
 * loop on a fixed interval; when the condition is true (task_complete), a
 * notification fires and the watchdog is cancelled.
 *
 * Scheduling uses JS setInterval so the foreground service keeps the process
 * alive. One watchdog at a time is supported in v1 — if the regular agent
 * is running when a tick is due, the tick is skipped.
 */

import { NativeModules, Platform } from 'react-native';
import { getSettings } from '../store/settingsStore';
import { getGenerateFn, getGenerateWithImageFn } from './llmBridge';
import {
  cancelWatchdog,
  createWatchdog,
  getWatchdogs,
  pauseWatchdog,
  recordWatchdogTick,
  resumeWatchdog,
  triggerWatchdog,
  type WatchdogConfig,
} from '../store/watchdogStore';
import {
  completeForegroundService,
  startForegroundService,
  stopForegroundService,
  updateForegroundService,
} from './foregroundService';

// ---------------------------------------------------------------------------
// Types (mirrors device-agent without importing it)
// ---------------------------------------------------------------------------

type AgentEvent =
  | { type: 'action'; tool: string; args: Record<string, unknown> }
  | { type: 'observation'; step: number; screenState: string }
  | { type: 'thinking'; content: string }
  | { type: 'complete'; result: string }
  | { type: 'failed'; reason: string }
  | { type: 'error'; error: Error }
  | { type: 'max_steps_reached' }
  | { type: 'timeout' };

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** id → interval handle */
const _timers = new Map<string, ReturnType<typeof setInterval>>();

/** True while the regular agent bridge is running a task. Set externally. */
let _agentBusy = false;

export function setAgentBusy(busy: boolean): void {
  _agentBusy = busy;
}

// ---------------------------------------------------------------------------
// Watchdog system prompt suffix
// ---------------------------------------------------------------------------

const WATCHDOG_SYSTEM_SUFFIX = `
You are checking a condition for the user. Read the screen and determine whether the condition is met.
- If the condition IS met, call task_complete with a brief description of what you observed.
- If the condition is NOT yet met, call task_failed with reason "condition not met".
Do not perform any actions beyond reading the screen.
`.trim();

// ---------------------------------------------------------------------------
// Parse /watch command
// ---------------------------------------------------------------------------

const WATCH_RE = /^\/watch\s+every\s+(\d+(?:\.\d+)?)\s*(m|min|s|sec|h|hr)\s*[:\-]?\s*/i;

export interface ParsedWatchCommand {
  intervalMs: number;
  task: string;
}

export function parseWatchCommand(text: string): ParsedWatchCommand | null {
  const m = text.trim().match(WATCH_RE);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  let intervalMs: number;
  if (unit.startsWith('h')) {
    intervalMs = n * 3_600_000;
  } else if (unit.startsWith('s')) {
    intervalMs = n * 1_000;
  } else {
    intervalMs = n * 60_000;
  }
  const task = text.slice(m[0].length).trim();
  if (!task) return null;
  return { intervalMs, task };
}

// ---------------------------------------------------------------------------
// Internal: run one watchdog tick
// ---------------------------------------------------------------------------

async function runWatchdogTick(config: WatchdogConfig): Promise<'triggered' | 'not_met' | 'error'> {
  const settings = getSettings();

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const deviceAgent = require('react-native-device-agent') as {
      AgentLoop: new (options: {
        provider: unknown;
        maxSteps: number;
        settleMs: number;
        useVision?: boolean;
        systemPromptSuffix?: string;
        timeoutMs?: number;
        toolFilter?: string[];
      }) => {
        run: (task: string) => AsyncGenerator<AgentEvent>;
        abort: () => void;
      };
      CloudProvider: new (options: {
        apiKey: string;
        model: string;
        baseUrl?: string;
        apiFormat?: 'openai' | 'anthropic' | 'openrouter';
        system?: string;
      }) => unknown;
      GemmaProvider: new (options: {
        generateFn?: (prompt: string) => Promise<string>;
        generateWithImageFn?: (prompt: string, imagePath: string) => Promise<string>;
      }) => unknown;
      FallbackProvider: new (options: {
        onDevice: unknown;
        cloud: unknown;
        debug?: boolean;
      }) => unknown;
    };

    const generateFn = getGenerateFn();
    const hasCloud = settings.cloudFallback && !!settings.cloudApiKey;

    let provider: unknown;
    if (generateFn && hasCloud) {
      provider = new deviceAgent.FallbackProvider({
        onDevice: new deviceAgent.GemmaProvider({
          generateFn,
          generateWithImageFn: getGenerateWithImageFn() ?? undefined,
        }),
        cloud: _buildCloudProvider(deviceAgent, settings),
      });
    } else if (hasCloud) {
      provider = _buildCloudProvider(deviceAgent, settings);
    } else if (generateFn) {
      provider = new deviceAgent.GemmaProvider({
        generateFn,
        generateWithImageFn: getGenerateWithImageFn() ?? undefined,
      });
    } else {
      return 'error';
    }

    // Watchdog always uses read_only tool preset so it can't cause unintended actions.
    const toolFilter = resolveToolPreset(config.toolPreset);

    const loop = new deviceAgent.AgentLoop({
      provider,
      maxSteps: Math.min(settings.maxSteps, 5),
      settleMs: settings.settleMs,
      useVision: settings.useVision,
      systemPromptSuffix: WATCHDOG_SYSTEM_SUFFIX,
      timeoutMs: 60_000,
      toolFilter,
    });

    for await (const event of loop.run(config.task)) {
      if (event.type === 'complete') {
        return 'triggered';
      } else if (event.type === 'failed') {
        return 'not_met';
      } else if (event.type === 'error') {
        return 'error';
      }
    }
    return 'not_met';
  } catch {
    return 'error';
  }
}

function _buildCloudProvider(
  deviceAgent: {
    CloudProvider: new (options: {
      apiKey: string;
      model: string;
      baseUrl?: string;
      apiFormat?: 'openai' | 'anthropic' | 'openrouter';
      system?: string;
    }) => unknown;
  },
  settings: ReturnType<typeof getSettings>,
): unknown {
  const provider = settings.cloudProvider;
  let baseUrl: string;
  let apiFormat: 'openai' | 'anthropic' | 'openrouter';
  if (provider === 'anthropic') {
    baseUrl = 'https://api.anthropic.com/v1';
    apiFormat = 'anthropic';
  } else if (provider === 'openrouter') {
    baseUrl = 'https://openrouter.ai/api/v1';
    apiFormat = 'openrouter';
  } else if (provider === 'openai') {
    baseUrl = 'https://api.openai.com/v1';
    apiFormat = 'openai';
  } else {
    const isAnthropic = settings.cloudModel.startsWith('claude');
    baseUrl = isAnthropic ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1';
    apiFormat = isAnthropic ? 'anthropic' : 'openai';
  }
  return new deviceAgent.CloudProvider({
    apiKey: settings.cloudApiKey,
    model: settings.cloudModel,
    baseUrl,
    apiFormat,
  });
}

function resolveToolPreset(preset: string): string[] {
  switch (preset) {
    case 'read_only':
      return ['read_screen', 'screenshot', 'list_apps', 'write_note', 'read_note'];
    case 'navigation':
      return ['tap', 'long_press', 'swipe', 'scroll', 'global_action', 'open_app',
        'list_apps', 'find_node', 'find_all_nodes', 'wait', 'wait_for_node',
        'wait_for_change', 'get_node_text', 'get_bounds', 'read_screen'];
    default:
      return ['read_screen', 'screenshot', 'open_app', 'tap', 'find_node', 'wait_for_change'];
  }
}

// ---------------------------------------------------------------------------
// Watchdog notification helpers (via DeftWatchdogModule if available)
// ---------------------------------------------------------------------------

interface DeftWatchdogModuleType {
  showWatchdogNotification(task: string, tickCount: number, intervalSec: number): void;
  showWatchdogTriggeredNotification(task: string, result: string): void;
  cancelWatchdogNotification(): void;
}

function _getWatchdogModule(): DeftWatchdogModuleType | null {
  if (Platform.OS !== 'android') return null;
  const m = NativeModules.DeftWatchdogModule as DeftWatchdogModuleType | undefined;
  return m ?? null;
}

function _showWatchdogNotification(config: WatchdogConfig, tickCount: number): void {
  const nativeModule = _getWatchdogModule();
  if (nativeModule) {
    nativeModule.showWatchdogNotification(config.task, tickCount, Math.round(config.intervalMs / 1000));
  }
  // Fallback: reuse the foreground service notification text.
  else {
    const intervalText = _formatInterval(config.intervalMs);
    updateForegroundService(tickCount);
    // If service isn't running yet, start it.
    startForegroundService(`Watchdog (${intervalText}): ${config.task}`);
  }
}

function _showWatchdogTriggeredNotification(config: WatchdogConfig, result: string): void {
  const nativeModule = _getWatchdogModule();
  if (nativeModule) {
    nativeModule.showWatchdogTriggeredNotification(config.task, result);
    nativeModule.cancelWatchdogNotification();
  } else {
    completeForegroundService(`Watchdog triggered: ${result}`, true);
  }
}

function _stopWatchdogNotification(): void {
  const nativeModule = _getWatchdogModule();
  if (nativeModule) {
    nativeModule.cancelWatchdogNotification();
  } else {
    stopForegroundService();
  }
}

function _formatInterval(ms: number): string {
  if (ms >= 3_600_000) return `${Math.round(ms / 3_600_000)}h`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 1000)}s`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new watchdog and start scheduling ticks.
 * Returns the WatchdogConfig so the caller can show confirmation in the chat.
 */
export function startWatchdog(task: string, intervalMs: number, toolPreset = 'read_only'): WatchdogConfig {
  const config = createWatchdog(task, intervalMs, toolPreset);

  const handle = setInterval(() => {
    void _tick(config.id);
  }, intervalMs);
  _timers.set(config.id, handle);

  // Show the watchdog foreground notification.
  const intervalText = _formatInterval(intervalMs);
  startForegroundService(`Watchdog (${intervalText}): ${task}`);

  // Run first tick immediately after a short delay so the notification is set up.
  setTimeout(() => { void _tick(config.id); }, 500);

  return config;
}

/** Cancel an active watchdog and clean up its timer. */
export function stopWatchdog(id: string): void {
  const handle = _timers.get(id);
  if (handle !== undefined) {
    clearInterval(handle);
    _timers.delete(id);
  }
  cancelWatchdog(id);
  // Stop the foreground notification if this was the last active watchdog.
  if (_timers.size === 0) {
    _stopWatchdogNotification();
  }
}

/** Pause ticking without deleting the watchdog. */
export function pauseWatchdogById(id: string): void {
  const handle = _timers.get(id);
  if (handle !== undefined) {
    clearInterval(handle);
    _timers.delete(id);
  }
  pauseWatchdog(id);
  if (_timers.size === 0) {
    stopForegroundService();
  }
}

/** Resume a paused watchdog. */
export function resumeWatchdogById(id: string): void {
  const watchdogs = getWatchdogs();
  const config = watchdogs.find((w) => w.id === id);
  if (!config || config.status !== 'paused') return;
  resumeWatchdog(id);
  const handle = setInterval(() => { void _tick(id); }, config.intervalMs);
  _timers.set(id, handle);
  startForegroundService(`Watchdog: ${config.task}`);
}

/** Restore watchdogs from the store on app startup. */
export function restoreWatchdogs(): void {
  const watchdogs = getWatchdogs();
  for (const config of watchdogs) {
    if (config.status === 'active' && !_timers.has(config.id)) {
      const handle = setInterval(() => { void _tick(config.id); }, config.intervalMs);
      _timers.set(config.id, handle);
    }
  }
  const activeCount = _timers.size;
  if (activeCount > 0) {
    startForegroundService(`${activeCount} watchdog${activeCount > 1 ? 's' : ''} active`);
  }
}

/** True if any watchdog timers are currently running. */
export function hasActiveWatchdogs(): boolean {
  return _timers.size > 0;
}

// ---------------------------------------------------------------------------
// Internal tick handler
// ---------------------------------------------------------------------------

async function _tick(id: string): Promise<void> {
  const watchdogs = getWatchdogs();
  const config = watchdogs.find((w) => w.id === id);
  if (!config || config.status !== 'active') {
    // Auto-clean timer if watchdog was cancelled externally.
    const handle = _timers.get(id);
    if (handle !== undefined) {
      clearInterval(handle);
      _timers.delete(id);
    }
    return;
  }

  // Skip if the regular agent is busy to avoid concurrency issues.
  if (_agentBusy) return;

  // Auto-cancel if max ticks exceeded.
  if (config.triggerCount >= config.maxTicks) {
    const handle = _timers.get(id);
    if (handle !== undefined) {
      clearInterval(handle);
      _timers.delete(id);
    }
    cancelWatchdog(id);
    _showWatchdogTriggeredNotification(
      config,
      `Watchdog expired after ${config.maxTicks} checks without triggering.`,
    );
    return;
  }

  _showWatchdogNotification(config, config.triggerCount + 1);

  const result = await runWatchdogTick(config);

  if (result === 'triggered') {
    const handle = _timers.get(id);
    if (handle !== undefined) {
      clearInterval(handle);
      _timers.delete(id);
    }
    triggerWatchdog(id);
    _showWatchdogTriggeredNotification(config, `Condition met: ${config.task}`);
  } else {
    recordWatchdogTick(id);
    if (_timers.size > 0 && result !== 'error') {
      // Keep the foreground notification showing the tick count.
      const updated = getWatchdogs().find((w) => w.id === id);
      if (updated) _showWatchdogNotification(updated, updated.triggerCount);
    }
  }
}
