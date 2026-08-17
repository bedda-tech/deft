<!--
  Source of truth for this article's body. docs/article-devto-final.md is the
  publish-ready twin (adds dev.to frontmatter + manual/API publish instructions,
  published: false). Edit here first, then port body changes over there —
  they've drifted before (task #6967).
-->

# How I Built a Fully On-Device AI Phone Agent for Android Using React Native

No cloud. No tethered computer. Just Gemma 4 running locally on your phone, reading the screen, and tapping things for you.

This is the technical story behind [Deft](https://github.com/bedda-tech/deft) — an open-source ecosystem of React Native libraries that enable fully autonomous AI phone control on Android. It's now at v1.4.5, with a dual-model agent loop and a background "watchdog" mode that didn't exist when this project started.

---

## The Gap

Every "AI agent" demo I've seen that controls a phone falls into one of three buckets:

1. **Cloud-dependent** — your screen is streamed to a server, an LLM reasons about it, and commands are sent back. High latency, privacy nightmare.
2. **ADB-dependent** — requires a tethered computer running `adb shell` commands. Not a real product.
3. **App-specific** — works only within a single app that has been specially instrumented.

I wanted something different: a local AI agent that reads _any_ app's UI, decides what to do, and executes actions — all on-device, no connection required.

The tech to build this now exists. It just needed to be assembled:
- **Android AccessibilityService** — a system API that exposes every app's UI tree
- **ExecuTorch** — Meta's on-device inference runtime, fast enough for Gemma 4 on a Pixel 8
- **React Native (New Architecture)** — the glue that makes all of this usable from TypeScript

---

## The Architecture

```
User speaks a command
        │
        ▼
   AgentLoop (react-native-device-agent)
        │
        ├── readScreen() ──► AccessibilityService ──► structured UI tree
        │
        ├── LLM inference ──► Gemma 4 on ExecuTorch (on-device)
        │                     or CloudProvider fallback (OpenAI/Anthropic)
        │
        ├── parseToolCalls() ──► extract action from LLM output
        │
        ├── executeAction() ──► AccessibilityService ──► tap/swipe/type
        │
        └── repeat until task_complete or max steps
```

Three libraries, one app:

| Library | Role |
|---------|------|
| `react-native-accessibility-controller` | Read/write Android's UI via AccessibilityService |
| `react-native-executorch` (fork) | Run Gemma 4 on-device with function calling |
| `react-native-device-agent` | Agent loop connecting LLM to phone control |

---

## Part 1: react-native-accessibility-controller

This was the hardest piece. React Native has no built-in bridge to Android's AccessibilityService. I had to build a TurboModule from scratch.

### The Kotlin side

The core service is an `AccessibilityService` subclass that holds a static singleton reference so the React bridge can call into it from any thread:

```kotlin
class AccessibilityControllerService : AccessibilityService() {
    companion object {
        @Volatile
        var instance: AccessibilityControllerService? = null
        var reactContextRef: WeakReference<ReactApplicationContext>? = null
    }

    override fun onServiceConnected() {
        instance = this
        serviceInfo = serviceInfo.apply {
            eventTypes = AccessibilityEvent.TYPES_ALL_MASK
            flags = flags or
                AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        // Stream to JS via DeviceEventManagerModule
        emitA11yEvent(reactContextRef?.get() ?: return, event)
    }
}
```

The `ScreenReader` object walks the `AccessibilityNodeInfo` tree and converts it into `WritableArray`/`WritableMap` for the JS bridge:

```kotlin
fun getTree(): WritableArray {
    val service = AccessibilityControllerService.instance
        ?: throw IllegalStateException("ERR_SERVICE_DISABLED")
    val root = service.rootInActiveWindow
        ?: return Arguments.createArray()
    return serializeNode(root)
}
```

One non-obvious gotcha: hardware bitmaps from `takeScreenshot()` (API 30+) can't be directly PNG-compressed. You must copy to `ARGB_8888` first:

```kotlin
val hwBitmap = screenshot.hardwareBitmap
val swBitmap = hwBitmap.copy(Bitmap.Config.ARGB_8888, false)
val baos = ByteArrayOutputStream()
swBitmap.compress(Bitmap.CompressFormat.PNG, 100, baos)
val base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
```

### The TypeScript side

The public API mirrors the plan exactly:

```typescript
// Screen reading
const tree = await getAccessibilityTree()  // full node tree
const text = await getScreenText()          // serialized text
const img  = await takeScreenshot()         // base64 PNG

// Actions
await tapNode(nodeId)
await setNodeText(nodeId, 'hello')
await swipe(500, 1400, 500, 400, 300)
await globalAction('home')
await openApp('com.android.settings')

// Overlay (agent status indicator on top of all apps)
await showOverlay({ gravity: 'top-right', action: 'Opening Settings...', stepCount: 2 })
await updateOverlay({ action: 'Tapping Wi-Fi toggle', stepCount: 3 })
await hideOverlay()

// React hooks
const { tree, loading, refresh } = useAccessibilityTree({ pollIntervalMs: 1000 })
const events = useAccessibilityEvents({ maxEvents: 20 })
const win = useWindowChange()  // currently foreground app
```

---

## Part 2: react-native-executorch (Gemma 4 fork)

Software Mansion's `react-native-executorch` is a solid ExecuTorch bridge but it didn't support Gemma 4 at launch. I forked it to add:

1. **Gemma 4 E4B model constant** — pointing to our pre-exported `.pte` files on Hugging Face
2. **Gemma 4 chat template** — `<start_of_turn>user\n...<end_of_turn>\n<start_of_turn>model\n`
3. **Function calling** — parsing tool call output from Gemma 4's native format
4. **Multimodal input** — passing screenshots as base64 for visual reasoning

The key insight for function calling: Gemma 4 emits tool calls in a structured JSON format wrapped in specific tokens. The provider parses these and returns `ToolCall` objects to the agent loop.

---

## Part 3: react-native-device-agent

This is the orchestration layer — the agent loop that connects everything.

### Screen serialization

Raw accessibility trees are huge. An Android home screen can have 200+ nodes. Feeding that directly to the LLM wastes context and confuses the model. `ScreenSerializer` converts the tree into a compact, indented text format:

```
[0] FrameLayout (clickable)
  [1] LinearLayout
    [2] TextView "Wi-Fi" (clickable)
    [3] Switch "On" (clickable)
  [4] LinearLayout
    [5] TextView "Bluetooth" (clickable)
    [6] Switch "Off" (clickable)
```

Each line is a node with its index, type, text content, and key properties. The agent references nodes by their `[index]` in tool calls.

### The agent loop

```typescript
async *run(task: string): AsyncGenerator<AgentEvent> {
  let screenState = await this.readScreen()
  let steps = 0

  while (steps < this.options.maxSteps) {
    const prompt = this.buildPrompt(task, screenState, this.history)
    const response = await this.provider.generateWithTools(prompt, PHONE_TOOLS)
    const toolCalls = this.parser.parse(response)

    for (const call of toolCalls) {
      if (call.name === 'task_complete') {
        yield { type: 'complete', result: call.arguments.summary }
        return
      }

      yield { type: 'action', tool: call.name, args: call.arguments }
      await this.executeToolCall(call)
      await delay(this.options.settleMs ?? 500)
    }

    screenState = await this.readScreen()
    steps++
    yield { type: 'observation', screenState, step: steps }
  }

  yield { type: 'max_steps_reached' }
}
```

### Tool call parsing

LLMs are inconsistent. The same model will sometimes emit XML tool calls, sometimes markdown JSON blocks, sometimes bare JSON. `ToolParser` tries four strategies in order:

1. XML tags: `<tool_call>{"name":"tap","arguments":{...}}</tool_call>`
2. Markdown code blocks: ` ```json\n{"name":"tap",...}\n``` `
3. Bare JSON object: `{"name":"tap","arguments":{...}}`
4. Bare JSON array: `[{"name":"tap",...}]`

### Providers

```typescript
// On-device (Gemma 4 via ExecuTorch)
const provider = new GemmaProvider({ model: GEMMA4_E4B })

// Cloud fallback (Anthropic or OpenAI format)
const provider = new CloudProvider({
  apiKey: 'sk-...',
  model: 'claude-sonnet-4-6',
  apiFormat: 'anthropic',
  baseURL: 'https://api.anthropic.com/v1',
})

// Hybrid: on-device first, cloud for complex tasks
const provider = new FallbackProvider({
  primary: new GemmaProvider({ model: GEMMA4_E4B }),
  fallback: new CloudProvider({ ... }),
  complexityThreshold: 3,  // switch to cloud after N failed steps
})
```

---

## Part 4: Deft App

The consumer app ties everything together:

- **Chat screen** — text + voice input, real-time agent event stream rendered as chat bubbles
- **History screen** — past sessions with expandable action logs
- **Settings screen** — model selection, cloud fallback toggle with API key input, download button with progress bar
- **Onboarding flow** — walks users through AccessibilityService permission and model download

The agent status overlay (`AgentOverlay`) is a headless component that drives the native floating indicator. While the agent is running, it shows the current action and a stop button on top of _all other apps_ — so you can see what the agent is doing even when it has navigated away from Deft.

---

## Part 5: What Shipped After Launch — Watchdog Mode and the Dual-Model AgentLoop

v1.0.0 was a single-model agent you drove interactively from the chat screen. Two features shipped since (both in v1.4.0) change that shape, and they're the two most interesting things in the codebase to a technical reader.

### Watchdog Mode

Type `/watch every 2m: notify me when the Uber driver is within 5 minutes` in the chat and Deft schedules a recurring background check: every interval, it runs the full agent loop, evaluates your condition against the screen, and fires a notification the moment it's true. `/stopwatch` cancels it.

The design doc originally called for Android `WorkManager` — the "correct" way to schedule reliable background work. It didn't ship that way. `PeriodicWorkRequest` enforces a hard 15-minute floor, which is incompatible with the 30-second/1-minute intervals the feature needs, and the `OneTimeWorkRequest` self-re-enqueuing workaround needed a `HeadlessJsTaskService` rework that was out of scope for the v1 cut. What actually shipped is simpler and more honest about its limits: a JS `setInterval` kept alive by the same foreground service that already keeps the agent running when Deft is backgrounded.

The tradeoff is real and documented, not hidden: ticks are not Doze-resistant. They fire reliably only while the foreground notification stays alive, and aggressive OEM battery managers (MIUI, Samsung's) can still kill it. `DeftWatchdogModule.kt` on the native side only posts notifications — there's no `WorkManager` receiver underneath. For the use cases this targets (package tracking, price alerts, ETA checks over a few hours) that's an acceptable trade for shipping something that actually works at 30-second granularity. A hard cap of 3 concurrent watchdogs keeps a runaway `/watch` habit from turning into a battery drain.

### Dual-Model AgentLoop

The original architecture ran every inference call — planning, tool dispatch, vision grounding — through one Gemma 4 E4B model. `DualModelProvider` splits that: a 270M-parameter `FunctionGemmaProvider` handles `generateWithTools` (the fast, structured "tap node 12" decisions), while Gemma 4 E4B keeps `generate` and `generateWithVision` (the open-ended reasoning and screenshot grounding that actually need a big model).

```typescript
const provider = new DualModelProvider({
  reasoningProvider: new GemmaProvider({ model: 'GEMMA4_E4B', generateFn: reasoningGenerateFn }),
  loadDispatchProvider: async () =>
    new FunctionGemmaProvider({ generateFn: dispatchGenerateFn }),
  dispatchToolFilter: PHONE_TOOL_PRESETS.DISPATCH, // compact schema, stays in FunctionGemma's token budget
})
```

Two things make this practical rather than just clever: `loadDispatchProvider` lazy-loads FunctionGemma so its ~350 MB RAM cost isn't paid until the agent actually starts executing actions, and if the dispatch call throws — OOM, not-yet-loaded — `generateWithTools` transparently falls back to the reasoning provider. The agent degrades instead of breaking.

The RAM math is the real constraint: FunctionGemma 270M peaks around 350 MB, Gemma 4 E4B around 2.8 GB, both loaded simultaneously around 3.1 GB. That puts the dual-model experience out of reach on 4 GB devices (a 4 GB Galaxy A54 config can't load Gemma 4 E4B at all) — the practical floor is 5–6 GB of device RAM.

---

## Key Technical Challenges

**1. Thread safety for the accessibility service**

The service's `onAccessibilityEvent` fires on the main thread. The React bridge calls happen on a background thread. Synchronizing access to `rootInActiveWindow` requires careful locking — we use a `WeakReference<ReactApplicationContext>` pattern to avoid leaking the activity.

**2. Tool parser robustness**

No two LLMs format tool calls the same way, and even a single model is inconsistent across temperatures and prompts. The four-strategy parser is necessary for production reliability.

**3. Screenshot + vision pipeline**

Hardware bitmaps (required for accessibility screenshots) can't be compressed directly. The copy-to-ARGB-then-compress dance adds ~50ms per screenshot on a Pixel 8. For the vision path, screenshots are downscaled to 512×512 before base64 encoding to keep prompt size reasonable.

**4. Overlay permission dance**

`SYSTEM_ALERT_WINDOW` (Draw over other apps) is a special permission on Android — you can't just add it to `AndroidManifest.xml`. You have to check `Settings.canDrawOverlays()` and open the specific settings page for your app. The onboarding flow handles this with a retry loop.

---

## Current State

Deft is at **v1.4.5**, 12 CHANGELOG'd releases in from v1.0.0. All four repos are live on GitHub under [bedda-tech](https://github.com/bedda-tech):

- [react-native-accessibility-controller](https://github.com/bedda-tech/react-native-accessibility-controller) — now a full TurboModule (v2 migrated off the legacy ReactPackage bridge), plus a `MediaProjection`-based screenshot API alongside `AccessibilityService.takeScreenshot()`
- [react-native-executorch](https://github.com/bedda-tech/react-native-executorch) — fork with Gemma 4 support (E2B and E4B, selectable in Settings)
- [react-native-device-agent](https://github.com/bedda-tech/react-native-device-agent) — agent orchestration loop, now with the dual-model provider and watchdog scheduling described above
- [deft](https://github.com/bedda-tech/deft) — consumer app, with Watchdog Mode, plan mode, resumable background tasks, and a foreground service that keeps the agent alive when backgrounded

A real APK — not just a beta build — is attached to every [GitHub Release](https://github.com/bedda-tech/deft/releases); try it on any Android 11+ device.

Contributions, issues, and GitHub Discussions are very welcome.

---

## What's Next

Most of what this section originally listed has since shipped or been resolved:

- ~~Gemma 4 E2B option~~ — shipped in v1.0.0's Settings screen (model selector: E2B fast / E4B stronger reasoning)
- ~~iOS stub~~ — investigated, not shipped. `AccessibilityService` has no real iOS equivalent; a full-fidelity port isn't feasible within App Store rules. The closest viable path is enterprise/MDM-only distribution, a different go-to-market than this project is currently pursuing. Full writeup: [`docs/ios-investigation.md`](https://github.com/bedda-tech/deft/blob/main/docs/ios-investigation.md)
- ~~F-Droid submission~~ — metadata exists (`.fdroid.yml`), pending a refresh to point at the current release

One item is still genuinely open: **physical-device benchmark numbers for the Pixel 6a and sub-$300 Android devices** — Deft's actual minimum-spec targets. The methodology is fully documented in [`docs/benchmarks.md`](https://github.com/bedda-tech/deft/blob/main/docs/benchmarks.md), and Pixel 8 Pro / Galaxy S24 numbers exist as a cross-referenced proxy from upstream `react-native-executorch` benchmarks — but nobody has run that instrumentation on the actual target hardware yet. The early signal isn't encouraging: a same-chip-family proxy (Pixel 7a, same Tensor G2 as the 6a) OOM'd on every Gemma 4 variant, which suggests the 6a's 6 GB RAM may be tight against the quantized model's ~5.8 GB peak footprint. That's a hardware-access gap, not an engineering one — anyone with a Pixel 6a or a sub-$300 Android device in hand can fill in the table.

Follow along: [@BeddaTech](https://twitter.com/BeddaTech) and [@MattWhitney__](https://twitter.com/MattWhitney__)
