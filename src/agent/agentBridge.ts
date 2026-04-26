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

import { Vibration } from 'react-native';
import {
  addMessage,
  updateMessage,
} from '../store/chatStore';
import { getSettings } from '../store/settingsStore';
import { addSession, type SessionOutcome } from '../store/historyStore';
import { agentStarted, agentStepped, agentStopped } from '../store/agentStore';
import { getGenerateFn, getGenerateWithImageFn } from './llmBridge';

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

  // Try the real AgentLoop (or TaskPlanner in plan mode) first.
  // Falls back to the stub if the library or native module isn't available.
  try {
    if (settings.planMode) {
      return await runRealPlannerLoop(command, thinkingMsgId, settings);
    }
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
      useVision?: boolean;
      retryOnError?: number;
      systemPromptSuffix?: string;
      timeoutMs?: number;
      maxHistoryItems?: number;
      maxScreenLength?: number;
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

  const provider = buildProvider(deviceAgent, settings);
  const loop = new deviceAgent.AgentLoop({
    provider,
    maxSteps: settings.maxSteps,
    settleMs: settings.settleMs,
    useVision: settings.useVision,
    retryOnError: settings.retryOnError > 0 ? settings.retryOnError : undefined,
    systemPromptSuffix: settings.customInstructions || undefined,
    timeoutMs: settings.timeoutSecs > 0 ? settings.timeoutSecs * 1000 : undefined,
    maxHistoryItems: settings.maxHistoryItems > 0 ? settings.maxHistoryItems : undefined,
    maxScreenLength: settings.maxScreenLength > 0 ? settings.maxScreenLength : 0,
    toolFilter: resolveToolFilter(settings.toolPreset),
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
      Vibration.vibrate(50);
      const text = formatAction(event.tool, event.args);
      addMessage('agent', 'action', text);
      actions.push(text);
    } else if (event.type === 'observation') {
      addMessage('agent', 'screen', `Step ${event.step} — screen updated`);
      agentStepped(event.step, event.screenState);
    } else if (event.type === 'thinking' && event.content) {
      // Show live thinking content in the pending bubble (truncated for space).
      const preview = event.content.length > 120
        ? event.content.slice(0, 117) + '…'
        : event.content;
      updateMessage(thinkingMsgId, { text: preview, pending: true });
    } else if (event.type === 'complete') {
      finalSummary = event.result;
      outcome = 'complete';
    } else if (event.type === 'failed') {
      finalSummary = `Could not complete: ${event.reason}`;
      outcome = 'error';
    } else if (event.type === 'error') {
      finalSummary = `Error: ${event.error.message}`;
      outcome = 'error';
      break;
    } else if (event.type === 'max_steps_reached') {
      finalSummary = `Reached the ${settings.maxSteps}-step limit.`;
      outcome = 'complete';
    } else if (event.type === 'timeout') {
      finalSummary = 'Timed out.';
      outcome = 'error';
    }
  }

  const summary = finalSummary ?? 'Done.';
  updateMessage(thinkingMsgId, { text: summary, pending: false });
  return { actions, outcome, summary };
}

// ---------------------------------------------------------------------------
// Real planner loop (react-native-device-agent TaskPlanner)
// ---------------------------------------------------------------------------

async function runRealPlannerLoop(
  command: string,
  thinkingMsgId: string,
  settings: ReturnType<typeof getSettings>,
): Promise<LoopResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const deviceAgent = require('react-native-device-agent') as {
    TaskPlanner: new (options: {
      provider: unknown;
      maxSteps: number;
      settleMs: number;
      useVision?: boolean;
      retryOnError?: number;
      systemPromptSuffix?: string;
      timeoutMs?: number;
      maxHistoryItems?: number;
      maxScreenLength?: number;
      maxSubTasks?: number;
      toolFilter?: string[];
    }) => {
      run: (task: string) => AsyncGenerator<PlannerEvent>;
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

  const provider = buildProvider(deviceAgent, settings);
  const planner = new deviceAgent.TaskPlanner({
    provider,
    maxSteps: settings.maxSteps,
    settleMs: settings.settleMs,
    useVision: settings.useVision,
    retryOnError: settings.retryOnError > 0 ? settings.retryOnError : undefined,
    systemPromptSuffix: settings.customInstructions || undefined,
    timeoutMs: settings.timeoutSecs > 0 ? settings.timeoutSecs * 1000 : undefined,
    maxHistoryItems: settings.maxHistoryItems > 0 ? settings.maxHistoryItems : undefined,
    maxScreenLength: settings.maxScreenLength > 0 ? settings.maxScreenLength : 0,
    maxSubTasks: settings.maxSubTasks > 0 ? settings.maxSubTasks : undefined,
    toolFilter: resolveToolFilter(settings.toolPreset),
  });

  const actions: string[] = [];
  let finalSummary: string | null = null;
  let outcome: SessionOutcome = 'complete';
  let totalSubtasks = 0;

  for await (const event of planner.run(command)) {
    if (_stopped) {
      finalSummary = 'Stopped.';
      outcome = 'stopped';
      break;
    }

    if (event.type === 'plan') {
      totalSubtasks = event.subtasks.length;
      const planText = event.subtasks
        .map((s) => `${s.index + 1}. ${s.description}`)
        .join('\n');
      updateMessage(thinkingMsgId, { text: `Plan:\n${planText}`, pending: true });
    } else if (event.type === 'subtask_start') {
      addMessage(
        'agent', 'screen',
        `Step ${event.subtask.index + 1}/${totalSubtasks}: ${event.subtask.description}`,
      );
    } else if (event.type === 'agent_event') {
      const inner = event.event;
      if (inner.type === 'action') {
        Vibration.vibrate(50);
        const text = formatAction(inner.tool, inner.args);
        addMessage('agent', 'action', text);
        actions.push(text);
      } else if (inner.type === 'observation') {
        agentStepped(inner.step, inner.screenState);
      } else if (inner.type === 'thinking' && inner.content) {
        const preview = inner.content.length > 80
          ? inner.content.slice(0, 77) + '…'
          : inner.content;
        updateMessage(thinkingMsgId, { text: preview, pending: true });
      }
    } else if (event.type === 'subtask_complete') {
      addMessage(
        'agent', 'action',
        `Step ${event.subtask.index + 1} done — ${event.result}`,
      );
    } else if (event.type === 'subtask_error') {
      addMessage(
        'agent', 'action',
        `Step ${event.subtask.index + 1} failed: ${event.error.message}`,
      );
    } else if (event.type === 'complete') {
      finalSummary = event.result;
      outcome = 'complete';
    } else if (event.type === 'error') {
      finalSummary = `Error: ${event.error.message}`;
      outcome = 'error';
      break;
    }
  }

  const summary = finalSummary ?? 'Done.';
  updateMessage(thinkingMsgId, { text: summary, pending: false });
  return { actions, outcome, summary };
}

// ---------------------------------------------------------------------------
// Agent system prompt
// ---------------------------------------------------------------------------

const AGENT_SYSTEM_PROMPT = `You are Deft, an on-device AI phone agent. \
Your job is to control an Android phone on behalf of the user by reading the \
screen and executing actions.

Guidelines:
- Use the read_screen tool first to understand what is on screen before acting.
- Prefer tapping by nodeId when available; fall back to coordinates only if needed.
- After each action wait for the screen to update before continuing.
- Call task_complete when the task is fully done with a concise 1–2 sentence summary.
- If a step fails, try an alternative approach before giving up.
- Call task_failed (with a reason) if the task is impossible or blocked after reasonable attempts. \
Prefer this over running until the step limit.
- Never perform destructive actions (deleting accounts, purchasing items, sending messages) \
unless explicitly confirmed by the user in the task description.`;

function buildSystemPrompt(customInstructions: string): string {
  if (!customInstructions.trim()) return AGENT_SYSTEM_PROMPT;
  return `${AGENT_SYSTEM_PROMPT}\n\nAdditional instructions:\n${customInstructions.trim()}`;
}

// ---------------------------------------------------------------------------
// Tool preset resolution
// ---------------------------------------------------------------------------

function resolveToolFilter(preset: string): string[] | undefined {
  switch (preset) {
    case 'navigation':
      return ['tap', 'long_press', 'swipe', 'scroll', 'global_action', 'open_app', 'find_node', 'wait', 'read_screen'];
    case 'text_input':
      return ['tap', 'type_text', 'find_node', 'scroll', 'read_screen'];
    case 'read_only':
      return ['read_screen', 'screenshot'];
    case 'in_app':
      return ['tap', 'long_press', 'type_text', 'swipe', 'scroll', 'find_node', 'wait', 'read_screen', 'screenshot'];
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Provider construction
// ---------------------------------------------------------------------------

function buildProvider(
  deviceAgent: {
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
  },
  settings: ReturnType<typeof getSettings>,
): unknown {
  const generateFn = getGenerateFn();
  const hasCloud = settings.cloudFallback && !!settings.cloudApiKey;

  const buildCloudProvider = () => {
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
      // 'auto': detect by model name
      const isAnthropic = settings.cloudModel.startsWith('claude');
      baseUrl = isAnthropic ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1';
      apiFormat = isAnthropic ? 'anthropic' : 'openai';
    }
    return new deviceAgent.CloudProvider({
      apiKey: settings.cloudApiKey,
      model: settings.cloudModel,
      baseUrl,
      apiFormat,
      system: buildSystemPrompt(settings.customInstructions),
    });
  };

  const buildGemmaProvider = () =>
    new deviceAgent.GemmaProvider({
      generateFn: generateFn!,
      generateWithImageFn: getGenerateWithImageFn() ?? undefined,
    });

  // Both on-device and cloud: use FallbackProvider (prefers on-device, auto-falls back to cloud).
  if (generateFn && hasCloud) {
    return new deviceAgent.FallbackProvider({
      onDevice: buildGemmaProvider(),
      cloud: buildCloudProvider(),
    });
  }

  // Only cloud configured.
  if (hasCloud) {
    return buildCloudProvider();
  }

  // Only on-device Gemma available.
  if (generateFn) {
    return buildGemmaProvider();
  }

  // Nothing available — let the caller fall through to the stub.
  throw new Error(
    'No provider configured. Download the Gemma 4 model from Settings, or enable cloud fallback.',
  );
}

// ---------------------------------------------------------------------------
// Event type shapes (minimal, matches device-agent types)
// ---------------------------------------------------------------------------

type AgentEvent =
  | { type: 'thinking'; content: string }
  | { type: 'action'; tool: string; args: Record<string, unknown> }
  | { type: 'observation'; screenState: string; step: number }
  | { type: 'complete'; result: string }
  | { type: 'failed'; reason: string }
  | { type: 'error'; error: Error }
  | { type: 'max_steps_reached' }
  | { type: 'timeout' };

interface SubTask { index: number; description: string }

type PlannerEvent =
  | { type: 'plan'; subtasks: SubTask[] }
  | { type: 'subtask_start'; subtask: SubTask }
  | { type: 'subtask_complete'; subtask: SubTask; result: string }
  | { type: 'subtask_error'; subtask: SubTask; error: Error }
  | { type: 'agent_event'; subtask: SubTask; event: AgentEvent }
  | { type: 'complete'; result: string }
  | { type: 'error'; error: Error };

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
