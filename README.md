<p align="center">
  <img src="./assets/deft-logo.png" alt="Deft" width="180" />
</p>

<div align="center">
  <h1 align="center" style="display:inline-block">Deft
  </h1>
</div>


[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![build](https://img.shields.io/github/actions/workflow/status/bedda-tech/deft/ci.yml?branch=main)](https://github.com/bedda-tech/deft/actions)

**On-device AI phone agent for Android.** Control your phone with natural language. No cloud, no tether -- everything runs locally.

Deft is the consumer app that combines three open-source React Native libraries into a single experience: speak a command, and a local LLM reads the screen, reasons about the task, and executes actions on your behalf.

---

## How It Works

```
 "Open Settings and turn on Wi-Fi"
         |
         v
 +-------------------+
 |     Deft App       |   Chat UI + Voice Input
 +-------------------+
         |
         v
 +-------------------+
 | device-agent       |   Observe -> Think -> Act -> Repeat
 +-------------------+
    |         |
    v         v
 a11y-ctrl  executorch
    |         |
    v         v
 Android    Gemma 4
 A11y       (on-device
 Service     LLM)
    |
    v
 Any app on your phone
```

1. You say or type a command
2. The agent reads the current screen via the accessibility tree
3. Gemma 4 (running locally on your phone) decides what action to take
4. The action is executed (tap, swipe, type, navigate)
5. The agent observes the result and repeats until done

All inference and control happens on-device. No data leaves your phone.

## Features

- **Chat interface** -- talk to your phone agent via text or voice
- **Live screen overlay** -- see what the agent is doing in real-time
- **Task history** -- review past agent sessions
- **Model selection** -- choose between Gemma 4 E2B (faster) and E4B (smarter)
- **Cloud fallback** -- optional cloud LLM for complex tasks
- **Onboarding** -- guided setup for AccessibilityService permissions and model download

## Screenshots

> Coming soon -- the app is in early development.

## Getting Started

### Prerequisites

- Node.js >= 18
- Android device or emulator (API 30+)
- Expo CLI (`npm install -g expo-cli`)

### Install

```bash
git clone https://github.com/bedda-tech/deft.git
cd deft
npm install
```

### Run

```bash
# Start the dev server
npm start

# Run on Android
npm run android
```

### Enable Accessibility Service

After installing, you need to enable the Deft accessibility service:

1. Open Android Settings > Accessibility
2. Find "Deft" in the list
3. Toggle it on and confirm

### Download the Model

On first launch, the app will prompt you to download the Gemma 4 model (~2.5GB). This is a one-time download stored locally on your device.

## App Structure

```
deft/
  App.tsx                          # Root: onboarding gate + tab navigation
  app/
    chat/ChatScreen.tsx            # Chat UI with voice input and agent status
    history/HistoryScreen.tsx      # Past agent sessions with expandable rows
    settings/SettingsScreen.tsx    # Model selection, cloud config, loop settings
    onboarding/
      WelcomeScreen.tsx
      PermissionsScreen.tsx        # Accessibility service setup
      OverlayPermissionScreen.tsx  # SYSTEM_ALERT_WINDOW permission
      ModelDownloadScreen.tsx      # Download Gemma 4 with progress bar
      ReadyScreen.tsx
  src/
    agent/
      agentBridge.ts              # Drives AgentLoop, streams events to chatStore
      llmBridge.ts                # Singleton for on-device generate functions
    components/
      AgentOverlay.tsx            # Floating overlay showing live agent actions
      ScreenPreview.tsx           # Real-time accessibility tree visualisation
    store/
      agentStore.ts               # Running state (isRunning, currentStep)
      chatStore.ts                # Current session messages
      historyStore.ts             # Persisted sessions (AsyncStorage, max 100)
      onboardingStore.ts          # One-time completion flag
      settingsStore.ts            # User preferences with AsyncStorage persistence
```

## Tech Stack

- **Expo** + React Native (New Architecture) — plain App.tsx navigation, no Expo Router
- **Lightweight pub/sub stores** — no Zustand, no Redux; simple `Set<listener>` pattern
- **react-native-accessibility-controller** for screen reading and actions
- **react-native-executorch** for on-device Gemma 4 inference
- **react-native-device-agent** for the agent orchestration loop
- **expo-speech-recognition** for voice input
- **@react-native-async-storage/async-storage** for settings and history persistence

## Deft Ecosystem

| Package | Description |
|---------|-------------|
| [react-native-accessibility-controller](https://github.com/bedda-tech/react-native-accessibility-controller) | Android AccessibilityService for React Native |
| [react-native-device-agent](https://github.com/bedda-tech/react-native-device-agent) | Agent loop connecting LLM to phone control |
| [react-native-executorch](https://github.com/bedda-tech/react-native-executorch) | On-device LLM inference (Gemma 4) via ExecuTorch |
| [deft](https://github.com/bedda-tech/deft) | The consumer app combining all three (this repo) |

## Distribution

- **F-Droid** (open source Android store)
- **GitHub Releases** (direct APK download)
- **Google Play** (planned)

## Contributing

Contributions are welcome. For lower-level changes (gesture APIs, accessibility tree, LLM providers), contribute to the individual library repos. This repo is for app-level features: UI, onboarding, settings, and model management.

**Setup**

```bash
git clone https://github.com/bedda-tech/deft.git
cd deft
npm install
npm start
```

You need an Android device or emulator (API 30+) with developer mode enabled. On first run, the app will prompt you to enable the Deft AccessibilityService and download the Gemma 4 model (~2.5 GB).

**Guidelines**

- TypeScript strict throughout -- no `any`, no type assertions without a comment
- Use pub/sub stores (`src/store/`) for all shared state; keep side effects in `src/agent/`
- Add new tabs/screens under `app/` and wire them in `App.tsx`
- Test onboarding changes on a real device; emulators skip some accessibility flows
- Open an issue before starting large changes

**Related Repos**

- [react-native-accessibility-controller](https://github.com/bedda-tech/react-native-accessibility-controller) -- screen reading, gestures, global actions
- [react-native-device-agent](https://github.com/bedda-tech/react-native-device-agent) -- agent loop and LLM providers
- [react-native-executorch](https://github.com/bedda-tech/react-native-executorch) -- on-device Gemma 4 inference

## License

MIT
