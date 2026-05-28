package tech.bedda.deft

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Native module that allows JS to start, update, and stop the DeftAgentService foreground
 * notification from agentBridge.ts.
 */
class DeftAgentModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DeftAgentModule"

    @ReactMethod
    fun startService(taskDescription: String) {
        val intent = Intent(reactContext, DeftAgentService::class.java).apply {
            action = DeftAgentService.ACTION_START
            putExtra(DeftAgentService.EXTRA_DESCRIPTION, taskDescription)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactContext.startForegroundService(intent)
        } else {
            reactContext.startService(intent)
        }
    }

    @ReactMethod
    fun updateNotification(taskDescription: String, stepCount: Int) {
        val intent = Intent(reactContext, DeftAgentService::class.java).apply {
            action = DeftAgentService.ACTION_UPDATE
            putExtra(DeftAgentService.EXTRA_DESCRIPTION, taskDescription)
            putExtra(DeftAgentService.EXTRA_STEP, stepCount)
        }
        reactContext.startService(intent)
    }

    @ReactMethod
    fun stopService() {
        val intent = Intent(reactContext, DeftAgentService::class.java).apply {
            action = DeftAgentService.ACTION_STOP
        }
        reactContext.startService(intent)
    }
}
