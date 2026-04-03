package com.voxrider

import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
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
    private var selectedVoiceId: String? = null
    private val audioManager by lazy {
        reactContext.getSystemService(android.content.Context.AUDIO_SERVICE) as AudioManager
    }
    private var focusRequest: AudioFocusRequest? = null

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
                abandonAudioFocus()
            }
            override fun onStop(utteranceId: String?, interrupted: Boolean) {
                emit("onStop", "id=$utteranceId interrupted=$interrupted")
                abandonAudioFocus()
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

    /** Request transient audio focus so music ducks while we speak. */
    private fun requestAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(attrs)
                .setAcceptsDelayedFocusGain(false)
                .build()
            focusRequest = req
            audioManager.requestAudioFocus(req)
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(
                null,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
            )
        }
    }

    private fun abandonAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(null)
        }
        focusRequest = null
    }

    @ReactMethod
    fun speak(text: String) {
        speakCount++
        val id = "vox_$speakCount"
        emit("speak", "[$speakCount] \"$text\" ready=$ready")

        if (!ready) {
            emit("speak", "SKIPPED — not ready")
            return
        }

        requestAudioFocus()

        val params = Bundle().apply {
            putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC)
        }

        // Apply selected voice if set
        selectedVoiceId?.let { voiceId ->
            tts?.voices?.find { it.name == voiceId }?.let { tts?.voice = it }
        }

        val result = tts?.speak(text, TextToSpeech.QUEUE_FLUSH, params, id)
        emit("speak", "[$speakCount] tts.speak() returned $result (SUCCESS=${TextToSpeech.SUCCESS})")
    }

    @ReactMethod
    fun setVoice(voiceId: String) {
        selectedVoiceId = voiceId.ifEmpty { null }
        emit("setVoice", "voiceId=$voiceId")
    }

    @ReactMethod
    fun getVoices(promise: Promise) {
        try {
            val voices = tts?.voices
            if (voices == null) {
                promise.resolve(Arguments.createArray())
                return
            }
            // Pick the best offline voice from each target locale.
            // Different regional accents are guaranteed to sound distinct.
            data class Target(val region: String, val country: String)
            val targets = listOf(
                Target("US", "US"),
                Target("GB", "GB"),
                Target("AU", "AU"),
            )
            val result = Arguments.createArray()
            for (target in targets) {
                val voice = voices
                    .filter {
                        it.locale.language == "en" &&
                        it.locale.country.equals(target.country, ignoreCase = true) &&
                        !it.isNetworkConnectionRequired
                    }
                    .maxByOrNull { it.quality }
                if (voice != null) {
                    val map = Arguments.createMap()
                    map.putString("id", voice.name)
                    map.putString("region", target.region)
                    result.pushMap(map)
                }
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("GET_VOICES_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stop() {
        emit("stop", "called")
        tts?.stop()
        abandonAudioFocus()
    }

    override fun invalidate() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        ready = false
        super.invalidate()
    }
}
