import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Animated,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { downloadModel } from '../../src/agent/modelManager';
import { saveSettings } from '../../src/store/settingsStore';

interface Props {
  onNext: () => void;
}

type DownloadStatus = 'idle' | 'downloading' | 'complete' | 'error';

const MODEL_NAME = 'Gemma 4 E4B';
/** Approx. download size string for display. */
const MODEL_SIZE = '2.5 GB';

/**
 * Onboarding step 3: Download the Gemma 4 model with a progress bar.
 *
 * The actual download is performed by react-native-executorch's model
 * download API. This screen provides a progress UI and handles the
 * success/error states. If the module is not yet linked, it simulates
 * progress for UI development purposes (debug-only).
 */
export function ModelDownloadScreen({ onNext }: Props) {
  const [status, setStatus] = useState<DownloadStatus>('idle');
  const [progress, setProgress] = useState(0); // 0-1
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCloudMode, setShowCloudMode] = useState(false);
  const [cloudApiKey, setCloudApiKey] = useState('');
  const [savingCloud, setSavingCloud] = useState(false);

  // Animated width for the progress bar
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Keep the animated value in sync with numeric progress
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  const startDownload = async () => {
    setStatus('downloading');
    setProgress(0);
    setErrorMessage(null);

    try {
      await downloadModel('E4B', {
        onProgress: (p) => setProgress(p),
        onComplete: () => {
          setStatus('complete');
          setProgress(1);
        },
        onError: (msg) => {
          setStatus('error');
          setErrorMessage(msg);
        },
      });
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const saveCloudMode = async () => {
    if (!cloudApiKey.trim()) return;
    setSavingCloud(true);
    await saveSettings({ cloudFallback: true, cloudApiKey: cloudApiKey.trim() });
    setSavingCloud(false);
    onNext();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>
          <View style={styles.badge}>
            <Text style={styles.badgeStep}>4 of 4</Text>
          </View>

          <Text style={styles.headline}>
            {showCloudMode ? 'Use Cloud API' : 'Download AI Model'}
          </Text>
          <Text style={styles.subline}>
            {showCloudMode
              ? 'Enter an API key to run inference in the cloud instead of on-device. You can switch to local later in Settings.'
              : `Deft runs ${MODEL_NAME} entirely on your phone. Download it once and all inference stays local forever.`}
          </Text>

          {showCloudMode ? (
            <View style={styles.modelCard}>
              <Text style={styles.cloudLabel}>API Key</Text>
              <TextInput
                style={styles.cloudInput}
                placeholder="sk-ant-... or sk-..."
                placeholderTextColor="#555"
                value={cloudApiKey}
                onChangeText={setCloudApiKey}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.cloudHint}>
                Anthropic (claude-sonnet-4-6) or OpenAI (gpt-4o) keys are both supported. Your key is stored locally and never sent to Deft's servers.
              </Text>
            </View>
          ) : (
            <View style={styles.modelCard}>
              <View style={styles.modelRow}>
                <Text style={styles.modelName}>{MODEL_NAME}</Text>
                <Text style={styles.modelSize}>{MODEL_SIZE}</Text>
              </View>

              <View style={styles.specRow}>
                <Spec label="Parameters" value="4B" />
                <Spec label="Quantization" value="Q4_K_M" />
                <Spec label="Context" value="8K tokens" />
              </View>

              {(status === 'downloading' || status === 'complete') && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressTrack}>
                    <Animated.View
                      style={[
                        styles.progressFill,
                        {
                          width: progressAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          }),
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressLabel}>
                    {status === 'complete'
                      ? 'Download complete'
                      : `${Math.round(progress * 100)}%`}
                  </Text>
                </View>
              )}

              {status === 'error' && errorMessage && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.buttonArea}>
            {showCloudMode ? (
              <>
                <TouchableOpacity
                  style={[styles.button, !cloudApiKey.trim() && styles.buttonDisabled]}
                  onPress={saveCloudMode}
                  activeOpacity={0.85}
                  disabled={!cloudApiKey.trim() || savingCloud}
                >
                  <Text style={[styles.buttonText, !cloudApiKey.trim() && styles.buttonTextDim]}>
                    {savingCloud ? 'Saving...' : 'Save & Continue'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.skipButton} onPress={() => setShowCloudMode(false)}>
                  <Text style={styles.skipText}>Back to download</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {status === 'idle' || status === 'error' ? (
                  <TouchableOpacity style={styles.button} onPress={startDownload} activeOpacity={0.85}>
                    <Text style={styles.buttonText}>
                      {status === 'error' ? 'Retry download' : 'Download model'}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {status === 'downloading' && (
                  <View style={[styles.button, styles.buttonDisabled]}>
                    <Text style={styles.buttonText}>Downloading...</Text>
                  </View>
                )}

                {status === 'complete' && (
                  <TouchableOpacity style={styles.button} onPress={onNext} activeOpacity={0.85}>
                    <Text style={styles.buttonText}>Continue</Text>
                  </TouchableOpacity>
                )}

                {status !== 'complete' && (
                  <TouchableOpacity style={styles.skipButton} onPress={onNext}>
                    <Text style={styles.skipText}>
                      {status === 'downloading' ? 'Continue in background' : 'Skip for now'}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.cloudToggle}
                  onPress={() => setShowCloudMode(true)}
                >
                  <Text style={styles.cloudToggleText}>Use cloud API instead →</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.spec}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 40,
    paddingBottom: 40,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  badgeStep: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  headline: {
    fontSize: 30,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  subline: {
    fontSize: 16,
    color: '#999',
    lineHeight: 24,
    marginBottom: 32,
  },
  modelCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    flex: 1,
    gap: 16,
  },
  modelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  modelSize: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
  specRow: {
    flexDirection: 'row',
    gap: 12,
  },
  spec: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  specLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  specValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  progressContainer: {
    gap: 8,
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#222',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4ADE80',
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 13,
    color: '#888',
    textAlign: 'right',
  },
  errorBanner: {
    backgroundColor: '#1a0d0d',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#3a1515',
  },
  errorText: {
    fontSize: 13,
    color: '#f87171',
    lineHeight: 20,
  },
  buttonArea: {
    paddingTop: 24,
    gap: 4,
  },
  button: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#2a2a2a',
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0a0a0a',
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipText: {
    fontSize: 15,
    color: '#555',
  },
  cloudToggle: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cloudToggleText: {
    fontSize: 14,
    color: '#444',
  },
  cloudLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  cloudInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    color: '#fff',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  cloudHint: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
  },
  buttonTextDim: {
    color: '#555',
  },
});
