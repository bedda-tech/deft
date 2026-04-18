import React, { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  AppStateStatus,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface Props {
  onNext: () => void;
}

/**
 * Onboarding step 3: Request "Draw over other apps" permission.
 *
 * SYSTEM_ALERT_WINDOW lets Deft show a floating agent-status overlay on top
 * of any app while the agent is running. It cannot be granted programmatically
 * — the user must toggle it in Android Settings.
 *
 * This screen provides step-by-step instructions and a direct link to the
 * relevant settings page. The permission is optional; the agent works without
 * it (the floating overlay simply won't appear).
 */
export function OverlayPermissionScreen({ onNext }: Props) {
  const [isGranted, setIsGranted] = useState(false);

  const check = useCallback(async () => {
    const granted = await checkOverlayPermission();
    setIsGranted(granted);
    if (granted) onNext();
  }, [onNext]);

  // Check on mount and each time the user returns from Settings
  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  const openSettings = () => {
    if (Platform.OS === 'android') {
      // Opens the specific "Draw over other apps" page for this package.
      Linking.sendIntent('android.settings.action.MANAGE_OVERLAY_PERMISSION', [
        { key: 'package', value: 'tech.bedda.deft' },
      ]).catch(() => {
        // Fallback: open general app settings if the specific intent fails
        Linking.openSettings();
      });
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.badge}>
          <Text style={styles.badgeStep}>3 of 4</Text>
        </View>

        <Text style={styles.headline}>Draw Over Apps</Text>
        <Text style={styles.subline}>
          Allow Deft to show a small status indicator over any app while the
          agent is running — so you can see what it's doing and stop it at any time.
        </Text>

        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>How to enable</Text>
          <InstructionStep number={1} text="Tap Open Settings below" />
          <InstructionStep number={2} text="Find Deft in the list" />
          <InstructionStep number={3} text="Toggle "Allow display over other apps"" />
          <InstructionStep number={4} text="Return to Deft" />
        </View>

        <View style={styles.optionalNote}>
          <Text style={styles.optionalTitle}>Optional</Text>
          <Text style={styles.optionalText}>
            The agent works without this permission. You'll just miss the floating
            status overlay during task execution.
          </Text>
        </View>

        {isGranted ? (
          <View style={styles.grantedBanner}>
            <Text style={styles.grantedText}>Permission granted</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.button} onPress={openSettings} activeOpacity={0.85}>
            <Text style={styles.buttonText}>Open Settings</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.skipButton} onPress={onNext}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function InstructionStep({ number, text }: { number: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

/**
 * Check whether SYSTEM_ALERT_WINDOW ("Draw over other apps") is granted.
 *
 * Uses react-native-accessibility-controller's canDrawOverlays if available,
 * otherwise returns false so the screen is shown but skippable.
 */
async function checkOverlayPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ctrl = require('react-native-accessibility-controller');
    if (typeof ctrl.canDrawOverlays === 'function') {
      return (await ctrl.canDrawOverlays()) as boolean;
    }
  } catch {
    // Module not linked
  }
  return false;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  container: {
    flexGrow: 1,
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
  stepsCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 20,
    gap: 14,
  },
  stepsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  stepNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  stepText: {
    fontSize: 15,
    color: '#ccc',
    flex: 1,
  },
  optionalNote: {
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 32,
    gap: 6,
  },
  optionalTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  optionalText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0a0a0a',
  },
  grantedBanner: {
    backgroundColor: '#0d1a12',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4ADE80',
    marginBottom: 12,
  },
  grantedText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4ADE80',
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
