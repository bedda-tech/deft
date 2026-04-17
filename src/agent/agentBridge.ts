/**
 * Agent bridge.
 *
 * Receives a text command from the chat UI and drives the agent loop:
 *   1. Add a "thinking" pending message
 *   2. Build a provider (CloudProvider when fallback is enabled, stub otherwise)
 *   3. Run AgentLoop from react-native-device-agent, streaming events to the chat store
 *   4. Resolve the pending message with the final summary
 *
 * Falls back to a canned stub response when react-native-device-agent or
 * react-native-accessibility-controller are not linked (simulator, tests).
 */

import {
  addMessage,
  updateMessage,
} from '../store/chatStore';
import { getSettings } from '../store/settingsStore';
import { addSession, type SessionOutcome } from '../store/historyStore';
import { agentStarted, agentStepped, agentStopped } from '../store/agentStore';

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

let _stopped = false;

/**
 * Signal the agent to stop after its current step.
 */
export function stopAgent(): void {
  _stopped = true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function processCommand(command: string): Promise<void> {
  _stopped = false;
  agentStarted(command);
  const thinkingMsg = addMessage('agent', 'text', 'Thinking...', { pending: true });

  let outcome: SessionOutcome = 'complete';
  let actions: string[] = [];
  let summary = '';

  try {
    const result = await runAgentLoop(command, thinkingMsg.id);
    actions = result.actions;
    outcome = result.outcome;
    summary = result.summary;
  } catch (err) {
    outcome = 'error';
    summary = `Error: ${err instanceof Error ? err.message : String(err)}`;
    updateMessage(thinkingMsg.id, { text: summary, pending: false });
  } finally {
    agentStopped();
  }

  addSession(command, actions, outcome, summary);
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

interface LoopResult {
  actions: string[];
  outcome: SessionOutcome;
  summary: string;
}

async function runAgentLoop(command: string, thinkingMsgId: string): Promise<LoopResult> {
  const settings = getSettings();

  // Try the real AgentLoop from react-native-device-agent first.
  // Falls back to the stub if the library or native module isn't available.
  try {
    return await runRealAgentLoop(command, thinkingMsgId, settings);
  } catch {
    return runStubAgentLoop(command, thinkingMsgId, settings.maxSteps);
  }
}

// ---------------------------------------------------------------------------
// Real agent loop (react-native-device-agent)
// ---------------------------------------------------------------------------

async function runRealAgentLoop(
  command: string,
  thinkingMsgId: string,
  settings: ReturnType<typeof getSettings>,
): Promise<LoopResult> {
  // Lazy-require so the app compiles without the package linked.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const deviceAgent = require('react-native-device-agent') as {
    AgentLoop: new (options: {
      provider: unknown;
      maxSteps: number;
      settleMs: number;
    }) => {
      run: (task: string) => AsyncGenerator<AgentEvent>;
      abort: () => void;
    };
    CloudProvider: new (options: {
      apiKey: string;
      model: string;
      baseUrl?: string;
      apiFormat?: 'openai' | 'anthropic';
    }) => unknown;
  };

  const provider = buildProvider(deviceAgent.CloudProvider, settings);
  const loop = new deviceAgent.AgentLoop({
    provider,
    maxSteps: settings.maxSteps,
    settleMs: settings.settleMs,
  });

  const actions: string[] = [];
  let finalSummary: string | null = null;
  let outcome: SessionOutcome = 'complete';

  for await (const event of loop.run(command)) {
    if (_stopped) {
      loop.abort();
      finalSummary = 'Stopped.';
      outcome = 'stopped';
      break;
    }

    if (event.type === 'action') {
      const text = formatAction(event.tool, event.args);
      addMessage('agent', 'action', text);
      actions.push(text);
    } else if (event.type === 'observation') {
      addMessage('agent', 'screen', `Step ${event.step} — screen updated`);
      agentStepped(event.step, event.screenState);
    } else if (event.type === 'thinking' && event.content) {
      // Don't emit thinking as a separate bubble; let the pending message show it.
    } else if (event.type === 'complete') {
      finalSummary = event.result;
      outcome = 'complete';
    } else if (event.type === 'error') {
      finalSummary = `Error: ${event.error.message}`;
      outcome = 'error';
      break;
    } else if (event.type === 'max_steps_reached') {
      finalSummary = `Reached the ${settings.maxSteps}-step limit.`;
      outcome = 'complete';
    }
  }

  const summary = finalSummary ?? 'Done.';
  updateMessage(thinkingMsgId, { text: summary, pending: false });
  return { actions, outcome, summary };
}

// ---------------------------------------------------------------------------
// Provider construction
// ---------------------------------------------------------------------------

function buildProvider(
  CloudProvider: new (options: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    apiFormat?: 'openai' | 'anthropic';
  }) => unknown,
  settings: ReturnType<typeof getSettings>,
): unknown {
  if (settings.cloudFallback && settings.cloudApiKey) {
    const isAnthropic = settings.cloudModel.startsWith('claude');
    return new CloudProvider({
      apiKey: settings.cloudApiKey,
      model: settings.cloudModel,
      baseUrl: isAnthropic ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1',
      apiFormat: isAnthropic ? 'anthropic' : 'openai',
    });
  }
  // No valid provider configured -- throw so we fall back to stub.
  throw new Error('No provider configured. Enable cloud fallback and enter an API key in Settings.');
}

// ---------------------------------------------------------------------------
// Event type shapes (minimal, matches device-agent AgentEvent)
// ---------------------------------------------------------------------------

type AgentEvent =
  | { type: 'thinking'; content: string }
  | { type: 'action'; tool: string; args: Record<string, unknown> }
  | { type: 'observation'; screenState: string; step: number }
  | { type: 'complete'; result: string }
  | { type: 'error'; error: Error }
  | { type: 'max_steps_reached' };

function formatAction(tool: string, args: Record<string, unknown>): string {
  const argStr = Object.entries(args)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(', ');
  return argStr ? `${tool}(${argStr})` : tool;
}

// ---------------------------------------------------------------------------
// Stub (dev / simulator fallback)
// ---------------------------------------------------------------------------

async function runStubAgentLoop(
  command: string,
  thinkingMsgId: string,
  maxSteps: number,
): Promise<LoopResult> {
  const steps = await stubAgentSteps(command);

  let stepsTaken = 0;
  const actions: string[] = [];
  let finalResponse: string | null = null;
  let outcome: SessionOutcome = 'complete';

  for (const step of steps) {
    if (_stopped) {
      finalResponse = 'Stopped.';
      outcome = 'stopped';
      break;
    }
    if (stepsTaken >= maxSteps) {
      finalResponse = `Reached the ${maxSteps}-step limit.`;
      break;
    }
    if (step.kind === 'response') {
      finalResponse = step.text;
    } else {
      addMessage('agent', step.kind, step.text);
      if (step.kind === 'action') {
        actions.push(step.text);
        stepsTaken++;
        agentStepped(stepsTaken);
        await delay(200);
      }
    }
  }

  const summary = finalResponse ?? 'Done.';
  updateMessage(thinkingMsgId, { text: summary, pending: false });
  return { actions, outcome, summary };
}

interface StubStep {
  kind: 'action' | 'screen' | 'response';
  text: string;
}

async function stubAgentSteps(command: string): Promise<StubStep[]> {
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

  return [
    { kind: 'action', text: `Processing: "${command}"` },
    { kind: 'response', text: `I received your command: "${command}". Download the Gemma 4 model or enable cloud fallback in Settings to execute tasks on your phone.` },
  ];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
