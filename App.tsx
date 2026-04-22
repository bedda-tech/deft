import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { OnboardingNavigator } from './app/onboarding/OnboardingNavigator';
import { ChatScreen } from './app/chat/ChatScreen';
import { HistoryScreen } from './app/history/HistoryScreen';
import { SettingsScreen } from './app/settings/SettingsScreen';
import { isOnboardingComplete, completeOnboarding } from './src/store/onboardingStore';
import { loadSettings, subscribeSettings } from './src/store/settingsStore';
import { AgentOverlay } from './src/components/AgentOverlay';
import { unregisterLLM } from './src/agent/llmBridge';
import { initModel } from './src/agent/modelManager';

type AppState = 'loading' | 'onboarding' | 'main';
type MainTab = 'chat' | 'history' | 'settings';

/**
 * Root component.
 *
 * On launch:
 *   1. Loads persisted settings into the in-memory cache.
 *   2. Checks whether onboarding has been completed.
 *   3. Shows OnboardingNavigator if not, otherwise the main tabbed UI.
 */
export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [tab, setTab] = useState<MainTab>('chat');
  const currentModelRef = useRef<'E2B' | 'E4B' | null>(null);

  useEffect(() => {
    Promise.all([loadSettings(), isOnboardingComplete()]).then(([settings, done]) => {
      setAppState(done ? 'main' : 'onboarding');
      currentModelRef.current = settings.model;
      initOnDeviceLLM(settings.model).catch(() => {});
    });
  }, []);

  // Reinitialize the on-device LLM when the user changes the model in Settings.
  useEffect(() => {
    return subscribeSettings((settings) => {
      if (settings.model !== currentModelRef.current) {
        currentModelRef.current = settings.model;
        unregisterLLM();
        initOnDeviceLLM(settings.model).catch(() => {});
      }
    });
  }, []);

  const handleOnboardingComplete = async () => {
    await completeOnboarding();
    setAppState('main');
  };

  if (appState === 'loading') {
    return (
      <View style={styles.loadingContainer}>
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

  // Main app — tabbed interface
  return (
    <View style={styles.root}>
      <View style={styles.screen}>
        {tab === 'chat'     && <ChatScreen />}
        {tab === 'history'  && <HistoryScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </View>
      <TabBar tab={tab} onTab={setTab} />
      <AgentOverlay />
      <StatusBar style="light" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// On-device LLM initialization
// ---------------------------------------------------------------------------

async function initOnDeviceLLM(model: 'E2B' | 'E4B'): Promise<void> {
  await initModel(model);
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

interface TabBarProps {
  tab: MainTab;
  onTab: (t: MainTab) => void;
}

const TABS: { key: MainTab; label: string; icon: string }[] = [
  { key: 'chat',     label: 'Chat',     icon: '💬' },
  { key: 'history',  label: 'History',  icon: '📋' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
];

function TabBar({ tab, onTab }: TabBarProps) {
  return (
    <View style={styles.tabBar}>
      {TABS.map(({ key, label, icon }) => {
        const active = tab === key;
        return (
          <TouchableOpacity
            key={key}
            style={styles.tabItem}
            onPress={() => onTab(key)}
            activeOpacity={0.7}
          >
            <Text style={styles.tabIcon}>{icon}</Text>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  root: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  screen: {
    flex: 1,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0f0f0f',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    paddingBottom: 20, // breathing room for home indicator on modern phones
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 3,
  },
  tabIcon: {
    fontSize: 20,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#444',
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    color: '#4ADE80',
  },
});
