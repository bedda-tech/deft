/**
 * Thin wrapper around DeftAgentModule (the Android foreground service native module).
 *
 * - startForegroundService: call when agent begins; shows the persistent notification
 *   so Android won't kill the JS thread when the app is backgrounded.
 * - updateForegroundService: call on each step to keep step count current in the notification.
 * - stopForegroundService: call when the agent finishes or is aborted; dismisses the notification.
 *
 * All methods are no-ops on iOS and when the native module isn't linked (simulator / tests).
 */

import { NativeModules, Platform } from 'react-native';

interface DeftAgentModuleType {
  startService(taskDescription: string): void;
  updateNotification(taskDescription: string, stepCount: number): void;
  stopService(): void;
}

const module: DeftAgentModuleType | undefined =
  Platform.OS === 'android' ? NativeModules.DeftAgentModule : undefined;

let _activeTask = '';
let _serviceRunning = false;

export function startForegroundService(taskDescription: string): void {
  if (!module || _serviceRunning) return;
  _activeTask = taskDescription;
  _serviceRunning = true;
  module.startService(taskDescription);
}

export function updateForegroundService(stepCount: number): void {
  if (!module || !_serviceRunning) return;
  module.updateNotification(_activeTask, stepCount);
}

export function stopForegroundService(): void {
  if (!module || !_serviceRunning) return;
  _serviceRunning = false;
  _activeTask = '';
  module.stopService();
}
