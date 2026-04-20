/**
 * SettingsScreen — agent configuration UI.
 *
 * Controls:
 *   - Model selection: E2B (faster, less capable) vs E4B (slower, smarter)
 *   - Cloud fallback: use a cloud LLM when on-device is unavailable
 *   - Max steps: cap on agent loop iterations (1–50)
 *   - Settle delay: ms to wait after each action (100–2000)
 *
 * Settings are loaded from storage on mount and saved immediately on change.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  DEFAULT_SETTINGS,
  type Settings,
  loadSettings,
  resetSettings,
  saveSettings,
} from '../../src/store/settingsStore';
import {
  isOnDeviceLLMReady,
  subscribeIsLLMReady,
} from '../../src/agent/llmBridge';

type LLMStatus = 'ready' | 'loading' | 'unavailable';

export function SettingsScreen() {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [loaded, setLoaded] = useState(false);
  const [llmStatus, setLLMStatus] = useState<LLMStatus>(
    isOnDeviceLLMReady() ? 'ready' : 'unavailable',
  );
  const modelChangedRef = useRef(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    return subscribeIsLLMReady((ready) => {
      if (ready) {
        setLLMStatus('ready');
        modelChangedRef.current = false;
      } else if (modelChangedRef.current) {
        setLLMStatus('loading');
      } else {
        setLLMStatus('unavailable');
      }
    });
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (patch.model !== undefined && patch.model !== settings.model) {
      modelChangedRef.current = true;
      setLLMStatus('loading');
    }
    await saveSettings(patch);
  }, [settings]);

  const handleReset = useCallback(async () => {
    await resetSettings();
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  if (!loaded) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Model ── */}
        <SectionHeader title="On-Device Model" />
        <View style={styles.card}>
          <ModelToggle
            value={settings.model}
            onChange={(model) => update({ model })}
          />
          <View style={styles.divider} />
          <LLMStatusRow status={llmStatus} />
          <View style={styles.divider} />
          <SettingDescription
            text={
              settings.model === 'E4B'
                ? 'Gemma 4 E4B — 4B parameters, stronger reasoning, ~2.5 GB on-device.'
                : 'Gemma 4 E2B — 2B parameters, faster, uses less RAM. Best for simple tasks.'
            }
          />
        </View>

        {/* ── Cloud fallback ── */}
        <SectionHeader title="Cloud Fallback" />
        <View style={styles.card}>
          <ToggleRow
            label="Use cloud LLM when local model unavailable"
            value={settings.cloudFallback}
            onChange={(v) => update({ cloudFallback: v })}
          />
          {settings.cloudFallback && (
            <>
              <View style={styles.divider} />
              <TextRow
                label="API Key"
                value={settings.cloudApiKey}
                placeholder="sk-… or anthropic key"
                secureTextEntry
                onChangeText={(v) => update({ cloudApiKey: v })}
              />
              <View style={styles.divider} />
              <TextRow
                label="Model"
                value={settings.cloudModel}
                placeholder="claude-sonnet-4-6"
                onChangeText={(v) => update({ cloudModel: v })}
              />
            </>
          )}
          <View style={styles.divider} />
          <SettingDescription
            text="Falls back to a cloud provider when the on-device model hasn't been downloaded. Requires an internet connection and a valid API key."
          />
        </View>

        {/* ── Agent loop ── */}
        <SectionHeader title="Agent Loop" />
        <View style={styles.card}>
          <StepperRow
            label="Max steps"
            value={settings.maxSteps}
            min={1}
            max={50}
            onChange={(v) => update({ maxSteps: v })}
          />
          <View style={styles.divider} />
          <StepperRow
            label="Settle delay"
            value={settings.settleMs}
            min={100}
            max={2000}
            step={100}
            unit="ms"
            onChange={(v) => update({ settleMs: v })}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="Vision mode (screenshot per step)"
            value={settings.useVision}
            onChange={(v) => update({ useVision: v })}
          />
          <View style={styles.divider} />
          <SettingDescription
            text="Max steps caps how many actions the agent can take per task. Settle delay is the wait time after each action. Vision mode attaches a screenshot to each LLM call for richer UI understanding — requires the model to support image input."
          />
        </View>

        {/* ── Reset ── */}
        <TouchableOpacity style={styles.resetButton} onPress={handleReset} activeOpacity={0.7}>
          <Text style={styles.resetButtonText}>Reset to Defaults</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title.toUpperCase()}</Text>;
}

function LLMStatusRow({ status }: { status: LLMStatus }) {
  const config = {
    ready:       { label: 'Model ready',   dot: '#4ADE80', text: '#4ADE80' },
    loading:     { label: 'Loading model…', dot: '#FACC15', text: '#FACC15' },
    unavailable: { label: 'Not downloaded', dot: '#555',    text: '#666'    },
  }[status];

  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusDot, { backgroundColor: config.dot }]} />
      <Text style={[styles.statusText, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

function SettingDescription({ text }: { text: string }) {
  return <Text style={styles.description}>{text}</Text>;
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#2a2a2a', true: '#4ADE8066' }}
        thumbColor={value ? '#4ADE80' : '#555'}
      />
    </View>
  );
}

function ModelToggle({
  value,
  onChange,
}: {
  value: 'E2B' | 'E4B';
  onChange: (v: 'E2B' | 'E4B') => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>Model</Text>
      <View style={styles.segmentControl}>
        {(['E2B', 'E4B'] as const).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.segment, value === m && styles.segmentActive]}
            onPress={() => onChange(m)}
            activeOpacity={0.75}
          >
            <Text style={[styles.segmentText, value === m && styles.segmentTextActive]}>
              {m}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function TextRow({
  label,
  value,
  placeholder,
  secureTextEntry,
  onChangeText,
}: {
  label: string;
  value: string;
  placeholder?: string;
  secureTextEntry?: boolean;
  onChangeText: (v: string) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <TextInput
        style={styles.textInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#444"
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
      />
    </View>
  );
}

function StepperRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const decrement = () => onChange(Math.max(min, value - step));
  const increment = () => onChange(Math.min(max, value + step));

  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity
          style={[styles.stepperBtn, value <= min && styles.stepperBtnDisabled]}
          onPress={decrement}
          disabled={value <= min}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.stepperBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.stepperValue}>
          {value}{unit ?? ''}
        </Text>
        <TouchableOpacity
          style={[styles.stepperBtn, value >= max && styles.stepperBtnDisabled]}
          onPress={increment}
          disabled={value >= max}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.stepperBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },

  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#555',
    fontSize: 14,
  },

  header: {
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

  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 8,
  },

  sectionHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555',
    letterSpacing: 0.8,
    paddingHorizontal: 4,
    marginTop: 16,
    marginBottom: 6,
  },

  card: {
    backgroundColor: '#111',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    overflow: 'hidden',
  },

  divider: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowLabel: {
    fontSize: 15,
    color: '#e5e5e5',
    flex: 1,
  },
  textInput: {
    flex: 2,
    fontSize: 13,
    color: '#e5e5e5',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  description: {
    fontSize: 12,
    color: '#555',
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Segment control (E2B / E4B)
  segmentControl: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    overflow: 'hidden',
  },
  segment: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  segmentActive: {
    backgroundColor: '#fff',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  segmentTextActive: {
    color: '#0a0a0a',
  },

  // Stepper
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1e1e1e',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: {
    opacity: 0.35,
  },
  stepperBtnText: {
    fontSize: 18,
    color: '#e5e5e5',
    fontWeight: '400',
    lineHeight: 22,
  },
  stepperValue: {
    fontSize: 15,
    color: '#e5e5e5',
    fontWeight: '600',
    minWidth: 44,
    textAlign: 'center',
  },

  // Reset button
  resetButton: {
    marginTop: 24,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a1a1a',
    backgroundColor: '#1a0a0a',
  },
  resetButtonText: {
    fontSize: 14,
    color: '#FF6B6B',
    fontWeight: '500',
  },
});
