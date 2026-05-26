# Changelog

All notable changes to the Deft app are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] – 2026-05-26

### Added

**Chat interface**
- Action count and elapsed time displayed in the agent status bar
- Step X/Y progress indicator in the agent status bar
- Human-readable action descriptions in chat history (e.g. "Tap node btn-42", "Type "hello"")
- Character counter on the chat input field (X/500, turns red above 400)

**History screen**
- Share button on session rows to share session transcripts
- Session duration recorded and displayed per history row

**Settings screen**
- Timeout setting for agent loop (max seconds before auto-stop)
- Max history items setting to cap per-session step retention
- Max screen length setting to limit accessibility tree size sent to LLM
- Tool preset selector (read-only / navigation / in-app) with maxSubTasks field for plan mode
- Context variables field with JSON input validated by `parseContextJson`

**Agent infrastructure**
- Text-to-speech for agent responses via `expo-speech`
- Vibration feedback on agent actions and on timeout events
- `get_bounds` and `set_checked` tools added to navigation and in-app tool presets

### Changed

- `TaskPlanner.abort()` is now wired so stopping the agent is immediate even mid-planner execution

### Fixed

- Missing `maxSteps` field in the initial `AgentState` value in `ChatScreen.tsx` (caused TypeScript CI failure)
- `resolveToolFilter` now stays in sync with `PHONE_TOOL_PRESETS` to prevent tool mismatch
- `agentBridge` now handles the `failed` agent event and includes `task_failed` in the system prompt

## [1.0.0] – 2026-04-22

Initial public release.

### Added

**Onboarding**
- Welcome screen introducing the app and its capabilities
- Permissions screen guiding users through AccessibilityService setup
- Model download screen with animated progress bar and spec summary

**Chat interface** (`app/chat/ChatScreen.tsx`)
- Voice input via `expo-speech-recognition` with one-tap record/stop
- Text input fallback with auto-expanding composer
- Agent status banner (Idle / Working / Done) with animated indicator
- Collapsible ScreenPreview panel showing live accessibility tree text
- Distinct message bubbles for user text, agent actions, screen snapshots, and pending (streaming) responses
- Clear session button

**History screen** (`app/history/HistoryScreen.tsx`)
- Expandable session rows with `LayoutAnimation` for smooth expand/collapse
- Outcome badge (Complete / Stopped / Error) with colour coding
- Action list showing every step the agent took per session
- AsyncStorage-backed persistence capped at 100 sessions

**Settings screen** (`app/settings/SettingsScreen.tsx`)
- Model selector: Gemma 4 E2B (fast) vs E4B (stronger reasoning)
- In-card model status indicator: Ready / Loading / Downloading / Unavailable
- Animated download progress bar with percentage label
- "Download model" button when model is not yet on device
- Cloud fallback toggle with API key and model ID inputs
- Agent loop controls: max steps stepper (1–50), settle delay stepper (100–2000 ms)
- Vision mode toggle (screenshot per observation step)
- Reset to Defaults

**Agent infrastructure**
- `agentBridge.ts` – drives `AgentLoop` from `react-native-device-agent`, streams events to chat and history stores; falls back to a canned stub in simulator/dev environments
- `llmBridge.ts` – singleton registry for the on-device generate functions; supports subscription for readiness changes
- `modelManager.ts` – centralised download, init, and unload logic for Gemma 4 (E2B/E4B); used by both onboarding and settings flows; includes DEV-mode simulated download
- `AgentOverlay.tsx` – headless component driving the native floating overlay via AccessibilityController; shows current action and step count on top of all apps

**State management** (custom pub/sub stores, no Zustand)
- `chatStore.ts` – in-memory message list with subscribe/notify pattern
- `historyStore.ts` – AsyncStorage-backed session history (max 100 entries)
- `settingsStore.ts` – AsyncStorage-backed settings with immediate-save on change
- `agentStore.ts` – in-memory agent running state (task, step count, screen state)
- `onboardingStore.ts` – AsyncStorage flag for onboarding completion

**Provider selection** (via `agentBridge.buildProvider`)
- On-device only → `GemmaProvider` wired from `llmBridge` singletons
- Cloud only → `CloudProvider` (OpenAI or Anthropic, auto-detected by model name)
- Both available → `FallbackProvider` (prefers on-device, auto-falls back to cloud)

### Configuration

- `app.json`: Expo config with Android permissions (`SYSTEM_ALERT_WINDOW`, `RECORD_AUDIO`), dark splash, and `expo-av` plugin
- `eas.json`: development / preview / production build profiles (all APK)
- `.github/workflows/ci.yml`: TypeScript typecheck on every push
- `.github/workflows/release.yml`: APK build + upload to GitHub Releases on version tags

[Unreleased]: https://github.com/bedda-tech/deft/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/bedda-tech/deft/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/bedda-tech/deft/releases/tag/v1.0.0
