/**
 * HistoryScreen — list of past agent sessions.
 *
 * Each row shows:
 *   - The original command (headline)
 *   - Step count + outcome badge (complete / stopped / error)
 *   - Short summary from the agent
 *   - Relative timestamp
 *
 * Sessions are persisted to AsyncStorage (up to 100) and restored on startup.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  LayoutAnimation,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';

import {
  type AgentSession,
  type SessionOutcome,
  clearSessions,
  removeSession,
  subscribeSessions,
} from '../../src/store/historyStore';

// Enable LayoutAnimation on Android (required for animated expand/collapse).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function HistoryScreen() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => subscribeSessions(setSessions), []);

  const handleClear = useCallback(() => {
    setSelectedId(null);
    clearSessions();
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const handleDelete = useCallback((id: string) => {
    setSelectedId(null);
    removeSession(id);
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
        {sessions.length > 0 && (
          <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.headerClear}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {sessions.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <SessionRow
              session={item}
              isSelected={selectedId === item.id}
              onSelect={handleSelect}
              onDelete={handleDelete}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Session row
// ---------------------------------------------------------------------------

interface SessionRowProps {
  session: AgentSession;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function SessionRow({ session, isSelected, onSelect, onDelete }: SessionRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasExtra = session.actions.length > 3;

  const toggle = useCallback(() => {
    if (isSelected) {
      onSelect(session.id);
      return;
    }
    if (!hasExtra) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  }, [hasExtra, isSelected, onSelect, session.id]);

  const handleLongPress = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onSelect(session.id);
  }, [onSelect, session.id]);

  const handleDelete = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onDelete(session.id);
  }, [onDelete, session.id]);

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={toggle}
      onLongPress={handleLongPress}
      style={[styles.row, isSelected && styles.rowSelected]}
    >
      <View style={styles.rowTop}>
        <Text style={styles.command} numberOfLines={2}>{session.command}</Text>
        <OutcomeBadge outcome={session.outcome} />
      </View>

      {session.summary ? (
        <Text style={styles.summary} numberOfLines={expanded ? undefined : 3}>{session.summary}</Text>
      ) : null}

      <View style={styles.rowMeta}>
        <Text style={styles.metaText}>
          {session.stepCount} {session.stepCount === 1 ? 'step' : 'steps'}
        </Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaText}>{formatRelativeTime(session.timestamp)}</Text>
      </View>

      {session.actions.length > 0 && (
        <ActionList actions={session.actions} expanded={expanded} />
      )}

      {isSelected && (
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          activeOpacity={0.8}
        >
          <Text style={styles.deleteButtonText}>Delete session</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

function OutcomeBadge({ outcome }: { outcome: SessionOutcome }) {
  const colors: Record<SessionOutcome, { bg: string; text: string; label: string }> = {
    complete: { bg: '#0a1f0a', text: '#4ADE80', label: 'Done' },
    stopped:  { bg: '#1a1a0a', text: '#FACC15', label: 'Stopped' },
    error:    { bg: '#1f0a0a', text: '#FF6B6B', label: 'Error' },
  };
  const c = colors[outcome];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.text }]}>{c.label}</Text>
    </View>
  );
}

function ActionList({ actions, expanded }: { actions: string[]; expanded: boolean }) {
  const PREVIEW = 3;
  const shown = expanded ? actions : actions.slice(0, PREVIEW);
  const remaining = actions.length - PREVIEW;

  return (
    <View style={styles.actionList}>
      {shown.map((a, i) => (
        <View key={i} style={styles.actionItem}>
          <View style={styles.actionDot} />
          <Text style={styles.actionText} numberOfLines={1}>{a}</Text>
        </View>
      ))}
      {!expanded && remaining > 0 && (
        <Text style={styles.actionMore}>+{remaining} more — tap to expand</Text>
      )}
      {expanded && actions.length > PREVIEW && (
        <Text style={styles.actionMore}>tap to collapse</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>📋</Text>
      <Text style={styles.emptyHeadline}>No sessions yet</Text>
      <Text style={styles.emptySubtext}>
        Your past agent sessions will appear here after you run a command.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const secs  = Math.floor(diff / 1000);
  const mins  = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);

  if (secs < 60)   return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  headerClear: {
    fontSize: 14,
    color: '#555',
  },

  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },

  // Session row
  row: {
    backgroundColor: '#111',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    padding: 14,
    gap: 8,
  },
  rowSelected: {
    borderColor: '#FF6B6B44',
  },
  deleteButton: {
    marginTop: 4,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#3a1010',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  command: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#e5e5e5',
    lineHeight: 21,
  },
  summary: {
    fontSize: 13,
    color: '#888',
    lineHeight: 19,
  },

  // Meta line
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: '#555',
  },
  metaDot: {
    fontSize: 12,
    color: '#333',
  },

  // Outcome badge
  badge: {
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Action list
  actionList: {
    gap: 4,
    marginTop: 4,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
    flexShrink: 0,
  },
  actionText: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  actionMore: {
    fontSize: 12,
    color: '#444',
    paddingLeft: 13,
  },

  // Empty state
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  emptyHeadline: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    lineHeight: 20,
  },
});
