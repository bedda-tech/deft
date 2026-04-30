/**
 * ChatScreen — the main Deft agent interface.
 *
 * Users type or speak commands here. The screen shows:
 *   - A scrollable list of chat messages (user commands, agent actions, screen updates)
 *   - A text input bar with a send button
 *   - A mic button for voice input via expo-speech-recognition (Android SpeechRecognizer)
 *
 * Agent actions and screen-state changes arrive as messages with kind='action'
 * or kind='screen', displayed with distinct visual treatments to distinguish
 * them from plain conversation.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
  Animated,
} from 'react-native';
import {
  type ChatMessage,
  addMessage,
  clearMessages,
  subscribe,
} from '../../src/store/chatStore';
import { processCommand, stopAgent } from '../../src/agent/agentBridge';
import { subscribeAgentState, type AgentState } from '../../src/store/agentStore';
import { getSettings, subscribeSettings } from '../../src/store/settingsStore';
import { ScreenPreview } from '../../src/components/ScreenPreview';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RecordingState = 'idle' | 'recording' | 'processing';

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [agentState, setAgentState] = useState<AgentState>({
    isRunning: false,
    currentTask: null,
    currentStep: 0,
    currentScreenState: null,
  });
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const ttsEnabledRef = useRef(getSettings().ttsEnabled);
  // Maps message id → pending state from the previous update, used to detect transitions.
  const prevPendingRef = useRef<Map<string, boolean>>(new Map());

  // Track the latest ttsEnabled setting without re-subscribing to messages.
  useEffect(() => {
    return subscribeSettings((s) => { ttsEnabledRef.current = s.ttsEnabled; });
  }, []);

  // Subscribe to the shared message store; trigger TTS when an agent text message resolves.
  useEffect(() => {
    const unsub = subscribe((msgs) => {
      setMessages(msgs);

      if (ttsEnabledRef.current) {
        for (const msg of msgs) {
          if (msg.role === 'agent' && msg.kind === 'text' && !msg.pending) {
            const prevPending = prevPendingRef.current.get(msg.id);
            // Speak when: newly added as resolved, or just transitioned from pending→resolved.
            if (prevPending === undefined || prevPending === true) {
              speakAgentResponse(msg.text);
            }
          }
        }
      }

      const next = new Map<string, boolean>();
      for (const msg of msgs) next.set(msg.id, !!msg.pending);
      prevPendingRef.current = next;
    });
    return unsub;
  }, []);

  // Subscribe to agent running state
  useEffect(() => {
    const unsub = subscribeAgentState(setAgentState);
    return unsub;
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 50);
    }
  }, [messages]);

  const sendText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setInputText('');
    stopSpeech();
    addMessage('user', 'text', trimmed);
    await processCommand(trimmed);
  }, []);

  const handleSend = useCallback(() => {
    sendText(inputText);
  }, [inputText, sendText]);

  const handleSuggestion = useCallback((text: string) => {
    sendText(text);
  }, [sendText]);

  // Wire up expo-speech-recognition event listeners. Lazy-required so the app
  // compiles and runs in environments where the native module isn't linked.
  useEffect(() => {
    let subs: Array<{ remove(): void }> = [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sr = require('expo-speech-recognition') as typeof import('expo-speech-recognition');

      subs.push(
        sr.addSpeechRecognitionListener('result', (event) => {
          const text = event.results[0]?.transcript ?? '';
          if (event.isFinal) {
            setRecordingState('idle');
            setInputText('');
            if (text.trim()) {
              void sendText(text);
            }
          } else {
            // Show live interim transcript in the input field
            setInputText(text);
          }
        }),
        sr.addSpeechRecognitionListener('end', () => {
          // Recognition ended without a final result (e.g. silence timeout)
          setRecordingState((s) => (s === 'recording' ? 'idle' : s));
        }),
        sr.addSpeechRecognitionListener('error', () => {
          setRecordingState('idle');
        }),
      );
    } catch { /* expo-speech-recognition not linked */ }

    return () => { subs.forEach((s) => s.remove()); };
  }, [sendText]);

  const handleVoice = useCallback(async () => {
    if (recordingState === 'recording') {
      stopSpeechRecognition();
      setRecordingState('idle');
    } else if (recordingState === 'idle') {
      const started = await startSpeechRecognition();
      if (started) setRecordingState('recording');
    }
  }, [recordingState]);

  return (
    <SafeAreaView style={styles.safe}>
      <Header onClear={clearMessages} />
      <ScreenPreview refreshIntervalMs={3000} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {messages.length === 0 ? (
          <EmptyState onSuggestion={handleSuggestion} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => <MessageBubble message={item} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
        {agentState.isRunning && (
          <AgentStatusBar
            step={agentState.currentStep}
            onStop={stopAgent}
          />
        )}
        <InputBar
          value={inputText}
          onChangeText={setInputText}
          onSend={handleSend}
          onVoice={handleVoice}
          recordingState={recordingState}
          agentRunning={agentState.isRunning}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({ onClear }: { onClear: () => void }) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Deft</Text>
      <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.headerClear}>Clear</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Agent status bar (shown while agent is running)
// ---------------------------------------------------------------------------

function AgentStatusBar({ step, onStop }: { step: number; onStop: () => void }) {
  return (
    <View style={styles.agentStatusBar}>
      <View style={styles.agentStatusDot} />
      <Text style={styles.agentStatusText}>
        {step === 0 ? 'Thinking…' : `Step ${step}`}
      </Text>
      <TouchableOpacity onPress={onStop} style={styles.stopButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.stopButtonText}>Stop</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIconWrap}>
        <Text style={styles.emptyIconText}>D</Text>
      </View>
      <Text style={styles.emptyHeadline}>What should I do?</Text>
      <Text style={styles.emptySubtext}>
        Type a command or tap the mic to speak.
      </Text>
      <View style={styles.suggestions}>
        <SuggestionChip text="Open Settings" onPress={onSuggestion} />
        <SuggestionChip text="Send a message to Mom" onPress={onSuggestion} />
        <SuggestionChip text="Turn on Wi-Fi" onPress={onSuggestion} />
      </View>
    </View>
  );
}

function SuggestionChip({ text, onPress }: { text: string; onPress: (text: string) => void }) {
  return (
    <TouchableOpacity style={styles.chip} onPress={() => onPress(text)} activeOpacity={0.7}>
      <Text style={styles.chipText}>{text}</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function copyMessageText(text: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
    void Clipboard.setStringAsync(text);
    ToastAndroid.show('Copied', ToastAndroid.SHORT);
  } catch { /* expo-clipboard not linked */ }
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isAction = message.kind === 'action';
  const isScreen = message.kind === 'screen';

  if (isScreen) {
    return (
      <View style={styles.screenRow}>
        <View style={styles.screenLinePre} />
        <Text style={styles.screenLabel}>{message.text}</Text>
        <View style={styles.screenLinePost} />
      </View>
    );
  }

  if (isAction) {
    return (
      <TouchableOpacity
        style={styles.actionRow}
        onLongPress={() => copyMessageText(message.text)}
        activeOpacity={1}
        delayLongPress={400}
      >
        <View style={styles.actionDot} />
        <Text style={styles.actionText} numberOfLines={2}>{message.text}</Text>
        {message.pending && <PendingDots />}
      </TouchableOpacity>
    );
  }

  if (isUser) {
    return (
      <View style={[styles.bubbleRow, styles.bubbleRowUser]}>
        <View style={[styles.bubble, styles.bubbleUser]}>
          <Text style={[styles.bubbleText, styles.bubbleTextUser]}>{message.text}</Text>
          {message.pending && <PendingDots />}
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.bubbleRow, styles.bubbleRowAgent]}
      onLongPress={() => copyMessageText(message.text)}
      activeOpacity={1}
      delayLongPress={400}
    >
      <View style={[styles.bubble, styles.bubbleAgent]}>
        <Text style={[styles.bubbleText, styles.bubbleTextAgent]}>
          {message.text}
        </Text>
        {message.pending && <PendingDots />}
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Pending animation (three dots)
// ---------------------------------------------------------------------------

function PendingDots() {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ]),
      );
    const a1 = pulse(dot1, 0);
    const a2 = pulse(dot2, 150);
    const a3 = pulse(dot3, 300);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.dots}>
      {[dot1, dot2, dot3].map((d, i) => (
        <Animated.View key={i} style={[styles.dot, { opacity: d }]} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Input bar
// ---------------------------------------------------------------------------

interface InputBarProps {
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  onVoice: () => void;
  recordingState: RecordingState;
  agentRunning?: boolean;
}

function InputBar({ value, onChangeText, onSend, onVoice, recordingState, agentRunning }: InputBarProps) {
  const isRecording = recordingState === 'recording';
  const isProcessing = recordingState === 'processing';
  const inputDisabled = isProcessing || !!agentRunning;
  const canSend = value.trim().length > 0 && !inputDisabled && !isRecording;

  return (
    <View style={styles.inputBar}>
      {/* Mic button */}
      <TouchableOpacity
        style={[
          styles.micButton,
          isRecording && styles.micButtonActive,
          isProcessing && styles.micButtonProcessing,
        ]}
        onPress={onVoice}
        disabled={inputDisabled}
        activeOpacity={0.75}
      >
        <Text style={styles.micIcon}>{isRecording ? '■' : isProcessing ? '…' : '🎙'}</Text>
      </TouchableOpacity>

      {/* Text input + character counter */}
      <View style={styles.textInputWrapper}>
        <TextInput
          style={[styles.textInput, inputDisabled && styles.textInputDisabled]}
          value={value}
          onChangeText={onChangeText}
          placeholder={
            agentRunning ? 'Agent is running…' :
            isRecording ? 'Listening… (tap ■ to stop)' :
            'Tell Deft what to do'
          }
          placeholderTextColor="#555"
          onSubmitEditing={onSend}
          returnKeyType="send"
          multiline
          editable={!inputDisabled && !isRecording}
          blurOnSubmit={false}
        />
        {value.length > 0 && (
          <Text style={[styles.charCounter, value.length > 400 && styles.charCounterWarn]}>
            {value.length}/500
          </Text>
        )}
      </View>

      {/* Send button */}
      <TouchableOpacity
        style={[styles.sendButton, canSend && styles.sendButtonActive]}
        onPress={onSend}
        disabled={!canSend}
        activeOpacity={0.75}
      >
        <Text style={[styles.sendIcon, canSend && styles.sendIconActive]}>↑</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Voice recognition helpers (expo-speech-recognition)
// ---------------------------------------------------------------------------

/**
 * Request microphone permission and start Android's native SpeechRecognizer.
 * Interim results flow back via the 'result' event listener set up in the
 * ChatScreen component. Falls back gracefully when the module is not linked.
 */
async function startSpeechRecognition(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition') as
      typeof import('expo-speech-recognition');
    const { status } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (status !== 'granted') return false;
    ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true, continuous: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop an in-progress speech recognition session. The 'end' event will fire
 * once Android has finished processing, at which point the component resets
 * its recording state to idle.
 */
function stopSpeechRecognition(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition') as
      typeof import('expo-speech-recognition');
    ExpoSpeechRecognitionModule.stop();
  } catch { /* not linked */ }
}

interface SpeechModule {
  speak(text: string, options?: { language?: string }): void;
  stop(): void;
}

/**
 * Speak the given text using expo-speech TTS. Stops any in-progress speech
 * before starting. Falls back gracefully when the module is not linked.
 */
function speakAgentResponse(text: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Speech = require('expo-speech') as SpeechModule;
    Speech.stop();
    Speech.speak(text, { language: 'en-US' });
  } catch { /* expo-speech not linked */ }
}

/** Stop any ongoing TTS utterance. */
function stopSpeech(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Speech = require('expo-speech') as SpeechModule;
    Speech.stop();
  } catch { /* not linked */ }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  flex: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  headerClear: {
    fontSize: 14,
    color: '#555',
  },

  // Message list
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },

  // Empty state
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyIconText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
  },
  emptyHeadline: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  emptySubtext: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  chipText: {
    fontSize: 13,
    color: '#ccc',
  },

  // Bubbles
  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubbleRowAgent: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bubbleUser: {
    backgroundColor: '#fff',
    borderBottomRightRadius: 4,
  },
  bubbleAgent: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  bubbleTextUser: {
    color: '#0a0a0a',
  },
  bubbleTextAgent: {
    color: '#e5e5e5',
  },

  // Action rows (agent step indicators)
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  actionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#4ADE80',
    flexShrink: 0,
  },
  actionText: {
    fontSize: 13,
    color: '#888',
    flex: 1,
  },

  // Screen label (divider between screen states)
  screenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 6,
    paddingHorizontal: 4,
  },
  screenLinePre: {
    flex: 1,
    height: 1,
    backgroundColor: '#1e1e1e',
  },
  screenLabel: {
    fontSize: 11,
    color: '#444',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  screenLinePost: {
    flex: 1,
    height: 1,
    backgroundColor: '#1e1e1e',
  },

  // Pending dots
  dots: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    gap: 8,
  },
  micButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: {
    backgroundColor: '#1a2e1a',
    borderColor: '#4ADE80',
  },
  micButtonProcessing: {
    backgroundColor: '#1a1a2e',
    borderColor: '#818cf8',
  },
  micIcon: {
    fontSize: 16,
  },
  textInputWrapper: {
    flex: 1,
    gap: 2,
  },
  textInput: {
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#141414',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#fff',
    lineHeight: 20,
  },
  charCounter: {
    fontSize: 11,
    color: '#555',
    textAlign: 'right',
    paddingRight: 8,
  },
  charCounterWarn: {
    color: '#ef4444',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonActive: {
    backgroundColor: '#fff',
  },
  sendIcon: {
    fontSize: 18,
    fontWeight: '700',
    color: '#555',
  },
  sendIconActive: {
    color: '#0a0a0a',
  },

  // Agent status bar
  agentStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0d1f0d',
    borderTopWidth: 1,
    borderTopColor: '#1a3a1a',
    gap: 8,
  },
  agentStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ADE80',
  },
  agentStatusText: {
    flex: 1,
    fontSize: 13,
    color: '#4ADE80',
    fontWeight: '500',
  },
  stopButton: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#1a3a1a',
    borderWidth: 1,
    borderColor: '#4ADE80',
  },
  stopButtonText: {
    fontSize: 12,
    color: '#4ADE80',
    fontWeight: '600',
  },

  // Disabled text input
  textInputDisabled: {
    opacity: 0.5,
  },
});
