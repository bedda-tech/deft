/**
 * ScreenPreview — real-time screen state visualization.
 *
 * Shows the accessibility tree of the current foreground app as formatted
 * text. Intended for developers and power users who want to see exactly what
 * the agent is reading before deciding what action to take.
 *
 * Features:
 *   - Collapsible panel (toggle with the header row)
 *   - Manual refresh via the refresh button
 *   - Auto-refresh while the panel is open (configurable interval)
 *   - Graceful fallback when the accessibility service is not enabled or the
 *     native module is not linked (simulator, tests, first launch)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScreenPreviewProps {
  /**
   * How often (ms) to auto-refresh screen state while the panel is open.
   * Set to 0 to disable auto-refresh. Default: 2000 (2 s).
   */
  refreshIntervalMs?: number;
  /**
   * Whether the panel starts expanded. Default: false.
   */
  defaultExpanded?: boolean;
}

type LoadState = 'idle' | 'loading' | 'success' | 'error';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScreenPreview({
  refreshIntervalMs = 2000,
  defaultExpanded = false,
}: ScreenPreviewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [screenText, setScreenText] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Height animation for collapse/expand
  const animHeight = useRef(new Animated.Value(defaultExpanded ? 1 : 0)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch screen state
  // ---------------------------------------------------------------------------

  const fetchScreen = useCallback(async () => {
    setLoadState('loading');
    try {
      const ctrl = getController();
      const text: string = await ctrl.getScreenText();
      setScreenText(text.trim() || '(empty screen)');
      setLastUpdated(new Date());
      setLoadState('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(simplifyError(msg));
      setLoadState('error');
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Auto-refresh while expanded
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!expanded) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Fetch immediately when opening
    fetchScreen();

    if (refreshIntervalMs > 0) {
      intervalRef.current = setInterval(fetchScreen, refreshIntervalMs);
    }

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [expanded, fetchScreen, refreshIntervalMs]);

  // ---------------------------------------------------------------------------
  // Expand / collapse animation
  // ---------------------------------------------------------------------------

  const toggleExpanded = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    Animated.timing(animHeight, {
      toValue: next ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [expanded, animHeight]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const maxBodyHeight = animHeight.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 260],
  });

  const chevron = expanded ? '▲' : '▼';

  return (
    <View style={styles.container}>
      {/* Header row */}
      <TouchableOpacity
        style={styles.header}
        onPress={toggleExpanded}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <View style={styles.dot} />
          <Text style={styles.headerTitle}>Screen Preview</Text>
          {loadState === 'loading' && (
            <ActivityIndicator size="small" color="#4ADE80" style={styles.spinner} />
          )}
        </View>
        <View style={styles.headerRight}>
          {expanded && (
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={fetchScreen}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.refreshIcon}>↻</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.chevron}>{chevron}</Text>
        </View>
      </TouchableOpacity>

      {/* Body — height-animated */}
      <Animated.View style={[styles.body, { maxHeight: maxBodyHeight }]}>
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {loadState === 'idle' && (
            <Text style={styles.placeholder}>Tap the header to load screen state.</Text>
          )}

          {loadState === 'error' && (
            <View style={styles.errorWrap}>
              <Text style={styles.errorIcon}>⚠</Text>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {(loadState === 'success' || loadState === 'loading') && screenText !== '' && (
            <Text style={styles.treeText} selectable>
              {screenText}
            </Text>
          )}
        </ScrollView>

        {lastUpdated !== null && loadState !== 'loading' && (
          <Text style={styles.timestamp}>
            Updated {formatTime(lastUpdated)}
          </Text>
        )}
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Lazy-load the native accessibility controller.
 * Throws a human-readable error if the module is absent.
 */
function getController(): { getScreenText: () => Promise<string> } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-accessibility-controller') as {
      getScreenText?: () => Promise<string>;
    };
    if (typeof mod.getScreenText !== 'function') {
      throw new Error('getScreenText not found');
    }
    return mod as { getScreenText: () => Promise<string> };
  } catch {
    throw new Error(
      'Accessibility service is not enabled. Go to Settings → Accessibility to enable Deft.',
    );
  }
}

/** Shorten verbose native errors for display. */
function simplifyError(msg: string): string {
  if (msg.includes('not enabled') || msg.includes('not available')) {
    return 'Accessibility service is not enabled.\nSettings → Accessibility → Deft.';
  }
  if (msg.includes('not found')) {
    return 'Native module not linked. Run the app on a real device.';
  }
  return msg;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f0f0f',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    overflow: 'hidden',
    marginHorizontal: 16,
    marginBottom: 8,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  spinner: {
    marginLeft: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  refreshBtn: {
    padding: 2,
  },
  refreshIcon: {
    fontSize: 16,
    color: '#555',
  },
  chevron: {
    fontSize: 10,
    color: '#444',
  },

  // Body
  body: {
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  scroll: {
    maxHeight: 240,
    padding: 12,
  },

  // Content states
  placeholder: {
    fontSize: 13,
    color: '#444',
    fontStyle: 'italic',
  },
  treeText: {
    fontSize: 11,
    color: '#ccc',
    fontFamily: 'monospace',
    lineHeight: 17,
  },
  errorWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  errorIcon: {
    fontSize: 14,
    color: '#f87171',
  },
  errorText: {
    fontSize: 12,
    color: '#f87171',
    flex: 1,
    lineHeight: 18,
  },

  // Timestamp
  timestamp: {
    fontSize: 10,
    color: '#333',
    textAlign: 'right',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
});
