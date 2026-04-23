# Good First Issues

A curated list of issues to open on launch day to attract contributors. These are real gaps, well-scoped, and don't require deep knowledge of the full system.

Open these manually on GitHub after launch: one per repo, tagged `good first issue` + `help wanted`.

---

## react-native-accessibility-controller

### 1. Add `findNode(query)` helper method

**Summary:** Add a helper that searches the accessibility tree for the first node matching a text, contentDescription, or viewIdResourceName query.

**Why it's good first:** Pure TypeScript. The `getAccessibilityTree()` method already returns the full tree as `AccessibilityNode[]`. The helper just needs to walk the tree recursively. No Kotlin required.

**File:** `src/index.ts` or a new `src/utils.ts`

**Expected output:**
```typescript
// Usage
const node = await findNode({ text: 'Submit' })
await tapNode(node.id)
```

---

### 2. Add TypeScript types for all `AccessibilityNode` action types

**Summary:** The `NodeAction` type currently uses a plain string. Replace it with a typed union of known Android accessibility action names (`CLICK`, `LONG_CLICK`, `FOCUS`, `SCROLL_FORWARD`, `SCROLL_BACKWARD`, `SET_TEXT`, etc.).

**Why it's good first:** Types-only change. No Kotlin, no runtime logic. Just `src/types.ts`.

---

### 3. Write a usage example in README

**Summary:** Add a "How to read the screen" code example and a "How to tap a button" code example to the README. Should show real output from `getAccessibilityTree()` and how to find + act on a node.

**Why it's good first:** Documentation only. No code changes.

---

## react-native-device-agent

### 4. Add a `retry` option to `AgentLoop`

**Summary:** Add an optional `retryOnError?: number` config to `AgentLoopOptions`. When a `generate` call throws, retry up to N times with exponential backoff before emitting an `error` event.

**Why it's good first:** Self-contained change to `src/agent/AgentLoop.ts`. The retry logic is standard. The test pattern is already established in `__tests__/AgentLoop.test.ts`.

---

### 5. Add a `timeout` option to `AgentLoop`

**Summary:** Add an optional `timeoutMs?: number` to `AgentLoopOptions`. If the loop runs longer than the timeout, abort it and emit `{ type: 'timeout' }` instead of `{ type: 'max_steps_reached' }`.

**Why it's good first:** Small change to `AgentLoop.ts`, one new event type. Clear test case: mock a slow provider, set a short timeout, assert the loop emits `timeout`.

---

### 6. Add OpenRouter as a supported CloudProvider format

**Summary:** `CloudProvider` currently supports `openai` and `anthropic` API formats. OpenRouter uses the OpenAI format but requires an `HTTP-Referer` header. Add an `openrouter` format option that sets the correct base URL and headers automatically.

**Why it's good first:** Contained in `src/providers/CloudProvider.ts`. An existing format (`openai`) is the model. One test case needed.

---

## deft (app)

### 7. Add haptic feedback on agent action execution

**Summary:** When the agent executes a tap or swipe action, trigger a light haptic feedback using `expo-haptics`. Import at the top of `src/agentBridge.ts` and call `Haptics.impactAsync(ImpactFeedbackStyle.Light)` before each action.

**Why it's good first:** 3-line change. `expo-haptics` is already in Expo's SDK and doesn't need a separate install.

---

### 8. Add a "Copy to clipboard" button on session history items

**Summary:** In `src/screens/HistoryScreen.tsx`, add a "Copy" icon button on each session row. Pressing it should copy the full action log for that session to the clipboard using `Clipboard` from `@react-native-clipboard/clipboard` or `expo-clipboard`.

**Why it's good first:** Contained to one screen component. The session data is already available in the component as `session.actions`.

---

### 9. Add a character counter to the chat input

**Summary:** The chat input in `src/screens/ChatScreen.tsx` has no length indicator. Add a `{input.length}/500` counter below the input that turns red when over 400 characters.

**Why it's good first:** Pure UI component change. No state management, no native code.

---

### 10. Add swipe-to-delete on history sessions

**Summary:** In `HistoryScreen.tsx`, wrap each session row in a `Swipeable` from `react-native-gesture-handler`. Swiping left reveals a red "Delete" action that removes the session from `historyStore`.

**Why it's good first:** Common React Native pattern. `react-native-gesture-handler` is already a peer dep. The store already has a `removeSession(id)` method (or it can be added).

---

## How to open these issues

1. Go to the repo on GitHub
2. Create a new issue with the title and body from above
3. Add labels: `good first issue`, `help wanted`
4. Pin or feature them on the repo's issue list
5. Mention them in the launch tweet thread and PH maker comment
