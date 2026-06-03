# Build-in-Public Tweet Threads

Draft threads for the Phase 5 content calendar. Post from @BeddaTech and @MattWhitney__.

---

## Thread 1 — Project Announcement (Week 1)

**Post 1/8**
I'm building the first fully on-device AI phone agent for Android using React Native.

No cloud. No tethered computer. Just Gemma 4 running locally on your phone.

Here's the gap I found, and how I'm filling it. 🧵

---

**Post 2/8**
Every AI phone agent I've seen falls into one of three buckets:

1. Cloud-dependent (streams your screen to a server)
2. ADB-dependent (requires a connected laptop)
3. App-specific (works only in one instrumented app)

None of these are real products. All of them are compromises.

---

**Post 3/8**
The pieces to build a real on-device agent now exist:

• Android AccessibilityService — reads ANY app's UI tree
• ExecuTorch — Meta's on-device inference runtime (Gemma 4 fits in ~2.5GB)
• React Native New Architecture — fast native bridges in TypeScript

I'm building the glue.

---

**Post 4/8**
Three open-source React Native libraries:

• react-native-accessibility-controller — read/write any app's UI
• react-native-executorch (fork) — run Gemma 4 with function calling
• react-native-device-agent — the agent loop connecting them

Plus Deft: the app that puts it all together.

---

**Post 5/8**
The agent loop:

observe screen → ask Gemma 4 what to do → execute action → observe result → repeat

All on-device. All in TypeScript (plus Kotlin for the Android native layer).

No API keys required by default.

---

**Post 6/8**
Why React Native?

Because that's where the community is. The accessibility and LLM libraries I'm building can be used by any React Native developer — not just people who want to build phone agents.

react-native-accessibility-controller alone fills a gap that's existed for years.

---

**Post 7/8**
Everything is MIT licensed and built in public.

Every PR, architecture decision, and mistake will be shared.

If you've ever wanted to build an AI agent that controls an Android phone — this is the foundation.

---

**Post 8/8**
Repos just went live:

→ github.com/bedda-tech/react-native-accessibility-controller
→ github.com/bedda-tech/react-native-executorch
→ github.com/bedda-tech/react-native-device-agent
→ github.com/bedda-tech/deft

Star if this interests you. Contributions very welcome.

---

## Thread 2 — AccessibilityService Demo (Week 2)

**Post 1/5**
Day 7: react-native-accessibility-controller can now read the full UI tree of ANY app on your Android phone from React Native.

Here's what that looks like and why it matters. 🧵

---

**Post 2/5**
Open Chrome. Open Gmail. Open any app.

getScreenText() returns this:

```
[0] FrameLayout
  [1] LinearLayout
    [2] EditText "Search" (clickable, editable)
    [3] ImageButton "Google" (clickable)
  [4] RecyclerView (scrollable)
    [5] TextView "Primary" 
    [6] TextView "24 new messages"
```

Every node. Every app. No root required.

---

**Post 3/5**
You can also tap nodes:

await tapNode(nodeId)  // tap by accessibility node ID
await tap(500, 800)    // tap by screen coordinates
await swipe(500, 1400, 500, 400, 300)  // swipe up
await globalAction('home')  // press the home button

All from TypeScript. All via Android's official AccessibilityService API.

---

**Post 4/5**
The hard part wasn't the Kotlin. It was the thread safety.

The accessibility service fires on the main thread. The React Native bridge is on a background thread.

Solution: WeakReference<ReactApplicationContext> pattern + volatile instance reference. No locking required.

---

**Post 5/5**
react-native-accessibility-controller is live:
→ github.com/bedda-tech/react-native-accessibility-controller

npm install react-native-accessibility-controller

Full API: screen reading, node actions, coordinate gestures, event streaming, React hooks.

MIT license. Android only (iOS stub included for cross-platform packages).

---

## Thread 3 — Agent Loop Demo (Week 4)

**Post 1/6**
The agent loop works.

Gemma 4 reads the screen, decides what to tap, executes it, observes the result. All on-device. All under 2 seconds per step on a Pixel 8.

Here's what I shipped this week. 🧵

---

**Post 2/6**
The loop is simple on paper:

1. Read screen as structured text
2. Ask Gemma 4 what action to take
3. Parse the tool call from the response
4. Execute the action
5. Wait 500ms for screen to settle
6. Repeat until task_complete

The devil is in steps 2, 3, and 4.

---

**Post 3/6**
Step 2: Screen → LLM prompt

Raw accessibility trees can have 200+ nodes. That destroys the context window.

ScreenSerializer compresses it into numbered compact text. The model references nodes by [index] in its tool calls. Fits in ~800 tokens for most screens.

---

**Post 4/6**
Step 3: Parsing tool calls is harder than it looks.

Gemma 4 is inconsistent about format. Sometimes XML. Sometimes JSON in a code block. Sometimes bare JSON.

ToolParser tries 4 strategies in order. This is necessary for production reliability — don't skip it.

---

**Post 5/6**
Step 4: Executing tool calls.

10 tools total: tap, long_press, type_text, swipe, scroll, open_app, read_screen, screenshot, global_action, task_complete.

The agent picks the right one. The AccessibilityService executes it.

---

**Post 6/6**
react-native-device-agent is live:
→ github.com/bedda-tech/react-native-device-agent

Full agent loop with on-device (Gemma 4), cloud (OpenAI/Anthropic), and hybrid providers.

React hooks included: useAgent(), useAgentChat()

MIT license. Contributions welcome.

---

## Thread 4 — Beta Launch (Week 5-6)

**Post 1/4**
Deft beta is live.

Download the APK. Sideload it. Tell your phone to do something.

→ github.com/bedda-tech/deft/releases

---

**Post 2/4**
What it can do today:

• "Open Settings and turn on Wi-Fi"
• "Send a text to Mom saying I'll be home late"
• "Find the cheapest flight to NYC this weekend"
• "Set a timer for 25 minutes"

On-device by default. No API key needed.

---

**Post 3/4**
What's running under the hood:

• Gemma 4 E4B (2.5GB, quantized) via ExecuTorch
• AccessibilityService reading any app's UI in real-time
• Agent loop: observe → think → act → repeat
• Floating overlay so you can see what it's doing

All on your phone. No cloud.

---

**Post 4/4**
Three MIT-licensed React Native libraries if you want to build your own:

→ react-native-accessibility-controller
→ react-native-executorch (Gemma 4 fork)
→ react-native-device-agent

The stack is open. Build on it.

---

## Hacker News Post Draft

**Title:** Show HN: Deft – Fully on-device AI phone agent for Android using React Native

**Body:**
I built an open-source ecosystem of React Native libraries that enable a local LLM (Gemma 4) to read any Android app's UI and take actions — no cloud, no ADB, no root.

Three libraries:
- react-native-accessibility-controller: TurboModule bridge to Android's AccessibilityService. Lets you read any app's UI tree, tap nodes, dispatch gestures, and stream events from TypeScript.
- react-native-executorch (fork): Adds Gemma 4 E4B support with function calling to Software Mansion's ExecuTorch bridge.
- react-native-device-agent: The agent loop. Reads the screen, sends it to the LLM, parses tool calls, executes actions, repeats.

Deft is the consumer app that puts it together: chat interface, real-time overlay, model download, settings.

The hardest parts: thread safety between the AccessibilityService (main thread) and React Native bridge (background thread); building a tool-call parser that handles XML, JSON code blocks, and bare JSON because LLMs are inconsistent; the hardware bitmap → ARGB copy dance required for PNG encoding screenshots from AccessibilityService.

Beta APK on GitHub Releases. All MIT licensed.

github.com/bedda-tech/deft

---

## Reddit Posts

### r/reactnative

**Title:** I built a TurboModule for Android's AccessibilityService — read/control any app's UI from React Native

React Native has never had a way to access Android's AccessibilityService from JavaScript. I spent the last few weeks building one.

`react-native-accessibility-controller` gives you:
- Full UI tree of any foreground app
- Tap/long-press/swipe/scroll/type by node ID or coordinates
- Global actions (home, back, recents)
- Real-time event streaming with React hooks
- Floating overlay window (SYSTEM_ALERT_WINDOW)

Part of a bigger project (on-device AI phone agent), but the library stands alone for any accessibility tooling, testing, or automation use case.

MIT licensed, New Architecture only (TurboModule).

→ github.com/bedda-tech/react-native-accessibility-controller

### r/LocalLLaMA

**Title:** Built an on-device AI phone agent: Gemma 4 reads your Android screen and taps things for you

Gemma 4 E4B (quantized, ~2.5GB) running on a Pixel 8 via ExecuTorch, reading any Android app's UI via AccessibilityService, executing tap/swipe/type actions.

No cloud. ~2s per reasoning step on a Pixel 8 Pro.

The stack: React Native + Kotlin (Android) + ExecuTorch + AccessibilityService.

Everything is open source. The interesting bits: how we serialize accessibility trees into LLM-friendly text, how the tool call parser handles 4 different output formats, how the hybrid provider degrades gracefully from on-device to cloud.

→ github.com/bedda-tech/deft

---

## Thread 5 — Foreground Service & Task Persistence (Week 6-7)

**Post 1/6**
"Tell Deft to book a flight. Switch apps to check your email. Come back to find the agent dead."

Android kills background JS threads without warning.

v1.2.0 solves this in two layers. 🧵

---

**Post 2/6**
Layer 1: Android foreground service.

When you start a task, Deft starts `DeftAgentService` — an Android Service that holds a persistent notification.

Android won't kill a foreground service. Your agent keeps running while you use other apps.

The notification shows what Deft is doing in real time.

---

**Post 3/6**
The Kotlin side is straightforward:

```kotlin
startForeground(NOTIF_ID, buildNotification("Agent running…"))
// JS agent loop continues in the React Native thread
// When task completes:
completeForegroundService(summary, success = true)
stopForeground(STOP_FOREGROUND_REMOVE)
```

Expo managed workflow with no `android/` directory: the service is injected via a config plugin at prebuild time.

---

**Post 4/6**
Layer 2: AsyncStorage persistence for force-quits.

Foreground services can still be killed by:
- Force-quit from the recents screen
- Low memory OOM kill
- Device restart

So every action step is fire-and-forget saved to AsyncStorage as the agent loop progresses.

```ts
void saveResumableTask({ task, steps: _steps })
```

---

**Post 5/6**
On next launch, Deft checks for a saved task:

```ts
const pending = await loadResumableTask()
if (pending) showResumePrompt(pending.task)
```

Tap "Resume" and it replays your previous actions as context, then picks up where it left off.

The `finally` block in `processCommand` clears the saved task on clean completion — force-quit skips `finally`, so the task survives intentionally.

---

**Post 6/6**
Two layers. One goal: your agent finishes what you asked it to do.

Foreground service → survives switching apps.
AsyncStorage persistence → survives force-quit.

All open source:
→ github.com/bedda-tech/deft
→ github.com/bedda-tech/react-native-device-agent

Contributors welcome. MIT license.

---

## Thread 6 — Watchdog Mode (Week 7-8)

**Post 1/7**
Your phone AI can now check things for you every 5 minutes.

Type `/watch every 5m: is my Uber within 5 minutes?` and Deft runs that check automatically — while you do something else.

Here's how it works. 🧵

---

**Post 2/7**
The command syntax is simple:

```
/watch every 15m: did my package ship yet?
/watch every 1h: is there a seat open on the 6pm flight?
/watch every 30m: has my PR been reviewed?
```

Deft runs a full agent loop for each tick. Every check is a real task — reads the screen, navigates if needed, evaluates the condition.

---

**Post 3/7**
The architecture: Android WorkManager.

WorkManager enforces a 15-minute minimum interval (OS constraint). For sub-15-min intervals, we use a self-re-enqueuing OneTimeWorkRequest instead.

Each tick starts a foreground service to survive backgrounding, runs the AgentLoop, then posts a notification with the result.

---

**Post 4/7**
The busy-guard is the detail that makes it work in practice.

If you've started a manual task, the watchdog tick is a no-op:

```ts
if (agentBridge.isAgentBusy()) return // skip tick
```

No interference. The next tick picks up as scheduled.

---

**Post 5/7**
Persistence across restarts.

Every active watchdog is saved to AsyncStorage with its schedule and condition. On app startup, `restoreWatchdogs()` re-enqueues any that were running.

Kill the app. Restart it. Your watchdog is still running.

---

**Post 6/7**
Cancel with `/stopwatch`.

The cancellation cancels both the WorkManager job and clears the AsyncStorage entry. No lingering jobs.

One-liner implementation: `watchdogBridge.cancelWatchdog(id)` → `WorkManager.cancelUniqueWork(id)`.

---

**Post 7/7**
Watchdog Mode is live in `main`.

This is the feature I'm most excited about — an AI agent that runs in the background and tells you when something changes. No polling. No manual checks.

→ github.com/bedda-tech/deft
→ Full commit: github.com/bedda-tech/deft/commit/2b5e924

---

## Thread 7: Dual-Model AgentLoop

**Post 1/7**
We split the AI brain in two.

One tiny 270M-param model handles tool dispatch. One 4B-param model handles reasoning.

The result: faster actions on 4GB Android devices, without sacrificing accuracy on complex tasks.

Here's how the Dual-Model AgentLoop works 🧵

---

**Post 2/7**
The problem with a single LLM for phone control:

Gemma 4 E4B is accurate. But every tool call — "tap this button", "scroll down" — triggers a full reasoning pass.

On a mid-range Android with 4GB RAM, that means 500–800ms per action. Multiply by 10–20 steps and tasks feel sluggish.

---

**Post 3/7**
The solution: function dispatch vs reasoning are different tasks.

`FunctionGemma 270M` was fine-tuned specifically to map screen context → tool call. It's tiny, fast (~80ms), and surprisingly accurate for dispatch.

`Gemma 4 E4B` handles the hard part: multi-step planning, interpreting ambiguous screens, knowing when to stop.

---

**Post 4/7**
How it fits in 4GB RAM:

| Component | Peak RAM |
|-----------|----------|
| FunctionGemma 270M | ~350 MB |
| Gemma 4 E4B | ~2.8 GB |
| Android OS + app | ~0.9 GB |
| **Total** | **~4.0 GB** |

FunctionGemma is lazy-loaded for each dispatch call. Both models are never resident simultaneously — the 4GB ceiling holds.

Full RAM profile: docs/functiongemma-schema-ram-report.md

---

**Post 5/7**
The routing logic in `DualModelProvider`:

1. Agent receives a task + screen state
2. Gemma 4 plans: "I need to tap the search button"
3. FunctionGemma dispatches: decides the exact tool call + args
4. If FunctionGemma returns an invalid/low-confidence call → falls back to Gemma 4 for that step

One model thinks. The other acts. Each does what it's good at.

---

**Post 6/7**
Schema alignment was the hardest part.

FunctionGemma was trained on a specific set of tool schemas. Our `PHONE_TOOLS` registry had drifted — `scroll.nodeId` was `required` in training but `optional` in production.

Fix: normalized the training reference schemas in the executorch fork. Deterministic tool dispatch = fewer hallucinated nodeIds.

Commit: bedda-tech/react-native-executorch@4309a420

---

**Post 7/7**
Dual-Model AgentLoop is live in `react-native-device-agent`.

The architecture that runs on a $300 Android phone:
→ 270M params for tool selection
→ 4B params for reasoning  
→ Stays within 4GB RAM
→ Zero cloud dependency

→ github.com/bedda-tech/deft
→ Benchmark report: github.com/bedda-tech/deft/blob/main/docs/functiongemma-schema-ram-report.md
