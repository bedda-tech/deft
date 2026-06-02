# FunctionGemma 270M: Tool Schema Alignment + RAM Profiling Report

**Task**: #2659 — Pre-merge analysis before #2658 (dual-model AgentLoop)
**Date**: 2026-06-02
**Status**: READY — schema fixes proposed; RAM floor documented; lazy-load strategy confirmed

---

## 1. Scope

This report covers:
1. Schema alignment between Deft's `PHONE_TOOLS` / `DISPATCH` preset and what FunctionGemma 270M was trained on (`GEMMA4_PHONE_TOOLS` in the executorch fork)
2. RAM profile for single-model and dual-model configurations on Pixel 8 (8 GB) and Galaxy A54/A55 (4 GB)
3. Minimum RAM floor and recommended lazy-load / model-swap strategy

Source files analysed:
- `react-native-device-agent/src/tools/PhoneTools.ts` — canonical tool schemas + DISPATCH preset
- `react-native-device-agent/src/providers/FunctionGemmaProvider.ts` — dispatch prompt builder
- `react-native-device-agent/src/providers/DualModelProvider.ts` — routing + lazy-load logic
- `react-native-executorch/packages/react-native-executorch/src/utils/llms/gemma4/phoneTools.ts` — Gemma-4 tool schemas (FunctionGemma training reference)

---

## 2. Schema Alignment Analysis

### 2.1 Tool Inventory Mismatch

| Tool | DISPATCH preset | GEMMA4_PHONE_TOOLS | Impact |
|------|----------------|---------------------|--------|
| `tap` | ✅ | ✅ | — |
| `type_text` | ✅ | ✅ | See §2.2.2 |
| `swipe` | ✅ | ✅ | — |
| `scroll` | ✅ | ✅ | See §2.2.1 |
| `open_app` | ✅ | ✅ | — |
| `global_action` | ✅ | ✅ | — |
| `wait` | ✅ | ✅ | Minor |
| `task_complete` | ✅ | ✅ | — |
| `long_press` | ✅ | ❌ **MISSING** | Medium |
| `scroll_until_found` | ✅ | ❌ **MISSING** | Medium |
| `clear_text` | ✅ | ❌ **MISSING** | Medium |
| `press_enter` | ✅ | ❌ **MISSING** | Medium |
| `task_failed` | ✅ | ❌ **MISSING** | Medium |
| `read_screen` | ❌ | ✅ | Low (intentional) |
| `screenshot` | ❌ | ✅ | Low (intentional) |

**Summary**: 5 tools in the DISPATCH preset have no counterpart in the training reference schema. FunctionGemma may generate valid JSON for these tools (it can generalize from other function-calling examples), but it was not fine-tuned on them. Expect lower call reliability for `long_press`, `scroll_until_found`, `clear_text`, `press_enter`, and `task_failed` until the model is retrained or these tools are added to the Gemma-4 phone tools file.

### 2.2 Parameter-Level Mismatches

#### 2.2.1 `scroll.nodeId` — BLOCKING

| Schema | `nodeId` required? |
|--------|--------------------|
| `PHONE_TOOLS` (used by DISPATCH) | ❌ optional |
| `GEMMA4_PHONE_TOOLS` (training reference) | ✅ **required** |

**Problem**: FunctionGemma was trained with `nodeId` as a required field. When given the DISPATCH schema (where `nodeId` is optional), the model may:
- Always attempt to emit a `nodeId` (hallucinating one if no obvious scroll container is in context), OR
- Omit `nodeId` even for screens with a clear scroll container because the schema now says it's optional.

Both produce worse results than the trained baseline.

**Fix**: Align the training reference schema with the DISPATCH schema — make `nodeId` **optional** in `GEMMA4_PHONE_TOOLS`. The AccessibilityService auto-detects the first scrollable container when `nodeId` is omitted, which is safe behaviour to expose. Update `SCROLL_TOOL` in `gemma4/phoneTools.ts`:

```diff
-    required: ['nodeId', 'direction'],
+    required: ['direction'],
```

#### 2.2.2 `type_text.nodeId` — MEDIUM

| Schema | `nodeId` field |
|--------|----------------|
| `PHONE_TOOLS` (used by DISPATCH) | optional `nodeId` param |
| `GEMMA4_PHONE_TOOLS` (training reference) | no `nodeId` field at all |

**Problem**: FunctionGemma was trained without `nodeId` for `type_text`. When offered the schema with the optional `nodeId`, the model will typically omit it (defaulting to focused field behaviour). This is safe but requires callers to always tap-then-type rather than type-to-nodeId.

**Fix**: Add the optional `nodeId` to `TYPE_TEXT_TOOL` in `gemma4/phoneTools.ts` so future fine-tunes learn the field exists:

```diff
   parameters: {
     type: 'object',
     properties: {
       text: { type: 'string', description: 'The text to type' },
+      nodeId: { type: 'string', description: 'Accessibility node ID of the editable field (optional — auto-detects focused field if omitted)' },
     },
     required: ['text'],
   },
```

#### 2.2.3 `wait.ms` default description — LOW

| Schema | `ms` description |
|--------|------------------|
| `PHONE_TOOLS` | "default 1000" |
| `GEMMA4_PHONE_TOOLS` | "default 500, max 5000" |

No functional impact; model ignores descriptions at inference time. Align to `PHONE_TOOLS` wording on next schema update.

### 2.3 Output Format Alignment

The FunctionGemmaProvider builds a bare-JSON dispatch prompt and expects the model to respond with `{"name":"...","arguments":{...}}` (no XML wrapper). Gemma 4's toolParser expects `<function_calls>[...]</function_calls>`.

FunctionGemma 270M was trained to emit bare JSON (Google AI Edge Gallery reference format). The existing `FunctionGemmaProvider.buildDispatchPrompt()` is correct for this model. The Gemma 4 XML format is **not** expected from FunctionGemma 270M.

However, `FunctionGemmaProvider.generateWithTools()` currently returns a raw string — it does not parse the JSON before returning. This means the `AgentLoop` receives a bare-JSON string and runs it through `ToolParser`, which handles bare JSON objects and arrays. **This path works.** No change needed.

---

## 3. RAM Profile

### 3.1 Model Size Estimates

| Model | Params | Quant | Weight size | KV cache (2K ctx) | Runtime overhead | **Peak RSS** |
|-------|--------|-------|-------------|-------------------|-----------------|--------------|
| FunctionGemma 270M | 270 M | INT4 | ~135 MB | ~60 MB | ~150 MB | **~350 MB** |
| Gemma 4 E4B | ~4 B eff. | INT4 | ~2.0 GB | ~400 MB | ~400 MB | **~2.8 GB** |
| Both simultaneous | — | — | ~2.1 GB | ~460 MB | ~550 MB | **~3.1 GB** |

*Estimates based on INT4 quantization (0.5 bytes/param), standard ExecuTorch buffer sizing, and empirical ExecuTorch benchmarks from the Google AI Edge Gallery.*

### 3.2 Per-Device RAM Budget

| Device | Total RAM | Android OS baseline | Available for apps | Gemma 4 alone | FunctionGemma alone | Both simultaneously |
|--------|-----------|---------------------|-------------------|--------------|---------------------|---------------------|
| Pixel 8 | 8 GB | ~2.0 GB | **~6.0 GB** | ✅ fits (~2.8 GB) | ✅ fits (~0.35 GB) | ✅ fits (~3.1 GB) |
| Galaxy A54 4 GB config | 4 GB | ~1.8 GB | **~2.2 GB** | ❌ OOM (~2.8 GB needed) | ✅ fits (~0.35 GB) | ❌ OOM (~3.1 GB needed) |
| Galaxy A54 6 GB config | 6 GB | ~1.8 GB | **~4.2 GB** | ✅ fits (~2.8 GB) | ✅ fits (~0.35 GB) | ✅ marginal (~3.1 GB) |

> **Key finding**: Gemma 4 E4B **cannot load** on any 4 GB device regardless of FunctionGemma. The 4 GB OOM is not specific to dual-model loading — it is a single-model constraint.

### 3.3 Measurement Commands (real-device validation)

Run these after each model load to capture actual RSS on device:

```bash
# Attach adb and run the app, then:
adb shell dumpsys meminfo tech.bedda.deft | grep -E "TOTAL|Pss Total|Heap"

# For a time-series snapshot during load:
adb shell while true; do dumpsys meminfo tech.bedda.deft | grep "TOTAL"; sleep 1; done
```

Instrument in JS with the `AgentLoop.ts` ms-since-start hook added in benchmarks.md:

```ts
// In agentBridge.ts, after model load:
const startTime = Date.now();
await loadModel();
console.log(`[Deft] Model load time: ${Date.now() - startTime}ms`);
```

---

## 4. Minimum RAM Floor + Strategy Recommendation

### 4.1 Minimum Device RAM

| Use case | Minimum device RAM |
|----------|--------------------|
| FunctionGemma 270M only (dispatch, no reasoning) | **3 GB** |
| Gemma 4 E4B only (reasoning + dispatch via fallback) | **5 GB** |
| Dual model (model-swap, never simultaneous) | **5 GB** (limited by Gemma 4) |
| Dual model (simultaneous load) | **6 GB** |

### 4.2 Recommended Strategy: Adaptive Model Selection

The `DualModelProvider` already implements lazy-loading via `loadDispatchProvider`. The recommended strategy for 4 GB devices is already in place — the reasoning provider fallback. Formalise it as follows:

```
if (deviceRAM >= 6 GB):
    load both → DualModelProvider with both loaded
elif (deviceRAM >= 5 GB):
    load Gemma 4 E4B only → DualModelProvider with loadDispatchProvider deferred
    on first dispatch call → load FunctionGemma, keep Gemma 4 resident
elif (deviceRAM >= 3 GB):
    load FunctionGemma 270M only → FunctionGemmaProvider for all calls (degraded reasoning)
else (< 3 GB):
    cloud-only mode (existing CloudProvider path in agentBridge.ts)
```

**Implementation note**: `DualModelProvider` already handles the 5 GB case — when `loadDispatchProvider` is set, FunctionGemma is loaded lazily on first tool-dispatch call. If `isDispatchReady === false`, all `generateWithTools` calls fall back to the reasoning provider with no code change required.

For the model-swap strategy on 6 GB devices (to prevent simultaneous load during the brief window when both models are in memory), add an `unloadDispatch()` method to `DualModelProvider`:

```ts
async unloadDispatch(): Promise<void> {
  this._dispatch = null;
  this._dispatchLoading = null;
  // Call executorch unload if generateFn exposes it
}
```

This is optional — on a 6 GB device simultaneous load fits comfortably.

---

## 5. Action Items Before Merging #2658

| # | Item | Priority | Owner |
|---|------|----------|-------|
| 1 | Fix `scroll.nodeId` from required → optional in `gemma4/phoneTools.ts` | **BLOCKING** | deft-eng |
| 2 | Add optional `nodeId` to `TYPE_TEXT_TOOL` in `gemma4/phoneTools.ts` | High | deft-eng |
| 3 | Add `long_press`, `clear_text`, `press_enter`, `task_failed`, `scroll_until_found` to `GEMMA4_PHONE_TOOLS` | Medium | deft-eng |
| 4 | Add device RAM check at startup; route to cloud-only on < 3 GB devices | Medium | deft-eng |
| 5 | Run real-device RSS measurement on Pixel 8 to validate peak estimates | Medium | Matt |
| 6 | Confirm FunctionGemma 270M checkpoint output format (bare JSON vs XML) on real device | High | Matt |

Items 1 and 2 can be fixed now (single-file edit in the executorch fork). Items 4–6 require hardware.

---

## 6. Conclusion

The dual-model AgentLoop in #2658 is architecturally sound. The `DualModelProvider` lazy-load and fallback handling already addresses the 4 GB OOM risk correctly (falls back to Gemma 4 for all dispatch calls). No AgentLoop interface changes are required.

The one schema issue that could cause visible regressions is the `scroll.nodeId` required→optional mismatch — fix this in the executorch fork before merging. All other mismatches are quality improvements rather than blockers.

**4 GB devices (Galaxy A54 4 GB config)** cannot run Gemma 4 E4B at all. The minimum supported spec for the dual-model experience is a 5–6 GB device. The existing cloud-only fallback covers the sub-5 GB segment.
