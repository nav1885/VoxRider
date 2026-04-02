package com.voxrider

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * RadarService — Android foreground service for background BLE reliability.
 *
 * Keeps the app alive while the screen is locked or the app is in the background.
 * Declared in AndroidManifest.xml with FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE (Android 14+).
 *
 * Lifecycle:
 *  - Started from JS via NativeModules or automatically on app launch (TASK-015 native wiring)
 *  - Shows a persistent low-priority notification: "VoxRider active"
 *  - Survives Doze mode, OEM battery killers (combined with battery optimization exemption request)
 *
 * TASK-015 native wiring (when Xcode/Android Studio available):
 *  - Wire to RealBLEManager so BLE subscriptions run in this service context
 *  - Handle TTS.speak() calls from the service for background audio
 */
class RadarService : Service() {

    companion object {
        private const val CHANNEL_ID = "voxrider_radar"
        private const val NOTIFICATION_ID = 1001
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = buildNotification()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // Android 14+: specify foreground service type
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        // Return START_STICKY: if killed, restart without intent (BLE will reconnect automatically)
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        stopForeground(STOP_FOREGROUND_REMOVE)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel_name),
                // IMPORTANCE_LOW: visible in shade, no sound, no heads-up — not intrusive
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = getString(R.string.notification_channel_desc)
                setShowBadge(false)
            }
            val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(getString(R.string.notification_text))
            .setSmallIcon(R.drawable.ic_notification)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }
}
