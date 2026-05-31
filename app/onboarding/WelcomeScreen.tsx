import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';

interface Props {
  onNext: () => void;
}

/**
 * Onboarding step 1: Explain what Deft does and show concrete command examples.
 */
export function WelcomeScreen({ onNext }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.iconPlaceholder}>
          <Text style={styles.iconText}>D</Text>
        </View>

        <Text style={styles.headline}>Meet Deft</Text>
        <Text style={styles.tagline}>Your on-device AI phone agent</Text>

        <View style={styles.features}>
          <FeatureRow
            title="Control your phone with words"
            description="Speak or type any task — Deft reads the screen, taps, types, and scrolls for you."
          />
          <FeatureRow
            title="100% private, no cloud"
            description="Gemma 4 runs entirely on your device. No API keys, no data sent anywhere."
          />
          <FeatureRow
            title="Works with any app"
            description="Chrome, WhatsApp, Settings, Maps — if you can see it, Deft can control it."
          />
        </View>

        <View style={styles.examplesSection}>
          <Text style={styles.examplesLabel}>Try commands like</Text>
          <View style={styles.examplesGrid}>
            <CommandChip text="Open Chrome and search for the weather" />
            <CommandChip text="Send a WhatsApp to Mom: I'll be late" />
            <CommandChip text="Turn on Do Not Disturb" />
            <CommandChip text="Set an alarm for 7 AM tomorrow" />
            <CommandChip text="Open Spotify and play my Liked Songs" />
          </View>
        </View>

        <TouchableOpacity style={styles.button} onPress={onNext} activeOpacity={0.85}>
          <Text style={styles.buttonText}>Get started</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureRow({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureDot} />
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}

function CommandChip({ text }: { text: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{'“'}{text}{'”'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 40,
  },
  iconPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconText: {
    fontSize: 44,
    fontWeight: '700',
    color: '#fff',
  },
  headline: {
    fontSize: 34,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 17,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 40,
  },
  features: {
    width: '100%',
    gap: 24,
    marginBottom: 36,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  featureDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ADE80',
    marginTop: 6,
    flexShrink: 0,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#999',
    lineHeight: 20,
  },
  examplesSection: {
    width: '100%',
    marginBottom: 36,
  },
  examplesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  examplesGrid: {
    gap: 8,
  },
  chip: {
    backgroundColor: '#141414',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  chipText: {
    fontSize: 14,
    color: '#bbb',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 40,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0a0a0a',
  },
});
