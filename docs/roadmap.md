# Deft Roadmap

This is a living document. Feature candidates are research-complete but not committed — priorities shift as usage data comes in.

---

## Shipped — v1.2.x

- Android foreground service keeps agent alive when the user switches apps
- AsyncStorage task persistence — resume after force-quit or device restart
- Push-to-talk voice input via `expo-speech-recognition`
- Quick Commands — long-press any message bubble to save it
- History screen search + outcome filter
- Result notification when a background task completes
- EAS build in CI via `expo prebuild` + Gradle (no Expo account required)

---

## v1.3.0 Candidates

### iOS Support Investigation

Document the full engineering cost of supporting iOS: `AccessibilityService` has no direct iOS equivalent, but the Accessibility API (`UIAccessibility`) plus `AXRuntime` (private, requires entitlements) covers partial read access. An investigation issue would clarify what's possible within App Store policy, what requires an enterprise/MDM distribution path, and whether a supervised device mode is a viable first target. Unblocks contributors from exploring without duplicating research.

### Web Browsing Tool Preset

Add a `web` preset to `PHONE_TOOL_PRESETS` in `PhoneTools.ts` containing `open_app`, `tap`, `type_text`, `scroll`, `read_screen`, `find_node`, `wait_for_change`, and `screenshot`. Chrome on Android exposes full accessibility trees (headings, links, inputs, tab bar) — a focused preset avoids sending navigation and note tools to a model that only needs browser controls, which reduces token usage and hallucinations on web-only tasks.

### Onboarding UX Improvements

The current `ModelDownloadScreen` shows a progress bar but gives no guidance on what tasks Deft can do, what permissions to grant, or how to phrase commands. A guided first-task flow (3 onboarding cards → permission grant → one example task inline) would significantly reduce first-run drop-off for beta users. This is pure TypeScript/React Native — a good first contribution.

### Gemma 4 Performance Benchmarks

Publish measured inference latency (ms/step) and memory headroom (GB) for a representative set of Android devices: Pixel 6a (mid-range), Pixel 8 (flagship), Galaxy S24 (Snapdragon), and at least one sub-$300 device. Results would go in `docs/benchmarks.md` and the main README. Knowing the hardware floor is the most common question from contributors and potential users.

### Cloud-Only Mode Polish

The settings screen already has OpenAI/Anthropic/OpenRouter selectors and an API key field, but the on-device model download is still required before cloud mode is usable. Decouple cloud mode from model download: skip the model download step in onboarding when `cloudFallback = true` and a valid API key is set. This makes Deft immediately usable on any Android device as a cloud-backed agent — no 2.5 GB download gating access.

---

## v1.4.0 Ideas (not yet scoped)

- `find_all_nodes` + multi-step scroll-until-found for agents operating in long lists
- Shared context between `TaskPlanner` subtasks (pass output of subtask N as input to N+1)
- Watchdog mode: run a recurring background check ("notify me when my Uber is 5 minutes away") on a cron schedule using the foreground service
- react-native-accessibility-controller v2: TurboModule migration (currently legacy package), MediaProjection screenshot API (faster than AccessibilityService screenshots)
