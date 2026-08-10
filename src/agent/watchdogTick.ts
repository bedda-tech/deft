/**
 * Pure watchdog tick logic, kept free of React Native / AsyncStorage
 * imports so it can carry state between ticks and be unit tested without
 * mocking native modules.
 *
 * Extracted from watchdogBridge.ts so runWatchdogTick() has something to
 * delegate to for the two things that make cross-tick comparison work:
 * building the AgentLoop context from the previous result, and turning the
 * terminal AgentEvent back into a result string worth remembering.
 */

export interface WatchdogTickState {
  /** What the previous tick observed, or null before the first tick. */
  lastResult: string | null;
}

export type WatchdogTerminalEvent =
  | { type: 'complete'; result: string }
  | { type: 'failed'; reason: string };

export interface WatchdogTickOutcome {
  status: 'triggered' | 'not_met';
  /** Text to persist as the next tick's `lastResult`. */
  resultText: string;
}

/**
 * Build the AgentLoop `context` map for a tick. Empty until a previous
 * result exists -- once it does, the model can compare the current screen
 * against it (e.g. to tell "status changed to X" from "status is X").
 */
export function buildWatchdogContext(state: WatchdogTickState): Record<string, string> {
  return state.lastResult ? { previous_check_result: state.lastResult } : {};
}

/** Map a terminal AgentEvent to a tick outcome and the text to remember. */
export function deriveWatchdogOutcome(event: WatchdogTerminalEvent): WatchdogTickOutcome {
  return event.type === 'complete'
    ? { status: 'triggered', resultText: event.result }
    : { status: 'not_met', resultText: event.reason };
}

/**
 * Each active watchdog runs the full agent loop (accessibility-tree read +
 * LLM inference) on its own interval; on RAM-constrained devices, too many
 * overlapping watchdogs risks concurrent inference/OOM. Cap concurrent
 * active watchdogs (docs/watchdog-design.md sec 5, "Maximum concurrent
 * watchers").
 */
export const MAX_ACTIVE_WATCHDOGS = 3;

/** True if a new watchdog may be started given the current active count. */
export function canStartWatchdog(activeCount: number, cap: number = MAX_ACTIVE_WATCHDOGS): boolean {
  return activeCount < cap;
}
