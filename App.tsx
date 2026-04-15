import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { OnboardingNavigator } from './app/onboarding/OnboardingNavigator';
import { isOnboardingComplete, completeOnboarding } from './src/store/onboardingStore';

type AppState = 'loading' | 'onboarding' | 'main';

/**
 * Root component.
 *
 * On launch, checks whether onboarding has been completed. If not, shows
 * the OnboardingNavigator. When onboarding finishes, stores the completion
 * flag and shows the main app.
 */
export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');

  useEffect(() => {
    isOnboardingComplete().then((done) => {
      setAppState(done ? 'main' : 'onboarding');
    });
  }, []);

  const handleOnboardingComplete = async () => {
    await completeOnboarding();
    setAppState('main');
  };

  if (appState === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#fff" />
        <StatusBar style="light" />
      </View>
    );
  }

  if (appState === 'onboarding') {
    return (
      <>
        <OnboardingNavigator onComplete={handleOnboardingComplete} />
        <StatusBar style="light" />
      </>
    );
  }

  // Main app (placeholder until tabs are built)
  return (
    <View style={styles.mainContainer}>
      <Text style={styles.mainText}>Deft</Text>
      <Text style={styles.mainSubtext}>Tell me what to do</Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  mainContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainText: {
    fontSize: 40,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -1,
  },
  mainSubtext: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
});
