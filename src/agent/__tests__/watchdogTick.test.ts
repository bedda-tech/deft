import { buildWatchdogContext, canStartWatchdog, deriveWatchdogOutcome, MAX_ACTIVE_WATCHDOGS } from '../watchdogTick';

describe('canStartWatchdog', () => {
  it('allows starting below the cap', () => {
    expect(canStartWatchdog(0)).toBe(true);
    expect(canStartWatchdog(MAX_ACTIVE_WATCHDOGS - 1)).toBe(true);
  });

  it('rejects starting at or above the cap (task #6414)', () => {
    expect(canStartWatchdog(MAX_ACTIVE_WATCHDOGS)).toBe(false);
    expect(canStartWatchdog(MAX_ACTIVE_WATCHDOGS + 1)).toBe(false);
  });

  it('respects a custom cap', () => {
    expect(canStartWatchdog(1, 1)).toBe(false);
    expect(canStartWatchdog(0, 1)).toBe(true);
  });
});

describe('buildWatchdogContext', () => {
  it('is empty before any tick has run', () => {
    expect(buildWatchdogContext({ lastResult: null })).toEqual({});
  });

  it('carries the previous result forward once one exists', () => {
    expect(buildWatchdogContext({ lastResult: 'Package is In Transit' })).toEqual({
      previous_check_result: 'Package is In Transit',
    });
  });
});

describe('deriveWatchdogOutcome', () => {
  it('maps task_complete to triggered, remembering the result', () => {
    expect(deriveWatchdogOutcome({ type: 'complete', result: 'Status changed to Out for delivery' })).toEqual({
      status: 'triggered',
      resultText: 'Status changed to Out for delivery',
    });
  });

  it('maps task_failed to not_met, remembering the observed reason', () => {
    expect(deriveWatchdogOutcome({ type: 'failed', reason: 'Package is In Transit' })).toEqual({
      status: 'not_met',
      resultText: 'Package is In Transit',
    });
  });
});

// Reproduces the FedEx status-change scenario from docs/watchdog-design.md
// (section 1): "/watch every 15m: FedEx status changed to Out for delivery"
// must only trigger on the tick where the status actually changes -- which
// requires each tick to see what the previous tick observed.
describe('watchdog tick state carried across runs (task #6420)', () => {
  it('only triggers once the observed status differs from the previous tick', () => {
    // Tick 1: no prior state yet, so no context is injected. The agent reads
    // the FedEx app, sees "In Transit", and cannot possibly know this is
    // unchanged from before -- it reports what it observed via task_failed.
    let lastResult: string | null = null;
    const tick1Context = buildWatchdogContext({ lastResult });
    expect(tick1Context).toEqual({});

    const tick1Outcome = deriveWatchdogOutcome({ type: 'failed', reason: 'Package is In Transit' });
    expect(tick1Outcome.status).toBe('not_met');
    lastResult = tick1Outcome.resultText;

    // Tick 2: the previous observation is now injected as context, so the
    // agent can compare. The status changed -> condition met.
    const tick2Context = buildWatchdogContext({ lastResult });
    expect(tick2Context).toEqual({ previous_check_result: 'Package is In Transit' });

    const tick2Outcome = deriveWatchdogOutcome({
      type: 'complete',
      result: 'Status changed to Out for delivery',
    });
    expect(tick2Outcome.status).toBe('triggered');
    lastResult = tick2Outcome.resultText;

    // Tick 3 (hypothetical -- production code stops the watchdog on first
    // trigger, but the state-carry logic itself must not re-fire just
    // because the status still matches the condition text): with the new
    // previous_check_result in context, an unchanged status is correctly
    // reported as not met, not as a repeat trigger.
    const tick3Context = buildWatchdogContext({ lastResult });
    expect(tick3Context).toEqual({ previous_check_result: 'Status changed to Out for delivery' });

    const tick3Outcome = deriveWatchdogOutcome({
      type: 'failed',
      reason: 'Still Out for delivery, no further change',
    });
    expect(tick3Outcome.status).toBe('not_met');
  });
});
