/**
 * AgentOverlay
 *
 * A headless component (renders null) that drives the native floating
 * agent-status indicator on Android.
 *
 * Lifecycle:
 *   - Agent starts → showOverlay with "Working..." and step 0
 *   - Each action message → updateOverlay with action text + step count
 *   - Agent completes/errors → hideOverlay
 *   - User taps Stop → stopAgent() + hideOverlay
 *
 * The overlay appears on top of ALL other apps via SYSTEM_ALERT_WINDOW.
 * The host must hold that permission (granted during onboarding).
 */

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type { ChatMessage } from '../store/chatStore';
import { subscribe } from '../store/chatStore';
import { stopAgent } from '../agent/agentBridge';

// Lazy-import the a11y controller so the app doesn't crash if the native
// module isn't linked (simulator / web).
function getA11yController() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-accessibility-controller') as {
      showOverlay: (config: object) => Promise<void>;
      updateOverlay: (config: { action: string; stepCount: number }) => Promise<void>;
      hideOverlay: () => Promise<void>;
      onOverlayStop: (cb: () => void) => { remove: () => void };
    };
  } catch {
    return null;
  }
}

export function AgentOverlay() {
  // Nothing to render on iOS — overlay is Android-only
  if (Platform.OS !== 'android') return null;

  return <AgentOverlayAndroid />;
}

function AgentOverlayAndroid() {
  const overlayVisible = useRef(false);
  const stopSubRef     = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    const ctrl = getA11yController();
    if (!ctrl) return;

    // Subscribe to overlay stop button
    stopSubRef.current = ctrl.onOverlayStop(() => {
      stopAgent();
      ctrl.hideOverlay().catch(() => {});
      overlayVisible.current = false;
    });

    // Subscribe to chat store and manage overlay lifecycle
    const unsub = subscribe((messages: ChatMessage[]) => {
      const hasPending = messages.some((m) => m.pending);
      const actionMsgs = messages.filter((m) => m.kind === 'action');

      if (hasPending && !overlayVisible.current) {
        // Agent just started
        const firstAction = actionMsgs.at(-1)?.text ?? 'Working...';
        overlayVisible.current = true;
        ctrl
          .showOverlay({ gravity: 'top-right', action: firstAction, stepCount: actionMsgs.length })
          .catch(() => {
            overlayVisible.current = false;
          });
      } else if (hasPending && overlayVisible.current && actionMsgs.length > 0) {
        // Agent is mid-run — refresh action text + step count
        const latestAction = actionMsgs.at(-1)!.text;
        ctrl
          .updateOverlay({ action: latestAction, stepCount: actionMsgs.length })
          .catch(() => {});
      } else if (!hasPending && overlayVisible.current) {
        // Agent finished (or was stopped)
        overlayVisible.current = false;
        ctrl.hideOverlay().catch(() => {});
      }
    });

    return () => {
      unsub();
      stopSubRef.current?.remove();
      if (overlayVisible.current) {
        ctrl.hideOverlay().catch(() => {});
        overlayVisible.current = false;
      }
    };
  }, []);

  // Headless — no React Native UI rendered
  return null;
}
