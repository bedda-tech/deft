# How I Built a Fully On-Device AI Phone Agent for Android Using React Native

No cloud. No tethered computer. Just Gemma 4 running locally on your phone, reading the screen, and tapping things for you.

This is the technical story behind [Deft](https://github.com/bedda-tech/deft) — an open-source ecosystem of React Native libraries that enable fully autonomous AI phone control on Android.

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

All four repos are live on GitHub under [bedda-tech](https://github.com/bedda-tech):

- [react-native-accessibility-controller](https://github.com/bedda-tech/react-native-accessibility-controller) — Full AccessibilityService TurboModule
- [react-native-executorch](https://github.com/bedda-tech/react-native-executorch) — Fork with Gemma 4 support  
- [react-native-device-agent](https://github.com/bedda-tech/react-native-device-agent) — Agent orchestration loop
- [deft](https://github.com/bedda-tech/deft) — Consumer app

The beta APK is available on the GitHub Releases page. Try it on any Android 11+ device.

Contributions, issues, and GitHub Discussions are very welcome.

---

## What's Next

- **Performance benchmarks** across device tiers (Pixel 8 Pro, mid-range phones)
- **Gemma 4 E2B option** for phones with less RAM
- **iOS stub** so React Native libraries work cross-platform (Android is where AccessibilityService lives, but the JS API can return no-ops on iOS)
- **F-Droid submission** for open-source distribution

Follow along: [@BeddaTech](https://twitter.com/BeddaTech) and [@MattWhitney__](https://twitter.com/MattWhitney__)
