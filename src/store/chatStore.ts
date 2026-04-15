/**
 * Chat message store.
 *
 * Manages the in-memory list of chat messages for the main agent interface.
 * Messages are ephemeral (not persisted to disk) -- each session starts fresh.
 */

export type MessageRole = 'user' | 'agent' | 'system';

export type MessageKind =
  /** A plain text message from the user or agent. */
  | 'text'
  /** An agent action (e.g. "Opened Chrome", "Tapped Search bar"). */
  | 'action'
  /** A screen-state snapshot label (e.g. "Screen: Chrome – New Tab"). */
  | 'screen';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  kind: MessageKind;
  text: string;
  timestamp: number;
  /** True while the agent is still generating/executing this message. */
  pending?: boolean;
}

/** Generate a simple unique id -- no external dep needed. */
function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let messages: ChatMessage[] = [];
let listeners: Array<(msgs: ChatMessage[]) => void> = [];

function notify() {
  const snapshot = [...messages];
  for (const l of listeners) l(snapshot);
}

export function subscribe(listener: (msgs: ChatMessage[]) => void): () => void {
  listeners.push(listener);
  listener([...messages]);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function getMessages(): ChatMessage[] {
  return [...messages];
}

export function addMessage(
  role: MessageRole,
  kind: MessageKind,
  text: string,
  options?: { pending?: boolean },
): ChatMessage {
  const msg: ChatMessage = {
    id: uid(),
    role,
    kind,
    text,
    timestamp: Date.now(),
    pending: options?.pending,
  };
  messages = [...messages, msg];
  notify();
  return msg;
}

/** Update an existing message by id (e.g. resolve a pending agent response). */
export function updateMessage(
  id: string,
  patch: Partial<Pick<ChatMessage, 'text' | 'pending'>>,
): void {
  messages = messages.map((m) => (m.id === id ? { ...m, ...patch } : m));
  notify();
}

/** Remove all messages (useful for "clear session"). */
export function clearMessages(): void {
  messages = [];
  notify();
}
