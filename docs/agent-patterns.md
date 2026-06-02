# Agent Patterns

Common multi-step reasoning patterns for Deft agent authors and contributors. These patterns apply to both on-device (Gemma 4) and cloud LLM backends.

---

## Scroll-Until-Found

### When to use

Android's accessibility tree only contains nodes that are currently **rendered on screen**. Apps that use `RecyclerView` or `ScrollView` for long lists (contacts, emails, settings, messages) only render the visible rows. Items below the fold do not appear in `getAccessibilityTree()` output until the user scrolls to them.

Use the scroll-until-found pattern when:
- The agent is looking for a specific list item (email subject, contact name, setting label) and `find_node` returns null.
- The current screen shows a scrollable list with no end indicator (unknown length).
- A previous `read_screen` confirms you are inside a long scrollable list.

Do **not** use it when:
- The target is clearly not a list item (e.g. a button that always appears in a fixed header).
- You have already scrolled and hit the end indicator (no new content appeared after the last scroll).

---

### Built-in atomic tool: `scroll_until_found`

For the common case — scroll until one specific node appears — use the `scroll_until_found` tool directly. It handles the loop, the delay, and the max-iteration guard internally.

```
Tool call:
  scroll_until_found
Arguments:
  direction: "down"
  text: "Alice Johnson"
  maxScrolls: 20          // give up after 20 scroll steps (default)
  intervalMs: 300         // wait 300ms after each scroll for the tree to update (default)
  scrollNodeId: (omit to auto-detect the first scrollable container)

Returns:
  nodeId: string | null   // the nodeId of the matched node, or null if not found
```

**Worked example** — an LLM step-through for "find the Gmail message from Alice":

```
[Step 1] read_screen
→ Observation: Gmail inbox. 8 messages visible. No message from Alice in current view.

[Step 2] scroll_until_found { direction: "down", text: "Alice", maxScrolls: 25 }
→ Observation: nodeId "42:com.google.android.gm:id/senders"

[Step 3] tap { nodeId: "42:com.google.android.gm:id/senders" }
→ Observation: Message thread from Alice opened.

[Step 4] task_complete { summary: "Opened the email from Alice." }
```

The agent uses a single tool call for the entire scroll-until-found operation, keeping the history short and the LLM context focused.

---

### Manual loop pattern: `find_all_nodes` + `scroll`

Use the manual pattern when:
- You need to **inspect or interact with multiple matching nodes**, not just the first one.
- You want to collect all matching items across the full list before deciding which one to act on.
- `scroll_until_found` is not in the active tool preset (e.g. the `TEXT_INPUT` preset).

**Pseudocode**:

```
MAX_SCROLLS = 20
seen = {}            // track node IDs already processed
scroll_count = 0

loop:
  nodes = find_all_nodes { text: target_text }

  fresh = [n for n in nodes if n.nodeId not in seen]
  if fresh:
    process(fresh)                    // tap, read, etc.
    mark fresh as seen

  if scroll_count >= MAX_SCROLLS:
    // Give up — either target not found or list is exhausted
    task_failed { reason: "Target not found after " + MAX_SCROLLS + " scroll steps" }
    break

  did_scroll = scroll { direction: "down" }
  if not did_scroll:
    // scrollNode returned false → hit the bottom of the list
    task_failed { reason: "Reached end of list without finding target" }
    break

  wait_for_change { timeoutMs: 1000 }   // wait for new rows to render
  scroll_count += 1
```

**Worked example** — LLM step-through for "archive all emails from Alice in Gmail":

```
[Step 1] read_screen
→ Observation: Gmail inbox, multiple senders visible.

[Step 2] find_all_nodes { text: "Alice" }
→ Observation: ["12:...", "17:..."]  (2 nodes visible)

[Step 3] tap { nodeId: "12:..." }      // long-press → Archive
[Step 4] tap { nodeId: "17:..." }      // already visible, archive

[Step 5] scroll { direction: "down" }
→ Observation: true

[Step 6] wait_for_change { timeoutMs: 800 }
→ Observation: true (new rows appeared)

[Step 7] find_all_nodes { text: "Alice" }
→ Observation: ["31:..."]  (1 new match below the fold)

[Step 8] tap { nodeId: "31:..." }

[Step 9] scroll { direction: "down" }
→ Observation: false  (bottom of list reached — no more items)

[Step 10] task_complete { summary: "Archived 3 emails from Alice." }
```

The agent tracks which nodes it has already acted on (by nodeId) so repeated calls to `find_all_nodes` after scrolling don't re-process the same items.

---

### API Reference

#### `find_all_nodes`

Search the accessibility tree for **all** matching nodes. Returns an array of `nodeId` strings (may be empty).

```typescript
find_all_nodes(args: {
  text?: string;               // substring match against node.text (case-sensitive)
  contentDescription?: string; // substring match against node.contentDescription
  className?: string;          // exact match, e.g. "android.widget.Button"
  isChecked?: boolean;         // filter by checked state
  isEnabled?: boolean;         // filter by enabled state (false = disabled nodes)
}): Promise<string[]>
```

Source: `react-native-accessibility-controller/src/index.ts` → `findAllNodes(query)`, exposed as a phone tool in `react-native-device-agent/src/tools/PhoneTools.ts`.

#### `scroll_until_found`

Scroll a container repeatedly until a node matching the query appears, then return its `nodeId`. Returns `null` after `maxScrolls` unsuccessful scroll steps.

```typescript
scroll_until_found(args: {
  direction: 'up' | 'down' | 'left' | 'right';
  text?: string;
  contentDescription?: string;
  className?: string;
  isChecked?: boolean;
  isEnabled?: boolean;
  scrollNodeId?: string;  // optional: ID of the scrollable container; auto-detected if omitted
  maxScrolls?: number;    // default: 20
  intervalMs?: number;    // ms to wait after each scroll for the tree to update; default: 300
}): Promise<string | null>
```

Source: `react-native-device-agent/src/tools/PhoneTools.ts` (tool definition), `react-native-device-agent/src/agent/AgentLoop.ts` (handler implementation at `registerDefaultTools()`).

#### `scroll`

Scroll a scrollable element in a direction. If `nodeId` is omitted, the first scrollable container on screen is auto-detected.

```typescript
scroll(args: {
  nodeId?: string;                            // auto-detected if omitted
  direction: 'up' | 'down' | 'left' | 'right';
}): Promise<boolean>  // false = scroll was rejected (bottom/top of list reached)
```

#### `find_node`

Like `find_all_nodes` but returns only the **first** match (or `null`). Prefer this over `find_all_nodes` when you need only one element — it is faster because it short-circuits on the first match.

```typescript
find_node(args: {
  text?: string;
  contentDescription?: string;
  className?: string;
  isChecked?: boolean;
  isEnabled?: boolean;
}): Promise<string | null>
```

---

### Choosing the right tool

| Situation | Recommended tool |
|---|---|
| "Find and tap the first item matching X in a scrollable list" | `scroll_until_found` |
| "Find all items matching X across the whole list" | `find_all_nodes` + `scroll` loop |
| "Item is likely on-screen now" | `find_node` (no scroll) |
| "Wait for a specific item to appear after an action" | `wait_for_node` (polls without scrolling) |

---

### Pitfalls

**Hitting the bottom without a signal**: Some lists don't return `false` from `scroll` at the bottom — they just stop moving. Guard with both the `maxScrolls` limit AND a check for whether `find_all_nodes` returns any new nodes after the scroll (if nothing new appears after two consecutive scrolls, you've hit the end).

**Duplicate nodeIds across scroll positions**: In `RecyclerView`, Android recycles view objects, so the same `nodeId` can refer to different content at different scroll positions. Always re-read the tree after scrolling before acting on a stored `nodeId` — a node that was at position 5 before the scroll may now be at position 10 with a different view backing it.

**Slow tree updates**: On low-end devices, the accessibility tree can lag behind the visual state. If `find_all_nodes` returns nothing after a scroll, wait with `wait_for_change` before concluding the item isn't there.
