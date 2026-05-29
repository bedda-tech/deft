package tech.bedda.deft

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Foreground service that keeps the JS thread alive when the user backgrounds Deft
 * while an agent task is running. The notification is updated as the agent steps forward.
 *
 * On task completion, the ongoing notification is replaced by a dismissable result
 * notification so the user knows what happened without reopening the app.
 */
class DeftAgentService : Service() {

    companion object {
        const val ACTION_START    = "tech.bedda.deft.START_AGENT"
        const val ACTION_STOP     = "tech.bedda.deft.STOP_AGENT"
        const val ACTION_UPDATE   = "tech.bedda.deft.UPDATE_AGENT"
        const val ACTION_COMPLETE = "tech.bedda.deft.COMPLETE_AGENT"
        const val EXTRA_DESCRIPTION = "taskDescription"
        const val EXTRA_STEP        = "stepCount"
        const val EXTRA_SUCCESS     = "taskSuccess"
        const val NOTIFICATION_ID        = 42
        const val RESULT_NOTIFICATION_ID = 43
        const val CHANNEL_ID        = "deft_agent_channel"
        const val CHANNEL_ID_RESULT = "deft_result_channel"
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val description = intent.getStringExtra(EXTRA_DESCRIPTION) ?: ""
                createNotificationChannel()
                val notification = buildRunningNotification(description, 0)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
            }
            ACTION_UPDATE -> {
                val description = intent.getStringExtra(EXTRA_DESCRIPTION) ?: ""
                val step = intent.getIntExtra(EXTRA_STEP, 0)
                val manager = getSystemService(NotificationManager::class.java)
                manager.notify(NOTIFICATION_ID, buildRunningNotification(description, step))
            }
            ACTION_COMPLETE -> {
                val description = intent.getStringExtra(EXTRA_DESCRIPTION) ?: ""
                val success = intent.getBooleanExtra(EXTRA_SUCCESS, true)
                // Stop the ongoing foreground notification first.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                } else {
                    @Suppress("DEPRECATION")
                    stopForeground(true)
                }
                // Show a dismissable result notification.
                createResultNotificationChannel()
                val manager = getSystemService(NotificationManager::class.java)
                manager.notify(RESULT_NOTIFICATION_ID, buildResultNotification(description, success))
                stopSelf()
            }
            ACTION_STOP -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                } else {
                    @Suppress("DEPRECATION")
                    stopForeground(true)
                }
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Deft Agent",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows while the Deft agent is running a task"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun createResultNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID_RESULT,
                "Deft Task Results",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Notifies when a background agent task finishes"
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildRunningNotification(taskDescription: String, stepCount: Int): Notification {
        val shortDesc = if (taskDescription.length > 60) "${taskDescription.take(60)}…" else taskDescription
        val subtitle = if (stepCount > 0) "Step $stepCount — $shortDesc" else shortDesc

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val builder = Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("Deft agent running")
                .setContentText(subtitle)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
            // FOREGROUND_SERVICE_IMMEDIATE was added in API 31 (Android 12 / S).
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
            }
            builder.build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle("Deft agent running")
                .setContentText(subtitle)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build()
        }
    }

    private fun buildResultNotification(result: String, success: Boolean): Notification {
        val shortResult = if (result.length > 80) "${result.take(80)}…" else result
        val title = if (success) "Task complete" else "Task failed"
        val icon = if (success) android.R.drawable.ic_dialog_info else android.R.drawable.ic_dialog_alert

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 1, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID_RESULT)
                .setContentTitle(title)
                .setContentText(shortResult)
                .setSmallIcon(icon)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle(title)
                .setContentText(shortResult)
                .setSmallIcon(icon)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .build()
        }
    }
}
