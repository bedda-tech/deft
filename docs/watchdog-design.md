# Watchdog Mode — Design Spec

Watchdog mode lets a user describe a condition and an interval; Deft then
runs the agent loop on that cadence and sends a notification the moment the
condition is true, without the user having to keep the app open.

---

## 1. User Stories

### Canonical example — Uber ETA

> "Check my Uber app every 2 minutes and notify me when the driver is within
> 5 minutes."

The agent opens the Uber app, reads the ETA from the screen, evaluates the
condition `"ETA ≤ 5 minutes"`, and either exits (condition false — try again
next tick) or fires a high-priority notification and cancels the watchdog.

### Additional use cases

**Package delivery**
> "Check the FedEx app every 15 minutes and notify me when my package status
> changes to 'Out for delivery' or 'Delivered'."

Frequency: ~15 min.  Typical duration: 4–8 hours.  Agent action: open app,
read status, compare to previous recorded status.

**Price / stock alert**
> "Open the Robinhood app every 5 minutes and notify me when NVDA crosses $150."

Frequency: 5 min.  Duration: trading hours (up to ~6.5 h).  Agent action:
open app or ticker widget, read current price.

---

## 2. Architecture

### Existing infrastructure

```
agentBridge.ts
  → startForegroundService(task)       // DeftAgentModule → DeftAgentService.ACTION_START
  → updateForegroundService(step)      // DeftAgentModule → DeftAgentService.ACTION_UPDATE
  → completeForegroundService(result)  // DeftAgentModule → DeftAgentService.ACTION_COMPLETE
  → stopForegroundService()            // DeftAgentModule → DeftAgentService.ACTION_STOP
```

`DeftAgentService.kt` (`plugins/android/DeftAgentService.kt`) is a standard
Android `Service` with foreground notification management. `DeftAgentModule.kt`
exposes `@ReactMethod` entries that JS calls via the `foregroundService.ts`
wrapper.

### New components required

```
src/store/watchdogStore.ts            — persists watchdog list to AsyncStorage
src/agent/watchdogBridge.ts           — schedules/cancels, runs each tick
plugins/android/DeftWatchdogReceiver.kt — BroadcastReceiver, wakes JS on tick
plugins/android/DeftWatchdogModule.kt  — schedules WorkManager from JS
plugins/withDeftWatchdog.js           — Expo config plugin that injects the above
```

### Data model

```ts
// src/store/watchdogStore.ts

export interface WatchdogConfig {
  id: string;           // uuid
  task: string;         // natural-language condition, e.g. "Uber is within 5 min"
  intervalMs: number;   // repeat interval, e.g. 120_000
  toolPreset?: string;  // optional tool restriction (default: 'read_only')
  createdAt: number;    // epoch ms
  lastRunAt: number | null;
  status: 'active' | 'paused' | 'triggered' | 'cancelled';
  triggerCount: number; // how many times the condition was checked
}
```

Persisted under the key `deft:watchdogs` in AsyncStorage as a JSON array.

### Control flow per tick

```
WorkManager fires DeftWatchdogReceiver (Kotlin)
  → sends Intent to DeftAgentService.ACTION_WATCHDOG_TICK
  → DeftAgentService forwards to JS via EventEmitter / DeviceEventEmitter
    (or calls DeftWatchdogModule.notifyTick(id))

JS watchdogBridge.onTick(id):
  1. Load WatchdogConfig from watchdogStore
  2. Verify status === 'active'
  3. Run AgentLoop with the condition task + toolPreset (read_only by default)
  4. If agent calls task_complete:
       - fire high-priority WATCHDOG_TRIGGERED notification via DeftAgentService
       - update status → 'triggered'
       - cancel the WorkManager job (DeftWatchdogModule.cancel(id))
  5. If agent calls task_failed / timeout / maxSteps:
       - no notification; increment triggerCount; update lastRunAt
       - WorkManager re-schedules next tick automatically (PeriodicWorkRequest)
```

### Changes to DeftAgentService.kt

Add two new actions to the existing `when` block:

```kotlin
ACTION_WATCHDOG_TICK -> {
    // Emit to React Native's event system so watchdogBridge.ts can respond
    val id = intent.getStringExtra(EXTRA_WATCHDOG_ID) ?: return START_NOT_STICKY
    // Use ReactInstanceManager to emit a DeviceEventEmitter event
    // (same pattern as react-native-push-notification)
}
ACTION_WATCHDOG_TRIGGERED -> {
    // Show a high-priority, full-screen-intent notification
    val description = intent.getStringExtra(EXTRA_DESCRIPTION) ?: ""
    createWatchdogTriggeredNotification(description)
    stopSelf()
}
```

Add constants:
```kotlin
const val ACTION_WATCHDOG_TICK      = "tech.bedda.deft.WATCHDOG_TICK"
const val ACTION_WATCHDOG_TRIGGERED = "tech.bedda.deft.WATCHDOG_TRIGGERED"
const val EXTRA_WATCHDOG_ID         = "watchdogId"
const val WATCHDOG_NOTIFICATION_ID  = 44
```

---

## 3. Scheduling

Three candidates, evaluated for correctness in Android background execution.

### Option A — WorkManager `PeriodicWorkRequest` (recommended)

```kotlin
// DeftWatchdogModule.kt
val request = PeriodicWorkRequestBuilder<WatchdogWorker>(intervalMs, TimeUnit.MILLISECONDS)
    .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
    .setConstraints(Constraints.Builder().setRequiresBatteryNotLow(false).build())
    .addTag("watchdog_$id")
    .build()
WorkManager.getInstance(context).enqueueUniquePeriodicWork(
    "watchdog_$id", ExistingPeriodicWorkPolicy.KEEP, request
)
```

**Why**: WorkManager survives Doze mode for intervals ≥ 15 min via bucket
scheduling. For shorter intervals (< 15 min) it defers the work to the next
allowed window — the earliest execution may be later than requested, but it
will always run eventually.

**Minimum interval**: WorkManager enforces a 15-minute floor on
`PeriodicWorkRequest`. Intervals shorter than 15 min should use a
`OneTimeWorkRequest` that re-enqueues itself on completion.

[ ] Decide whether to enforce a 15-minute UI minimum or implement the
    self-re-enqueuing `OneTimeWorkRequest` pattern for sub-15-minute intervals.

### Option B — AlarmManager with `setExactAndAllowWhileIdle`

Requires `SCHEDULE_EXACT_ALARM` permission (user must grant manually on
Android 12+). Delivers exact timing even in Doze, but Google Play policy
discourages this for non-time-critical use cases. Not recommended.

[ ] Revisit if users report unacceptable jitter from WorkManager.

### Option C — JS `setInterval` within the foreground service JS thread

Simpler to implement (no Kotlin changes beyond the foreground service), but
the JS thread is suspended when Android moves the app to cached-process state.
Effective only while the foreground notification is visible. **Not recommended**
for intervals > ~60 seconds.

---

## 4. UI

### Setup: chat command (primary path)

A watchdog is created by prefixing a command with `/watch`:

```
/watch every 5m: Uber is within 5 minutes
/watch every 15m: FedEx package status changed
/watch every 2m check if NVDA crossed $150
```

**Parsing in `agentBridge.ts`** (or a new `commandParser.ts`):

```ts
const WATCH_RE = /^\/watch\s+every\s+(\d+)(m|min|s|sec|h)\s*[:\-]?\s*/i;
function parseWatchCommand(text: string): { intervalMs: number; task: string } | null {
  const m = text.match(WATCH_RE);
  if (!m) return null;
  const unit = m[2].toLowerCase();
  const n = parseInt(m[1], 10);
  const intervalMs = unit.startsWith('h') ? n * 3_600_000
                   : unit.startsWith('s') ? n * 1_000
                   : n * 60_000;
  return { intervalMs, task: text.slice(m[0].length) };
}
```

On match, `processCommand` calls `watchdogBridge.create(config)` instead of
running a one-shot agent loop.

### Active watchdog list: History screen extension

The History screen already shows past sessions. Extend it with an "Active
Watchdogs" section at the top (visible only when `watchdogStore.getActive()` is
non-empty). Each row shows:

```
[pause] 🔔  Uber ≤ 5 min away  │  every 2 min  │  last check: 1m ago
[cancel]
```

Pause suspends WorkManager without deleting the config; cancel calls
`WorkManager.cancelUniqueWork` and removes from store.

### Setup: Settings screen (secondary path, v2)

A "Watchdogs" card in SettingsScreen lets users configure a watchdog without
knowing the `/watch` syntax. UI: task text input, interval stepper, tool preset
picker, Save button. Only needed if usage data shows the chat command is too
discoverable.

[ ] Decide whether a Settings-based UI is needed for v1 or can be deferred.

### Cancellation

- From the active list in the History screen: "Cancel" button.
- The watchdog auto-cancels after it triggers successfully.
- The watchdog auto-cancels after `maxMissedTicks` consecutive timeouts
  (see Open Questions).
- From a chat message: `/watchdog cancel <id>` (short id shown in notification).

---

## 5. Open Questions and Risks

**Battery / Doze mode**

[ ] WorkManager defers work when the device is in Doze. For a 2-minute
    watchdog on a Pixel 8 in idle, effective interval may be 15–30 min.
    Should the app request battery optimization exemption
    (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) or should the UI clearly warn
    users that short intervals are best-effort?

[ ] The foreground notification from the one-shot agent task is shown during
    each tick (visible to user). Is this acceptable UX, or should watchdog
    ticks run silently (no ongoing notification, only the result notification)?
    Silent mode would require the service to downgrade from foreground to
    background for watchdog ticks, which risks OOM kill on low-RAM devices.

**Maximum concurrent watchers**

[ ] How many active watchdogs should be allowed simultaneously? WorkManager
    can handle many periodic jobs, but each tick runs the full agent loop
    (heavy: screen read + LLM inference). Suggested default: **max 3 active
    watchdogs**. Each additional watchdog queues behind active ones.

**Timeout when condition is never met**

[ ] A watchdog that never triggers would run indefinitely. Options:
    - Max duration (e.g. auto-cancel after 24 hours): simple, but may miss
      edge cases for long-lived conditions.
    - Max tick count (e.g. auto-cancel after 50 checks): more predictable.
    - No automatic cancellation — user must cancel manually.
    Suggested default: **auto-cancel after `maxTicks = 50` consecutive
    non-triggering checks**, with a notification ("Watchdog expired").
    `maxTicks` should be user-configurable.

**Condition evaluation**

[ ] How does the agent signal "condition true" vs "condition false"?
    Current proposal: agent calls `task_complete` when the condition is met
    and `task_failed` when it is not (this run). This requires the agent
    prompt to clearly instruct this semantics — the system prompt suffix
    must include: _"If the condition is not yet met, call task_failed with
    reason 'condition not met'. If it IS met, call task_complete."_

[ ] Should the agent be able to store intermediate state between ticks (e.g.
    "previous package status was X")? Currently `context` in `AgentOptions`
    is a `Record<string, string>` populated at run start. One option: after
    each tick, the agent's `task_complete` result is saved back into
    `WatchdogConfig.lastResult` and passed as context to the next tick.

**Security / privacy**

[ ] The watchdog task runs with full accessibility controller access.
    A malicious watchdog task could read arbitrary screen content on a
    schedule. Consider restricting watchdog tasks to the `read_only` tool
    preset by default, with an explicit opt-in to wider access.

**React Native bridge availability**

[ ] When a WorkManager job fires, the React Native JS thread may not be
    running (app killed). The `DeftWatchdogWorker` (Kotlin) must start the
    app's JS engine. This is non-trivial; the standard pattern is to use
    `HeadlessJsTaskService` (not `Service`) so RN launches a headless JS task.
    This is a significant architecture change from the current `Service`-based
    approach — evaluate whether to refactor `DeftAgentService` to extend
    `HeadlessJsTaskService` or to keep two separate services.

---

## Implementation Checklist (in order)

- [ ] `WatchdogConfig` type + `watchdogStore.ts` (AsyncStorage, CRUD)
- [ ] `parseWatchCommand()` in `agentBridge.ts` (chat command detection)
- [ ] `watchdogBridge.ts` — `create()`, `cancel()`, `onTick()` JS side
- [ ] `DeftWatchdogModule.kt` — WorkManager scheduling + cancellation
- [ ] `DeftWatchdogWorker.kt` — `CoroutineWorker` or `HeadlessJsTaskService`
- [ ] `DeftAgentService.kt` — add `ACTION_WATCHDOG_TICK` + `ACTION_WATCHDOG_TRIGGERED`
- [ ] `plugins/withDeftWatchdog.js` — Expo config plugin to inject Kotlin + manifest entries
- [ ] History screen — active watchdog list UI
- [ ] System prompt update — add watchdog condition semantics
- [ ] Test: unit tests for `parseWatchCommand`, `watchdogStore`, and the
      `onTick` condition-check flow (mock AgentLoop)
