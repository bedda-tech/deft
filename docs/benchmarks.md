# Gemma 4 Benchmark Methodology and Framework

Deft runs Google Gemma 4 E4B on-device via
[`react-native-executorch`](https://github.com/bedda-tech/react-native-executorch)
and the
[Gemma 4 model card](https://huggingface.co/google/gemma-4-e4b-it)
(4B parameter, ExecuTorch-quantized INT4).
This document describes the target devices, how to measure inference latency and
memory headroom, and provides an empty results table ready to fill in.

---

## 1. Target Devices

| Device | SoC | RAM | Android | Notes |
|---|---|---|---|---|
| **Pixel 6a** | Google Tensor G2 | 6 GB | 12+ | Mid-range baseline; first-gen Tensor NPU |
| **Pixel 8** | Google Tensor G3 | 8 GB | 14+ | Flagship; Tensor G3 has larger ML accelerator |
| **Galaxy S24 (US)** | Snapdragon 8 Gen 3 | 8 GB | 14+ | Snapdragon baseline; fastest SoC in the test set |
| **Sub-$300 device (TBD)** | e.g. Snapdragon 695 | 6 GB | 11+ | Budget floor; e.g. Moto G Power 5G 2024 |

> **Sub-$300 device**: select a current-generation device with ≥ 6 GB RAM and
> Android 11+. Record the exact model/SKU in the results table.

---

## 2. Measurement Methodology

### 2a. Inference latency — ms/step

**What to measure**: wall-clock milliseconds from the start of the LLM
`generate` call to the moment the observation event fires for each agent step.
A single agent step is: read screen → LLM inference → parse tool call →
execute tool → wait for settle.

**Where the timing already lives**:

- `react-native-device-agent/src/agent/AgentLoop.ts:164`
  ```ts
  const startTime = Date.now();  // set once at run() entry
  ```
  The loop already tracks the overall timeout from this timestamp.
  Per-step timing is **not yet instrumented**; add it as shown below.

- `deft/src/agent/agentBridge.ts` — the `observation` event handler (the
  `event.type === 'observation'` branch in `runRealAgentLoop`) fires once
  per completed step and receives `event.step`.

**Instrumentation recipe** (no production change required — add behind a
`DEV_BENCHMARK` flag):

```ts
// In AgentLoop.ts, inside the while loop — before inference
const stepStart = Date.now();

// ... inference + tool execution ...

// After yielding the observation event
const stepMs = Date.now() - stepStart;
console.log(`[BENCHMARK] step=${this._step} ms=${stepMs}`);
```

In `agentBridge.ts`, you can similarly timestamp the observation handler:

```ts
} else if (event.type === 'observation') {
  const stepMs = Date.now() - _stepStart;   // _stepStart set in 'action' handler
  console.log(`[BENCHMARK] step=${event.step} ms=${stepMs}`);
  agentStepped(event.step, event.screenState);
  // ...
}
```

**Vision inference only**: use `benchmarkVisionInference()` from
`react-native-executorch/packages/react-native-executorch/src/utils/llms/gemma4/screenshotPreprocessor.ts`:

```ts
import { benchmarkVisionInference } from 'react-native-executorch';

const { result, durationMs } = await benchmarkVisionInference(
  () => llm.generate([screenshotMessage])
);
console.log(`[BENCHMARK] vision TTFT = ${durationMs} ms`);
```

**What to record per run**:
- Step count
- Per-step ms (min / median / p95 across all steps in a session)
- Vision TTFT (if `useVision: true`)
- Model variant (`gemma-4-e4b` or `gemma-4-e4b-quantized`)

### 2b. Memory headroom

**ADB `dumpsys meminfo`** — run after the agent has completed one full task
so the model weights are loaded and hot:

```bash
# Replace tech.bedda.deft with your build's package name if changed
adb shell dumpsys meminfo tech.bedda.deft | head -40
```

Key fields to record:
- **TOTAL PSS** (proportional set size, in kB) — effective memory used
- **TOTAL USS** (unique set size) — memory unique to this process
- **Native Heap** — where ExecuTorch loads model weights
- **Java Heap** — React Native runtime

**React Native Performance API** — add to a debug screen:

```ts
import { PerformanceObserver } from 'react-native';
// NativeModules.RNDeviceInfo.getTotalMemory() + getFreeMemory() (react-native-device-info)
```

Alternatively, read `/proc/meminfo` via `adb shell`:

```bash
adb shell cat /proc/meminfo | grep -E "MemTotal|MemFree|MemAvailable"
# Compute: headroom = MemAvailable before launch − MemAvailable after model load
```

**What to record**:
- PSS before launch (baseline)
- PSS with model loaded (idle, weights hot)
- PSS during active inference
- MemAvailable headroom (= device free RAM while Deft + model are running)

---

## 3. Tooling Setup

Step-by-step for an engineer with a test device.

### Prerequisites

```bash
# Install Android platform tools
brew install android-platform-tools   # macOS
# or: https://developer.android.com/tools/releases/platform-tools

# Verify ADB sees your device (USB debugging must be on)
adb devices
```

### 3.1 Build a debug APK

```bash
cd ~/oliver/projects/deft/repos/deft

# Install JS deps (no workspace flag avoids yarn workspace conflicts)
npm install --ignore-scripts --no-workspaces

# Pre-build executorch (generates lib/ for TypeScript)
cd react-native-executorch/packages/react-native-executorch
npm install --ignore-scripts --no-workspaces
npx react-native-builder-bob build
cd ../../..

# Generate Android project
npx expo prebuild --platform android --non-interactive

# Build debug APK (uses JDK 17 + pre-installed Android SDK)
cd android && ./gradlew :app:assembleDebug
cd ..
```

The APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.

### 3.2 Install and launch

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n tech.bedda.deft/.MainActivity
```

### 3.3 Capture benchmark output

```bash
# Stream logcat with benchmark lines only
adb logcat -s ReactNativeJS | grep "\[BENCHMARK\]"
```

### 3.4 Capture memory snapshot

```bash
# Before launching Deft
adb shell cat /proc/meminfo > before.txt

# After model download + one completed task
adb shell dumpsys meminfo tech.bedda.deft > meminfo_hot.txt
adb shell cat /proc/meminfo > after.txt

# Summarise
diff before.txt after.txt
```

### 3.5 Repeat for each device and model variant

| Variable | Values to test |
|---|---|
| Model | `gemma-4-e4b`, `gemma-4-e4b-quantized` |
| Vision | `useVision: false` (text-only), `useVision: true` |
| Task complexity | "Open Settings", 3-step task, 10-step task |

Run each combination 3× and report median ms/step and PSS.

---

## 4. Results Table

**Update (2026-08-13):** Pixel 8 / Galaxy S24 numbers below are cross-referenced from
[`react-native-executorch`](https://github.com/bedda-tech/react-native-executorch)'s own
benchmark suite (`docs/docs/02-benchmarks/inference-time.md`, `memory-usage.md`, and
`docs/docs/07-other/03-gemma4-guide.mdx`) — same repo, same model, same ExecuTorch runtime
Deft ships. They were **not measured inside Deft's agent loop**: that repo's harness
(`scripts/benchmark_gemma4.py`) measures raw model throughput/TTFT/memory directly, not
Deft's full per-step latency (screen read → inference → tool parse → execute → settle) as
scoped in Section 2a. Treat these as a strong proxy, not a substitute for the ms/step
instrumentation described above — no one has run that instrumentation on physical hardware
yet.

**Device/variant caveats — read before citing these numbers:**
- **Pixel 8 vs Pixel 8 Pro:** Deft's target device is the base Pixel 8 (8 GB RAM, Section 1).
  The source numbers are from a **Pixel 8 Pro** (12 GB RAM, larger ML accelerator). Expect the
  base Pixel 8 to run measurably slower / closer to OOM given 4 GB less headroom against the
  quantized model's ~5.8 GB peak footprint.
- **Galaxy S24 RAM:** the source lists its S24 unit at 12 GB RAM; Deft's Section 1 table
  assumes the 8 GB US variant. This discrepancy is unreconciled (possibly a different regional
  SKU) — don't treat the throughput number as validated for the specific 8 GB US unit Deft
  targets until confirmed on real hardware.
- **No direct Pixel 6a data exists anywhere.** The closest available proxy is the Pixel 7a
  (same Tensor G2 SoC family, 8 GB RAM), on which the source recorded **OOM on every Gemma 4
  variant** (quantized and bf16). Pixel 6a has *less* RAM (6 GB, Section 1), so it will almost
  certainly also OOM on `gemma-4-e4b-quantized` — that's an inference from a same-chip-family
  proxy, not a measurement, and still needs confirming on real hardware.
- **`gemma-4-e4b` (full bf16 precision) OOMs on every device tested**, including the
  higher-RAM Pixel 8 Pro and Galaxy S24 (12 GB each). Don't expect it to run on any of Deft's
  target devices — `gemma-4-e4b-quantized` is the only realistic variant.

### 4a. Inference latency

The source harness doesn't measure "ms/step" (Deft's full agent-step metric, Section 2a) — it
separately measures **decode throughput** (tokens/s, steady-state generation) and **first-token
latency** (TTFT, ms). Both are reported below as the closest available proxy; cells with no
data are still blank pending physical hardware.

**Decode throughput (tokens/s, 200-token completion from a 128-token prompt):**

| Device | gemma-4-e4b | gemma-4-e4b-quantized |
|---|---|---|
| Pixel 6a | — (no hardware; Pixel 7a proxy suggests OOM) | — (no hardware; Pixel 7a proxy suggests OOM) |
| Pixel 8 *(Pixel 8 Pro data — see caveats)* | OOM | 11.3 tok/s |
| Galaxy S24 *(see RAM caveat)* | OOM | 12.1 tok/s |
| Sub-$300 (TBD) | — | — |

### 4b. First-token latency / Vision TTFT (ms)

Text-only TTFT (~128-token prompt) and screenshot TTFT (896×896 PNG, `useVision: true`),
quantized model only — bf16 OOMs on every device above.

| Device | Text-only TTFT | Screenshot TTFT |
|---|---|---|
| Pixel 6a | — | — |
| Pixel 8 *(Pixel 8 Pro data)* | 1840 ms | 4650 ms |
| Galaxy S24 *(see RAM caveat)* | 1720 ms | 4380 ms |
| Pixel 7a *(Pixel 6a proxy only, not a target device)* | OOM | OOM |
| Sub-$300 (TBD) | — | — |

### 4c. Memory headroom

The source reports **peak RSS increase** (model load + active inference, relative to baseline
app memory) — not the PSS/MemAvailable breakdown Section 2b describes, but the same underlying
signal: how much RAM the model consumes while running.

| Device | RAM | Peak RSS increase (`gemma-4-e4b-quantized`) | PSS during inference | MemAvailable headroom |
|---|---|---|---|---|
| Pixel 6a | 6 GB | — (no hardware; Pixel 7a proxy suggests OOM — 6 GB is below the ~5.8 GB peak footprint, leaving near-zero headroom) | — | — |
| Pixel 8 *(Pixel 8 Pro data, 12 GB RAM — not the 8 GB base Pixel 8)* | 8 GB | 5.8 GB | — | — |
| Galaxy S24 *(see RAM caveat)* | 8 GB | 5.6 GB | — | — |
| Sub-$300 (TBD) | ≥ 6 GB | — | — | — |

**Gap still requiring physical hardware:** Pixel 6a and the sub-$300 device — the two
remaining target devices from roadmap.md's v1.3.0 candidate — have no data anywhere; the
source repo never tested a device in that RAM/chip class either. Someone with physical access
to a Pixel 6a and a sub-$300 Android device still needs to run the adb methodology in
Section 3 on those two before this table is complete.

---

## 5. Minimum Specification

Based on the Gemma 4 model card, ExecuTorch runtime requirements, and the
native module constraints in this repo:

### Android version

| Requirement | Min API | Source |
|---|---|---|
| Gesture dispatch (`GestureDescription`) | **API 26** (Android 8.0) | `react-native-accessibility-controller/android/build.gradle` `minSdkVersion 26` |
| Accessibility screenshot (`takeScreenshot`) | **API 30** (Android 11) | `AccessibilityService.takeScreenshot()` added in API 30; guarded in `ActionDispatcher.kt` |
| Foreground service (special use) | **API 34** (Android 14) recommended | `FOREGROUND_SERVICE_TYPE_SPECIAL_USE` introduced in API 34; older devices fall back gracefully |
| **Effective minimum** | **API 30 (Android 11)** | Required for screenshot-based vision; text-only mode works from API 26 |

### RAM

| Model variant | Model file size (INT4) | Estimated peak PSS | Minimum device RAM |
|---|---|---|---|
| `gemma-4-e2b-quantized` | ~1.2 GB | ~2.5 GB | **4 GB** |
| `gemma-4-e4b-quantized` | ~2.4 GB | ~4.0 GB | **6 GB** |
| `gemma-4-e4b` (full precision) | ~8 GB | ~10 GB | ≥ 12 GB (not recommended for mobile) |

> The **recommended minimum** for on-device inference with `gemma-4-e4b-quantized`
> is **6 GB RAM on Android 11+**. Devices with 4 GB RAM should use
> `gemma-4-e2b-quantized` or route inference through the cloud fallback.

### Storage

Download the quantized E4B model once (~2.4 GB) to local device storage.
The app caches it via `react-native-executorch`'s `ResourceFetcher` and only
downloads on first use.

---

## References

- [Gemma 4 model card — google/gemma-4-e4b-it](https://huggingface.co/google/gemma-4-e4b-it)
- [react-native-executorch (bedda-tech fork)](https://github.com/bedda-tech/react-native-executorch)
- [ExecuTorch runtime documentation](https://pytorch.org/executorch/)
- `react-native-executorch` Gemma 4 utilities: `packages/react-native-executorch/src/utils/llms/gemma4/`
- `benchmarkVisionInference()`: `packages/react-native-executorch/src/utils/llms/gemma4/screenshotPreprocessor.ts`
- Agent loop timing hook: `react-native-device-agent/src/agent/AgentLoop.ts:164`
