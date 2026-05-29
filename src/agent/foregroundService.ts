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

import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

interface DeftAgentModuleType {
  startService(taskDescription: string): void;
  updateNotification(taskDescription: string, stepCount: number): void;
  stopService(): void;
  completeTask(result: string, success: boolean): void;
}

const module: DeftAgentModuleType | undefined =
  Platform.OS === 'android' ? NativeModules.DeftAgentModule : undefined;

let _activeTask = '';
let _serviceRunning = false;
let _notificationPermissionRequested = false;

/**
 * Request POST_NOTIFICATIONS permission on Android 13+ (API 33).
 * Safe to call multiple times — skips if already requested this session.
 */
export function requestNotificationPermission(): void {
  if (Platform.OS !== 'android' || _notificationPermissionRequested) return;
  if ((Platform.Version as number) < 33) return;
  _notificationPermissionRequested = true;
  void PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
}

export function startForegroundService(taskDescription: string): void {
  if (!module || _serviceRunning) return;
  requestNotificationPermission();
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

/**
 * Stop the foreground service and post a dismissable result notification.
 * Only has effect on Android when the service is running; no-op otherwise.
 */
export function completeForegroundService(result: string, success: boolean): void {
  if (!module || !_serviceRunning) return;
  _serviceRunning = false;
  _activeTask = '';
  module.completeTask(result, success);
}
