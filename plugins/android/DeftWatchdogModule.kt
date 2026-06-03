package tech.bedda.deft

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Native module that manages watchdog foreground notifications.
 *
 * A watchdog is a recurring background check — the user specifies a condition
 * (e.g. "Uber is within 5 minutes") and the JS agent loop checks it on a fixed
 * interval. This module keeps a persistent foreground notification visible so
 * Android won't kill the process between ticks.
 *
 * Called from watchdogBridge.ts.
 */
class DeftWatchdogModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val CHANNEL_ID_WATCHDOG   = "deft_watchdog_channel"
        const val CHANNEL_ID_TRIGGERED  = "deft_watchdog_triggered_channel"
        const val WATCHDOG_NOTIFICATION_ID  = 50
        const val TRIGGERED_NOTIFICATION_ID = 51
    }

    override fun getName(): String = "DeftWatchdogModule"

    /**
     * Show or update the persistent watchdog foreground notification.
     * Called before each tick so the UI reflects the current check count.
     *
     * @param task       Natural-language condition the agent is checking
     * @param tickCount  Number of checks completed so far
     * @param intervalSec Repeat interval in seconds (shown in the subtitle)
     */
    @ReactMethod
    fun showWatchdogNotification(task: String, tickCount: Int, intervalSec: Int) {
        createWatchdogChannel()
        val notification = buildWatchdogNotification(task, tickCount, intervalSec)
        val manager = reactContext.getSystemService(NotificationManager::class.java)
        manager.notify(WATCHDOG_NOTIFICATION_ID, notification)
    }

    /**
     * Show a high-priority "watchdog triggered" notification when the condition is met.
     * Separate from the ongoing foreground notification so it persists after cancel.
     */
    @ReactMethod
    fun showWatchdogTriggeredNotification(task: String, result: String) {
        createTriggeredChannel()
        val notification = buildTriggeredNotification(task, result)
        val manager = reactContext.getSystemService(NotificationManager::class.java)
        manager.notify(TRIGGERED_NOTIFICATION_ID, notification)
    }

    /**
     * Cancel the persistent watchdog foreground notification.
     * Called when all watchdogs are cancelled or the last one triggers.
     */
    @ReactMethod
    fun cancelWatchdogNotification() {
        val manager = reactContext.getSystemService(NotificationManager::class.java)
        manager.cancel(WATCHDOG_NOTIFICATION_ID)
    }

    // ---------------------------------------------------------------------------
    // Notification builders
    // ---------------------------------------------------------------------------

    private fun createWatchdogChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID_WATCHDOG,
                "Deft Watchdogs",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Shows while a watchdog check is scheduled"
                setShowBadge(false)
            }
            reactContext.getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }

    private fun createTriggeredChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID_TRIGGERED,
                "Deft Watchdog Alerts",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Fires when a watchdog condition is met"
            }
            reactContext.getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }

    private fun launchIntent(requestCode: Int): PendingIntent {
        val intent = reactContext.packageManager.getLaunchIntentForPackage(reactContext.packageName)
        return PendingIntent.getActivity(
            reactContext, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun buildWatchdogNotification(task: String, tickCount: Int, intervalSec: Int): Notification {
        val shortTask = if (task.length > 50) "${task.take(50)}…" else task
        val intervalText = when {
            intervalSec >= 3600 -> "${intervalSec / 3600}h"
            intervalSec >= 60   -> "${intervalSec / 60}m"
            else                -> "${intervalSec}s"
        }
        val subtitle = if (tickCount > 0) {
            "Check #$tickCount — every $intervalText: $shortTask"
        } else {
            "every $intervalText: $shortTask"
        }

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(reactContext, CHANNEL_ID_WATCHDOG)
                .setContentTitle("Watchdog active")
                .setContentText(subtitle)
                .setSmallIcon(android.R.drawable.ic_menu_recent_history)
                .setContentIntent(launchIntent(10))
                .setOngoing(true)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(reactContext)
                .setContentTitle("Watchdog active")
                .setContentText(subtitle)
                .setSmallIcon(android.R.drawable.ic_menu_recent_history)
                .setContentIntent(launchIntent(10))
                .setOngoing(true)
                .build()
        }
    }

    private fun buildTriggeredNotification(task: String, result: String): Notification {
        val shortTask   = if (task.length > 40) "${task.take(40)}…" else task
        val shortResult = if (result.length > 80) "${result.take(80)}…" else result

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(reactContext, CHANNEL_ID_TRIGGERED)
                .setContentTitle("Watchdog triggered: $shortTask")
                .setContentText(shortResult)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(launchIntent(11))
                .setAutoCancel(true)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(reactContext)
                .setContentTitle("Watchdog triggered: $shortTask")
                .setContentText(shortResult)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(launchIntent(11))
                .setAutoCancel(true)
                .build()
        }
    }
}
