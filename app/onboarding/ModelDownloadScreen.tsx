import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Animated,
} from 'react-native';

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
      await downloadModel({
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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.badge}>
          <Text style={styles.badgeStep}>3 of 3</Text>
        </View>

        <Text style={styles.headline}>Download AI Model</Text>
        <Text style={styles.subline}>
          Deft runs {MODEL_NAME} entirely on your phone. Download it once and all
          inference stays local forever.
        </Text>

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

        <View style={styles.buttonArea}>
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
        </View>
      </View>
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

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

interface DownloadCallbacks {
  onProgress: (progress: number) => void;
  onComplete: () => void;
  onError: (message: string) => void;
}

/**
 * Download the Gemma 4 E4B model via react-native-executorch.
 *
 * Falls back to a simulated download in environments where the native
 * module is not linked (web, simulators, unit tests).
 */
async function downloadModel(callbacks: DownloadCallbacks): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const executorch = require('react-native-executorch');
    const { GEMMA4_E4B, downloadModel: downloadFn } = executorch as {
      GEMMA4_E4B: string;
      downloadModel: (
        model: string,
        onProgress: (p: number) => void,
      ) => Promise<void>;
    };
    await downloadFn(GEMMA4_E4B, callbacks.onProgress);
    callbacks.onComplete();
  } catch (err) {
    // Native module not linked or model constant not available --
    // simulate a download for UI testing.
    if (__DEV__) {
      await simulateDownload(callbacks);
    } else {
      callbacks.onError(err instanceof Error ? err.message : 'Download failed');
    }
  }
}

async function simulateDownload(callbacks: DownloadCallbacks): Promise<void> {
  const STEPS = 40;
  for (let i = 1; i <= STEPS; i++) {
    await new Promise<void>((r) => setTimeout(r, 50));
    callbacks.onProgress(i / STEPS);
  }
  callbacks.onComplete();
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0a0a',
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
});
