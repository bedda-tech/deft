import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Linking,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';

interface Props {
  onNext: () => void;
}

/**
 * Onboarding step 2: Request Android AccessibilityService permission.
 *
 * The AccessibilityService cannot be enabled programmatically -- the user
 * must go to Settings > Accessibility > Deft and toggle it on. This screen
 * gives clear instructions and polls for the service becoming active.
 */
export function PermissionsScreen({ onNext }: Props) {
  const [isGranted, setIsGranted] = useState(false);

  // Poll for service activation each time the app comes back to foreground
  useEffect(() => {
    let mounted = true;

    const check = async () => {
      const granted = await checkAccessibilityServiceEnabled();
      if (mounted) setIsGranted(granted);
      if (granted && mounted) onNext();
    };

    check();

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') check();
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, [onNext]);

  const openSettings = () => {
    if (Platform.OS === 'android') {
      Linking.sendIntent('android.settings.ACCESSIBILITY_SETTINGS').catch(() => {
        Linking.openSettings();
      });
    } else {
      Linking.openSettings();
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.badge}>
          <Text style={styles.badgeStep}>2 of 3</Text>
        </View>

        <Text style={styles.headline}>Enable Accessibility</Text>
        <Text style={styles.subline}>
          Deft needs Android Accessibility Service to read your screen and perform
          actions on your behalf.
        </Text>

        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>How to enable</Text>
          <InstructionStep number={1} text="Tap Open Settings below" />
          <InstructionStep number={2} text="Choose Installed services" />
          <InstructionStep number={3} text="Tap Deft" />
          <InstructionStep number={4} text="Toggle the switch to ON" />
          <InstructionStep number={5} text="Return to Deft" />
        </View>

        <View style={styles.privacyNote}>
          <Text style={styles.privacyText}>
            Deft only reads the screen to execute your commands. It never logs, stores,
            or transmits your screen data.
          </Text>
        </View>

        {isGranted ? (
          <View style={styles.grantedBanner}>
            <Text style={styles.grantedText}>Accessibility enabled</Text>
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
 * Check whether the Deft AccessibilityService is currently enabled.
 *
 * This relies on react-native-accessibility-controller's `isServiceEnabled`
 * method. If the native module isn't linked yet, it returns false gracefully.
 */
async function checkAccessibilityServiceEnabled(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const controller = require('react-native-accessibility-controller');
    return (await controller.isServiceEnabled()) as boolean;
  } catch {
    return false;
  }
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
  privacyNote: {
    backgroundColor: '#0d1a12',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1a3a24',
    marginBottom: 32,
  },
  privacyText: {
    fontSize: 13,
    color: '#4ADE80',
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
