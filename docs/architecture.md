# Deft Architecture

## System Diagram

```mermaid
graph TD
    User(["👤 User<br/>voice / text"])

    subgraph DeftApp["Deft App"]
        Chat["Chat UI<br/><i>ChatScreen.tsx</i>"]
        Settings["Settings<br/><i>SettingsScreen.tsx</i>"]
        History["History<br/><i>HistoryScreen.tsx</i>"]
        VoiceMod["Voice Module<br/><i>VoiceModule.tsx</i>"]
        Overlay["Screen Overlay<br/><i>AgentOverlay.tsx</i>"]
    end

    subgraph DevAgent["react-native-device-agent"]
        AgentLoop["AgentLoop<br/><i>Observe → Reason → Act</i>"]
        ToolRegistry["Tool Registry<br/><i>22 phone control tools</i>"]
        TaskPlanner["TaskPlanner<br/><i>multi-step decomposition</i>"]
        CloudProv["Cloud Provider<br/><i>optional fallback LLM</i>"]
    end

    subgraph A11y["react-native-accessibility-controller"]
        A11yBridge["AccessibilityService Bridge<br/><i>screen reading + actions</i>"]
        OverlayMgr["Overlay Manager<br/><i>floating UI layer</i>"]
    end

    subgraph Executorch["react-native-executorch"]
        Gemma["Gemma 4 E4B<br/><i>on-device LLM (4 billion params)</i>"]
        Whisper["Whisper Tiny EN<br/><i>speech-to-text (q8)</i>"]
        Kokoro["Kokoro Small<br/><i>text-to-speech</i>"]
        Runtime["ExecuTorch Runtime<br/><i>CPU / GPU delegate</i>"]
    end

    AndroidA11y["Android AccessibilityService<br/><i>reads any app's UI tree</i>"]
    AnyApp["📱 Any App on Phone"]
    CloudAPI["☁️ Cloud API<br/><i>Anthropic / OpenAI / OpenRouter</i>"]

    User -->|command| Chat
    Chat -->|processCommand| AgentLoop
    VoiceMod -->|transcribeAudio| Whisper
    VoiceMod -->|forward| Kokoro
    AgentLoop --> TaskPlanner
    AgentLoop -->|getAccessibilityTree / tap / swipe| A11yBridge
    AgentLoop -->|generate / generateWithTools| Gemma
    AgentLoop -->|optional| CloudProv
    TaskPlanner --> AgentLoop
    A11yBridge --> AndroidA11y
    AndroidA11y -->|reads + controls| AnyApp
    OverlayMgr --> Overlay
    Gemma --> Runtime
    Whisper --> Runtime
    Kokoro --> Runtime
    CloudProv -->|HTTPS| CloudAPI

    style DeftApp fill:#1a1a2e,stroke:#6366f1,color:#e5e5e5
    style DevAgent fill:#0d1f0d,stroke:#4ADE80,color:#e5e5e5
    style A11y fill:#1f1a0d,stroke:#f59e0b,color:#e5e5e5
    style Executorch fill:#1a0d1f,stroke:#a855f7,color:#e5e5e5
```

## Component Descriptions

### Deft App
The consumer Android app built with Expo and React Native. Provides a chat interface for natural-language commands, a settings screen for model and agent configuration, a session history screen, a screen overlay showing real-time agent actions, and a VoiceModule that bridges Kokoro TTS and Whisper STT to the rest of the app.

### react-native-device-agent
The core agent orchestration library. `AgentLoop` runs the observe→reason→act cycle: reads the screen, sends context to the LLM, executes the chosen tool, then repeats. `TaskPlanner` decomposes complex requests into subtasks before delegating to `AgentLoop`. `ToolRegistry` manages 22 phone-control tools (tap, swipe, type, scroll, open app, global actions, find node, etc.). `CloudProvider` supports Anthropic, OpenAI, and OpenRouter as optional cloud LLM backends.

### react-native-accessibility-controller
A TurboModule wrapping Android's `AccessibilityService`. Reads the full UI tree of any foreground app, dispatches gestures and typed input, takes screenshots, and manages a system-level floating overlay window.

### react-native-executorch
A fork of the Software Mansion ExecuTorch library with Gemma 4 chat template support, Whisper STT, and Kokoro TTS. Runs all inference on-device via the ExecuTorch runtime — no network required.

## Data Flow

1. User speaks or types a command in the chat UI.
2. If voice mode is active, VoiceModule captures audio and Whisper transcribes it.
3. The command is passed to `AgentLoop` (or `TaskPlanner` in plan mode).
4. Each loop iteration: read the accessibility tree → format prompt → call Gemma 4 (or cloud LLM) → parse tool call → execute action → observe result → repeat.
5. Completed agent text responses are read aloud via Kokoro TTS when voice mode or TTS is enabled.
6. All inference and phone control happens on-device. No user data leaves the phone (unless cloud fallback is explicitly enabled).

## Agent Patterns

For common multi-step patterns used by the agent (scroll-until-found, waiting for async UI, etc.) see [docs/agent-patterns.md](./agent-patterns.md).
