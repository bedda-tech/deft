jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import type { WatchdogConfig } from '../watchdogStore';

// watchdogStore keeps its state in module-level variables (a singleton),
// so each test gets a fresh module instance rather than sharing state.
let store: typeof import('../watchdogStore');

beforeEach(() => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  store = require('../watchdogStore');
});

describe('createWatchdog', () => {
  it('applies documented defaults', () => {
    const config = store.createWatchdog('Uber is within 5 minutes', 60_000);
    expect(config.task).toBe('Uber is within 5 minutes');
    expect(config.intervalMs).toBe(60_000);
    expect(config.toolPreset).toBe('read_only');
    expect(config.maxTicks).toBe(50);
    expect(config.status).toBe('active');
    expect(config.triggerCount).toBe(0);
    expect(config.lastRunAt).toBeNull();
    expect(config.lastResult).toBeNull();
    expect(typeof config.id).toBe('string');
    expect(config.id.length).toBeGreaterThan(0);
  });

  it('accepts overridden toolPreset and maxTicks', () => {
    const config = store.createWatchdog('task', 1_000, 'navigation', 5);
    expect(config.toolPreset).toBe('navigation');
    expect(config.maxTicks).toBe(5);
  });

  it('prepends new watchdogs, visible via getWatchdogs/getActiveWatchdogs', () => {
    const a = store.createWatchdog('a', 1_000);
    const b = store.createWatchdog('b', 1_000);
    expect(store.getWatchdogs().map((w) => w.id)).toEqual([b.id, a.id]);
    expect(store.getActiveWatchdogs().map((w) => w.id).sort()).toEqual([a.id, b.id].sort());
  });
});

describe('recordWatchdogTick', () => {
  it('increments triggerCount and stamps lastRunAt', () => {
    const config = store.createWatchdog('task', 1_000);
    expect(config.triggerCount).toBe(0);
    expect(config.lastRunAt).toBeNull();

    store.recordWatchdogTick(config.id);
    let updated = store.getWatchdogs().find((w) => w.id === config.id)!;
    expect(updated.triggerCount).toBe(1);
    expect(updated.lastRunAt).toEqual(expect.any(Number));

    store.recordWatchdogTick(config.id);
    updated = store.getWatchdogs().find((w) => w.id === config.id)!;
    expect(updated.triggerCount).toBe(2);
  });

  it('is a no-op for an unknown id', () => {
    const config = store.createWatchdog('task', 1_000);
    store.recordWatchdogTick('does-not-exist');
    const updated = store.getWatchdogs().find((w) => w.id === config.id)!;
    expect(updated.triggerCount).toBe(0);
  });
});

describe('recordWatchdogResult', () => {
  it('persists what the agent observed for the next tick to compare against', () => {
    const config = store.createWatchdog('task', 1_000);
    store.recordWatchdogResult(config.id, 'Package is In Transit');
    const updated = store.getWatchdogs().find((w) => w.id === config.id)!;
    expect(updated.lastResult).toBe('Package is In Transit');
  });
});

describe('status transitions', () => {
  it('triggerWatchdog marks status triggered, stamps lastRunAt, and drops it from active', () => {
    const config = store.createWatchdog('task', 1_000);
    store.triggerWatchdog(config.id);
    const updated = store.getWatchdogs().find((w) => w.id === config.id)!;
    expect(updated.status).toBe('triggered');
    expect(updated.lastRunAt).toEqual(expect.any(Number));
    expect(store.getActiveWatchdogs()).toHaveLength(0);
  });

  it('cancelWatchdog marks status cancelled and drops it from active', () => {
    const config = store.createWatchdog('task', 1_000);
    store.cancelWatchdog(config.id);
    const updated = store.getWatchdogs().find((w) => w.id === config.id)!;
    expect(updated.status).toBe('cancelled');
    expect(store.getActiveWatchdogs()).toHaveLength(0);
  });

  it('pauseWatchdog / resumeWatchdog round-trip through active <-> paused', () => {
    const config = store.createWatchdog('task', 1_000);

    store.pauseWatchdog(config.id);
    expect(store.getWatchdogs().find((w) => w.id === config.id)!.status).toBe('paused');
    expect(store.getActiveWatchdogs()).toHaveLength(0);

    store.resumeWatchdog(config.id);
    expect(store.getWatchdogs().find((w) => w.id === config.id)!.status).toBe('active');
    expect(store.getActiveWatchdogs()).toHaveLength(1);
  });
});

describe('clearFinishedWatchdogs', () => {
  it('removes cancelled and triggered watchdogs but keeps active and paused ones', () => {
    const active = store.createWatchdog('active', 1_000);
    const paused = store.createWatchdog('paused', 1_000);
    const triggered = store.createWatchdog('triggered', 1_000);
    const cancelled = store.createWatchdog('cancelled', 1_000);

    store.pauseWatchdog(paused.id);
    store.triggerWatchdog(triggered.id);
    store.cancelWatchdog(cancelled.id);

    store.clearFinishedWatchdogs();

    const remainingIds = store.getWatchdogs().map((w) => w.id).sort();
    expect(remainingIds).toEqual([active.id, paused.id].sort());
  });
});

describe('subscribeWatchdogs', () => {
  it('emits the current snapshot immediately, then on every mutation, and stops after unsubscribe', () => {
    const received: WatchdogConfig[][] = [];
    const unsubscribe = store.subscribeWatchdogs((watchdogs) => received.push(watchdogs));
    expect(received).toEqual([[]]);

    const config = store.createWatchdog('task', 1_000);
    expect(received).toHaveLength(2);
    expect(received[1]).toEqual([config]);

    unsubscribe();
    store.recordWatchdogTick(config.id);
    expect(received).toHaveLength(2);
  });
});
