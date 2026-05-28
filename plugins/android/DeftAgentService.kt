package tech.bedda.deft

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder

/**
 * Foreground service that keeps the JS thread alive when the user backgrounds Deft
 * while an agent task is running. The notification is updated as the agent steps forward.
 */
class DeftAgentService : Service() {

    companion object {
        const val ACTION_START = "tech.bedda.deft.START_AGENT"
        const val ACTION_STOP = "tech.bedda.deft.STOP_AGENT"
        const val ACTION_UPDATE = "tech.bedda.deft.UPDATE_AGENT"
        const val EXTRA_DESCRIPTION = "taskDescription"
        const val EXTRA_STEP = "stepCount"
        const val NOTIFICATION_ID = 42
        const val CHANNEL_ID = "deft_agent_channel"
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val description = intent.getStringExtra(EXTRA_DESCRIPTION) ?: ""
                createNotificationChannel()
                startForeground(NOTIFICATION_ID, buildNotification(description, 0))
            }
            ACTION_UPDATE -> {
                val description = intent.getStringExtra(EXTRA_DESCRIPTION) ?: ""
                val step = intent.getIntExtra(EXTRA_STEP, 0)
                val manager = getSystemService(NotificationManager::class.java)
                manager.notify(NOTIFICATION_ID, buildNotification(description, step))
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

    private fun buildNotification(taskDescription: String, stepCount: Int): Notification {
        val shortDesc = if (taskDescription.length > 60) "${taskDescription.take(60)}…" else taskDescription
        val subtitle = if (stepCount > 0) "Step $stepCount — $shortDesc" else shortDesc

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("Deft agent running")
                .setContentText(subtitle)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
                .build()
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
}
