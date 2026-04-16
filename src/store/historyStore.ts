/**
 * Agent session history store.
 *
 * Ephemeral -- sessions are kept in memory for the current app session only.
 * Subscribers are notified whenever the session list changes.
 */

export type SessionOutcome = 'complete' | 'stopped' | 'error';

export interface AgentSession {
  id: string;
  /** The original user command. */
  command: string;
  /** Action texts executed during the session. */
  actions: string[];
  /** Total agent loop steps taken. */
  stepCount: number;
  /** How the session ended. */
  outcome: SessionOutcome;
  /** Short summary or error message from the agent. */
  summary: string;
  /** Unix timestamp (ms) when the session completed. */
  timestamp: number;
}

let _sessions: AgentSession[] = [];
let _listeners: Array<(sessions: AgentSession[]) => void> = [];

function notify() {
  const snapshot = [..._sessions];
  for (const l of _listeners) l(snapshot);
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function subscribeSessions(
  listener: (sessions: AgentSession[]) => void,
): () => void {
  _listeners.push(listener);
  listener([..._sessions]);
  return () => {
    _listeners = _listeners.filter((l) => l !== listener);
  };
}

export function getSessions(): AgentSession[] {
  return [..._sessions];
}

/** Record a completed agent session. Newest sessions appear first. */
export function addSession(
  command: string,
  actions: string[],
  outcome: SessionOutcome,
  summary: string,
): void {
  _sessions = [
    {
      id: uid(),
      command,
      actions,
      stepCount: actions.length,
      outcome,
      summary,
      timestamp: Date.now(),
    },
    ..._sessions,
  ];
  notify();
}

export function clearSessions(): void {
  _sessions = [];
  notify();
}
