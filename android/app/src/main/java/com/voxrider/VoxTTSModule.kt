package com.voxrider

import android.media.AudioManager
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale

class VoxTTSModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var tts: TextToSpeech? = null
    private var ready = false
    private var speakCount = 0

    companion object {
        const val TAG = "VoxTTS"
    }

    private fun emit(event: String, message: String) {
        Log.d(TAG, "$event: $message")
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("VoxTTSEvent", "$event: $message")
        } catch (e: Exception) {
            Log.e(TAG, "emit failed: ${e.message}")
        }
    }

    init {
        emit("init", "constructing TTS")
        tts = TextToSpeech(reactContext.applicationContext) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts?.language = Locale.US
                tts?.setSpeechRate(0.65f)
                ready = true
                emit("init", "ready")
            } else {
                emit("init", "FAILED status=$status")
            }
        }

        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                emit("onStart", "id=$utteranceId")
            }
            override fun onDone(utteranceId: String?) {
                emit("onDone", "id=$utteranceId")
            }
            override fun onStop(utteranceId: String?, interrupted: Boolean) {
                emit("onStop", "id=$utteranceId interrupted=$interrupted")
            }
            @Deprecated("Deprecated in API 21")
            override fun onError(utteranceId: String?) {
                emit("onError", "id=$utteranceId")
            }
            override fun onError(utteranceId: String?, errorCode: Int) {
                emit("onError", "id=$utteranceId code=$errorCode")
            }
        })
    }

    override fun getName(): String = "VoxTTS"

    @ReactMethod
    fun speak(text: String) {
        speakCount++
        val id = "vox_$speakCount"
        emit("speak", "[$speakCount] \"$text\" ready=$ready")

        if (!ready) {
            emit("speak", "SKIPPED — not ready")
            return
        }

        val params = Bundle().apply {
            putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_ALARM)
        }

        val result = tts?.speak(text, TextToSpeech.QUEUE_FLUSH, params, id)
        emit("speak", "[$speakCount] tts.speak() returned $result (SUCCESS=${TextToSpeech.SUCCESS})")
    }

    @ReactMethod
    fun stop() {
        emit("stop", "called")
        tts?.stop()
    }

    override fun invalidate() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        ready = false
        super.invalidate()
    }
}
