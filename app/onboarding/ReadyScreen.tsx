import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';

interface Props {
  onFinish: () => void;
}

/**
 * Onboarding step 4: Ready screen — onboarding complete.
 *
 * Shown after the user has worked through permissions and model download.
 * Tapping "Start using Deft" calls `onFinish`, which marks onboarding
 * complete and navigates to the main app.
 */
export function ReadyScreen({ onFinish }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.checkCircle}>
          <Text style={styles.checkMark}>&#x2713;</Text>
        </View>

        <Text style={styles.headline}>You're all set</Text>
        <Text style={styles.subline}>
          Deft is ready to control your phone. Try a command like:
        </Text>

        <View style={styles.examples}>
          <ExampleCommand text={'"Open Chrome and search for the weather"'} />
          <ExampleCommand text={'"Send a WhatsApp message to Mom saying I\'ll be late"'} />
          <ExampleCommand text={'"Turn on Do Not Disturb"'} />
        </View>

        <View style={styles.spacer} />

        <TouchableOpacity style={styles.button} onPress={onFinish} activeOpacity={0.85}>
          <Text style={styles.buttonText}>Start using Deft</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function ExampleCommand({ text }: { text: string }) {
  return (
    <View style={styles.exampleCard}>
      <View style={styles.micDot} />
      <Text style={styles.exampleText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 40,
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0d1a12',
    borderWidth: 2,
    borderColor: '#4ADE80',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  checkMark: {
    fontSize: 36,
    color: '#4ADE80',
  },
  headline: {
    fontSize: 34,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  subline: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  examples: {
    width: '100%',
    gap: 10,
  },
  exampleCard: {
    backgroundColor: '#141414',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  micDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ADE80',
    flexShrink: 0,
  },
  exampleText: {
    fontSize: 14,
    color: '#ccc',
    flex: 1,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  spacer: {
    flex: 1,
  },
  button: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 16,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0a0a0a',
  },
});
