package com.voxrider

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "VoxRider"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onStart() {
    super.onStart()
    // Android 14+ (API 34): starting a foreground service with type connectedDevice
    // requires BLUETOOTH_CONNECT to be granted at call time — not just declared.
    // On a fresh install, runtime permissions aren't granted yet. Skip here and let
    // onStart() fire again after the user returns from the JS permission dialog.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val granted = checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) ==
          PackageManager.PERMISSION_GRANTED
      if (!granted) return
    }
    val intent = Intent(this, RadarService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      startForegroundService(intent)
    } else {
      startService(intent)
    }
  }
}
