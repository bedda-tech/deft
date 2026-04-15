/**
 * Agent bridge.
 *
 * Receives a text command from the chat UI and drives the agent loop:
 *   1. Add a "thinking" pending message
 *   2. Invoke the local LLM (react-native-executorch) with the command
 *   3. As the agent produces steps, emit action / screen messages
 *   4. Resolve the pending message with the final summary
 *
 * When the LLM native module is not linked (simulator, web, tests), the bridge
 * runs a stub that echoes back a canned response so the UI stays fully
 * interactive.
 */

import {
  addMessage,
  updateMessage,
} from '../store/chatStore';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process a user command through the agent loop.
 * This is an async fire-and-forget from the UI perspective.
 */
export async function processCommand(command: string): Promise<void> {
  // Add a pending "thinking" agent message immediately
  const thinkingMsg = addMessage('agent', 'text', 'Thinking...', { pending: true });

  try {
    await runAgentLoop(command, thinkingMsg.id);
  } catch (err) {
    updateMessage(thinkingMsg.id, {
      text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      pending: false,
    });
  }
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

interface AgentStep {
  kind: 'action' | 'screen' | 'response';
  text: string;
}

async function runAgentLoop(command: string, thinkingMsgId: string): Promise<void> {
  let llmAvailable = false;
  let steps: AgentStep[] = [];

  try {
    steps = await invokeLocalLLM(command);
    llmAvailable = true;
  } catch {
    steps = await stubAgentSteps(command);
  }

  void llmAvailable; // used implicitly by the branch above

  // Emit each step as a chat message
  let finalResponse: string | null = null;

  for (const step of steps) {
    if (step.kind === 'response') {
      finalResponse = step.text;
    } else {
      addMessage('agent', step.kind, step.text);
    }
  }

  // Resolve the thinking placeholder
  updateMessage(thinkingMsgId, {
    text: finalResponse ?? 'Done.',
    pending: false,
  });
}

// ---------------------------------------------------------------------------
// Local LLM integration (react-native-executorch)
// ---------------------------------------------------------------------------

async function invokeLocalLLM(command: string): Promise<AgentStep[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const executorch = require('react-native-executorch') as {
    LLMModule?: {
      generate: (prompt: string) => Promise<string>;
    };
  };

  if (!executorch.LLMModule) {
    throw new Error('LLMModule not available');
  }

  const systemPrompt = buildSystemPrompt();
  const fullPrompt = `${systemPrompt}\n\nUser: ${command}\nAgent:`;
  const rawResponse = await executorch.LLMModule.generate(fullPrompt);

  return parseAgentResponse(rawResponse);
}

/**
 * Parse a structured LLM response into discrete steps.
 *
 * Expected format (agent is instructed to emit this):
 *   ACTION: Opened Chrome
 *   SCREEN: Chrome – New Tab
 *   ACTION: Tapped address bar
 *   RESPONSE: Searching for the weather in Chrome now.
 */
function parseAgentResponse(raw: string): AgentStep[] {
  const steps: AgentStep[] = [];
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (line.startsWith('ACTION:')) {
      steps.push({ kind: 'action', text: line.slice('ACTION:'.length).trim() });
    } else if (line.startsWith('SCREEN:')) {
      steps.push({ kind: 'screen', text: `Screen: ${line.slice('SCREEN:'.length).trim()}` });
    } else if (line.startsWith('RESPONSE:')) {
      steps.push({ kind: 'response', text: line.slice('RESPONSE:'.length).trim() });
    }
  }

  // If nothing parsed, treat the whole response as a plain response
  if (steps.length === 0) {
    steps.push({ kind: 'response', text: raw.trim() });
  }

  return steps;
}

function buildSystemPrompt(): string {
  return `You are Deft, an on-device AI agent that controls an Android phone via the Accessibility Service.
When given a command, output a series of steps using this exact format:
ACTION: <what you did>
SCREEN: <current app and screen name>
RESPONSE: <a brief natural-language summary for the user>
Only output these prefixed lines, nothing else.`;
}

// ---------------------------------------------------------------------------
// Stub (dev / simulator fallback)
// ---------------------------------------------------------------------------

/**
 * Produces canned steps when the LLM is not available.
 * Gives a realistic sense of what the real agent loop will look like.
 */
async function stubAgentSteps(command: string): Promise<AgentStep[]> {
  // Simulate a short thinking delay
  await delay(600);

  const lower = command.toLowerCase();

  if (lower.includes('settings') || lower.includes('wi-fi') || lower.includes('wifi')) {
    return [
      { kind: 'action', text: 'Opening Settings app' },
      { kind: 'screen', text: 'Screen: Settings – Home' },
      { kind: 'action', text: 'Scrolling to Network & Internet' },
      { kind: 'action', text: 'Tapped Wi-Fi' },
      { kind: 'screen', text: 'Screen: Settings – Wi-Fi' },
      { kind: 'action', text: 'Toggled Wi-Fi switch to ON' },
      { kind: 'response', text: 'Wi-Fi is now turned on.' },
    ];
  }

  if (lower.includes('chrome') || lower.includes('search') || lower.includes('google')) {
    return [
      { kind: 'action', text: 'Opening Chrome' },
      { kind: 'screen', text: 'Screen: Chrome – New Tab' },
      { kind: 'action', text: 'Tapped address bar' },
      { kind: 'action', text: `Typed "${command}"` },
      { kind: 'action', text: 'Pressed Search' },
      { kind: 'screen', text: 'Screen: Chrome – Search Results' },
      { kind: 'response', text: `Searched for "${command}" in Chrome.` },
    ];
  }

  if (lower.includes('message') || lower.includes('whatsapp') || lower.includes('text')) {
    return [
      { kind: 'action', text: 'Opening Messages' },
      { kind: 'screen', text: 'Screen: Messages – Inbox' },
      { kind: 'action', text: 'Tapped compose button' },
      { kind: 'action', text: 'Typed the message' },
      { kind: 'action', text: 'Tapped Send' },
      { kind: 'response', text: 'Message sent.' },
    ];
  }

  // Generic fallback
  return [
    { kind: 'action', text: `Processing: "${command}"` },
    { kind: 'response', text: `I received your command: "${command}". The AI model needs to be downloaded to execute tasks on your phone.` },
  ];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
