jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native', () => ({
  NativeModules: {},
  Platform: { OS: 'ios' },
}));

const mockStartForegroundService = jest.fn();
const mockUpdateForegroundService = jest.fn();
const mockStopForegroundService = jest.fn();
const mockCompleteForegroundService = jest.fn();
jest.mock('../foregroundService', () => ({
  startForegroundService: (...args: unknown[]) => mockStartForegroundService(...args),
  updateForegroundService: (...args: unknown[]) => mockUpdateForegroundService(...args),
  stopForegroundService: (...args: unknown[]) => mockStopForegroundService(...args),
  completeForegroundService: (...args: unknown[]) => mockCompleteForegroundService(...args),
}));

const mockGetGenerateFn = jest.fn(() => async () => 'ok');
jest.mock('../llmBridge', () => ({
  getGenerateFn: () => mockGetGenerateFn(),
  getGenerateWithImageFn: () => null,
}));

jest.mock('../../store/settingsStore', () => ({
  getSettings: () => ({
    cloudFallback: false,
    cloudApiKey: '',
    cloudModel: '',
    cloudProvider: 'auto',
    maxSteps: 5,
    settleMs: 100,
    useVision: false,
  }),
}));

// react-native-device-agent is dynamically require()'d inside watchdogBridge,
// per the design doc's own instruction to mock AgentLoop for onTick tests.
let mockRunEvents: Array<
  { type: 'complete'; result: string } | { type: 'failed'; reason: string }
> = [];
const mockAgentLoopRun = jest.fn();
jest.mock(
  'react-native-device-agent',
  () => ({
    AgentLoop: jest.fn().mockImplementation(() => ({
      run: mockAgentLoopRun.mockImplementation(async function* () {
        for (const event of mockRunEvents) {
          yield event;
        }
      }),
      abort: jest.fn(),
    })),
    CloudProvider: jest.fn(),
    GemmaProvider: jest.fn((opts: unknown) => ({ __type: 'gemma', ...(opts as object) })),
    FallbackProvider: jest.fn(),
  }),
  { virtual: true },
);

import * as watchdogStore from '../../store/watchdogStore';
import * as watchdogBridge from '../watchdogBridge';

const flush = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  for (const w of watchdogStore.getWatchdogs()) {
    watchdogBridge.stopWatchdog(w.id);
  }
  watchdogStore.clearFinishedWatchdogs();
  watchdogBridge.setAgentBusy(false);
  mockRunEvents = [];
  jest.clearAllMocks();
});

describe('parseWatchCommand', () => {
  it('parses minute units (m / min)', () => {
    expect(watchdogBridge.parseWatchCommand('/watch every 5m: Uber is within 5 minutes')).toEqual({
      intervalMs: 300_000,
      task: 'Uber is within 5 minutes',
    });
    expect(watchdogBridge.parseWatchCommand('/watch every 5min: Uber is within 5 minutes')).toEqual({
      intervalMs: 300_000,
      task: 'Uber is within 5 minutes',
    });
  });

  it('parses second units (s / sec)', () => {
    expect(watchdogBridge.parseWatchCommand('/watch every 30s: foo')).toEqual({
      intervalMs: 30_000,
      task: 'foo',
    });
    expect(watchdogBridge.parseWatchCommand('/watch every 30sec: foo')).toEqual({
      intervalMs: 30_000,
      task: 'foo',
    });
  });

  it('parses hour units (h / hr)', () => {
    expect(watchdogBridge.parseWatchCommand('/watch every 2h: foo')).toEqual({
      intervalMs: 7_200_000,
      task: 'foo',
    });
    expect(watchdogBridge.parseWatchCommand('/watch every 2hr: foo')).toEqual({
      intervalMs: 7_200_000,
      task: 'foo',
    });
  });

  it('parses fractional intervals', () => {
    expect(watchdogBridge.parseWatchCommand('/watch every 1.5m: foo')).toEqual({
      intervalMs: 90_000,
      task: 'foo',
    });
  });

  it('accepts a dash separator or no separator at all', () => {
    expect(watchdogBridge.parseWatchCommand('/watch every 5m - foo')).toEqual({
      intervalMs: 300_000,
      task: 'foo',
    });
    expect(watchdogBridge.parseWatchCommand('/watch every 5m foo')).toEqual({
      intervalMs: 300_000,
      task: 'foo',
    });
  });

  it('rejects text with no /watch every prefix', () => {
    expect(watchdogBridge.parseWatchCommand('check on Uber')).toBeNull();
  });

  it('rejects a spelled-out unit word that only shares a prefix with a real unit (task #227 regression)', () => {
    // "minutes" must NOT be parsed as unit "m" -- WATCH_RE requires a word
    // boundary after the unit so "5 minutes" doesn't become intervalMs=300000
    // with task="inutes: foo".
    expect(watchdogBridge.parseWatchCommand('/watch every 5 minutes: foo')).toBeNull();
  });

  it('rejects an unsupported unit', () => {
    expect(watchdogBridge.parseWatchCommand('/watch every 5 days: foo')).toBeNull();
  });

  it('rejects a command with no task text after the interval', () => {
    expect(watchdogBridge.parseWatchCommand('/watch every 5m:')).toBeNull();
    expect(watchdogBridge.parseWatchCommand('/watch every 5m')).toBeNull();
  });

  it('rejects a non-numeric interval', () => {
    expect(watchdogBridge.parseWatchCommand('/watch every five minutes: foo')).toBeNull();
  });
});

describe('_tick via startWatchdog / restoreWatchdogs (mocked AgentLoop)', () => {
  it('runs the agent loop and marks the watchdog triggered on task_complete', async () => {
    mockRunEvents = [{ type: 'complete', result: 'Uber arriving in 3 minutes' }];
    const config = watchdogBridge.startWatchdog('Uber is within 5 minutes', 60_000)!;
    expect(config).not.toBeNull();

    await flush(700); // let the initial 500ms first-tick fire and resolve

    const stored = watchdogStore.getWatchdogs().find((w) => w.id === config.id)!;
    expect(stored.status).toBe('triggered');
    expect(stored.lastResult).toBe('Uber arriving in 3 minutes');
    expect(mockAgentLoopRun).toHaveBeenCalledTimes(1);
    expect(mockCompleteForegroundService).toHaveBeenCalledWith(
      expect.stringContaining('Condition met: Uber is within 5 minutes'),
      true,
    );
  });

  it('records not_met and the observed reason on task_failed, keeping the watchdog active', async () => {
    mockRunEvents = [{ type: 'failed', reason: 'Uber is 12 minutes away' }];
    const config = watchdogBridge.startWatchdog('Uber is within 5 minutes', 60_000)!;

    await flush(700);

    const stored = watchdogStore.getWatchdogs().find((w) => w.id === config.id)!;
    expect(stored.status).toBe('active');
    expect(stored.triggerCount).toBe(1);
    expect(stored.lastResult).toBe('Uber is 12 minutes away');
  });

  it('auto-cancels once triggerCount has reached maxTicks, without running the agent loop', async () => {
    const config = watchdogStore.createWatchdog('check something', 50, 'read_only', 1);
    watchdogStore.recordWatchdogTick(config.id); // triggerCount -> 1, equal to maxTicks

    watchdogBridge.restoreWatchdogs();
    await flush(200); // let the 50ms interval fire

    const stored = watchdogStore.getWatchdogs().find((w) => w.id === config.id)!;
    expect(stored.status).toBe('cancelled');
    expect(mockAgentLoopRun).not.toHaveBeenCalled();
    expect(mockCompleteForegroundService).toHaveBeenCalledWith(
      expect.stringContaining('expired after 1 checks'),
      true,
    );
  });

  it('skips a tick while the regular (non-watchdog) agent is busy', async () => {
    watchdogBridge.setAgentBusy(true);
    const config = watchdogBridge.startWatchdog('check something', 10_000)!;
    expect(config).not.toBeNull();

    await flush(700);

    const stored = watchdogStore.getWatchdogs().find((w) => w.id === config.id)!;
    expect(stored.status).toBe('active');
    expect(stored.triggerCount).toBe(0);
    expect(mockAgentLoopRun).not.toHaveBeenCalled();
  });
});
