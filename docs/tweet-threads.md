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
