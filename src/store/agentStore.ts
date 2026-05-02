/**
 * Agent state store.
 *
 * Tracks whether the agent loop is currently running and what it is doing.
 * Components subscribe to observe running state, current step, and the last
 * screen snapshot so they can reflect progress without polling.
 *
 * agentBridge.ts writes to this store; UI components read from it.
 */

export interface AgentState {
  /** True while the agent loop is actively running. */
  isRunning: boolean;
  /** The task that was submitted (null when idle). */
  currentTask: string | null;
  /** How many observe→act cycles have completed. */
  currentStep: number;
  /** Maximum steps allowed for this run (from settings). */
  maxSteps: number;
  /** Most recent serialized screen state from the agent loop. */
  currentScreenState: string | null;
  /** Number of tool actions dispatched so far in this run. */
  actionCount: number;
}

const IDLE: AgentState = {
  isRunning: false,
  currentTask: null,
  currentStep: 0,
  maxSteps: 20,
  currentScreenState: null,
  actionCount: 0,
};

let _state: AgentState = { ...IDLE };
let _listeners: Array<(state: AgentState) => void> = [];

function notify(): void {
  const snap = { ..._state };
  for (const l of _listeners) l(snap);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getAgentState(): AgentState {
  return { ..._state };
}

export function subscribeAgentState(
  listener: (state: AgentState) => void,
): () => void {
  _listeners.push(listener);
  listener({ ..._state });
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
}

// ---------------------------------------------------------------------------
// Write (called by agentBridge.ts)
// ---------------------------------------------------------------------------

/** Mark the agent as active for the given task. */
export function agentStarted(task: string, maxSteps: number = 20): void {
  _state = { isRunning: true, currentTask: task, currentStep: 0, maxSteps, currentScreenState: null, actionCount: 0 };
  notify();
}

/** Update step counter and last known screen state. */
export function agentStepped(step: number, screenState?: string): void {
  _state = {
    ..._state,
    currentStep: step,
    currentScreenState: screenState ?? _state.currentScreenState,
  };
  notify();
}

/** Increment the action counter for the current run. */
export function agentActioned(): void {
  _state = { ..._state, actionCount: _state.actionCount + 1 };
  notify();
}

/** Mark the agent as idle again (complete, error, or stopped). */
export function agentStopped(): void {
  _state = { ...IDLE };
  notify();
}
