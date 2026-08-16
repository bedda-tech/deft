# Deft Roadmap

This is a living document. Feature candidates are research-complete but not committed — priorities shift as usage data comes in.

**Updated 2026-08-16 (plan-harvester run #164):** this doc had not been touched since v1.3.0
(2026-06-01) despite the app shipping five more minor versions since. All three items below that
used to read "candidate" / "not yet scoped" were done, verified against CHANGELOG.md and the repo.

---

## Shipped — v1.2.x

- Android foreground service keeps agent alive when the user switches apps
- AsyncStorage task persistence — resume after force-quit or device restart
- Push-to-talk voice input via `expo-speech-recognition`
- Quick Commands — long-press any message bubble to save it
- History screen search + outcome filter
- Result notification when a background task completes
- EAS build in CI via `expo prebuild` + Gradle (no Expo account required)

## Shipped — v1.3.0

- Web Browsing Tool Preset — `web` preset in `PHONE_TOOL_PRESETS` for Chrome browser-focused tasks
- Cloud-Only Mode Polish — skip model download in onboarding when a cloud API key is configured; add "Use cloud API instead" option during the model download step
- Onboarding UX Improvements — step badge on WelcomeScreen, tappable example command chips on ReadyScreen that pre-fill the chat input on first launch
- Shared context between `TaskPlanner` subtasks — each completed subtask's result is forwarded as context to the next, so multi-step tasks are fully aware of prior progress
- **iOS Support Investigation** — `docs/ios-investigation.md` (#2503). Verdict: not viable as a standard App Store distribution; the one workable path is enterprise/MDM + `AXRuntime` entitlement, post-v1.x.
- **Gemma 4 Performance Benchmarks** — `docs/benchmarks.md` (#2505 methodology, #6268 cross-referenced Pixel 8 Pro / Galaxy S24 numbers from the sibling react-native-executorch repo). Still open: Pixel 6a and a sub-$300 device have no data anywhere and need physical hardware access to measure — deliberately left as a doc gap, not a task (#6268's own reasoning: doesn't meet the credential/decision/money bar for a Matt ticket).
- **scroll-until-found pattern documented** — `docs/agent-patterns.md` (#2504), alongside the `find_all_nodes` tool.

## Shipped — v1.4.0

- **Watchdog Mode** — recurring background check via `/watch every Nm: <condition>`, foreground-service-backed (`docs/watchdog-design.md`, #2506).
- **react-native-accessibility-controller v2** — full TurboModule migration + `MediaProjection` screenshot API.
- **Dual-Model AgentLoop** — FunctionGemma 270M (tool dispatch) + Gemma 4 E4B (reasoning).

## Shipped — v1.4.1–v1.4.5

- Android minSdkVersion fixes, Release CI permission fix (APK asset upload), human-readable `scroll_until_found` action labels.

---

## Open items (not yet scoped as tasks)

- Physical-device benchmark numbers (Pixel 6a, sub-$300 device) for `docs/benchmarks.md` — needs someone with the actual hardware to run the documented adb methodology; see note above.
- Real public launch (dev.to article + Show HN) and a Google Play Store listing — tracked as a Matt decision, not an engineering candidate (queue #6969, filed 2026-08-16).
