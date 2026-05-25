package com.nav1885.voxrider

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
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

    @Volatile private var tts: TextToSpeech? = null
    @Volatile private var ready = false
    private var speakCount = 0
    private var selectedVoiceId: String? = null
    // Engine self-healing: OEMs (notably Samsung) kill the bound system TTS
    // service during long background sessions. After that, tts.speak() returns
    // ERROR forever and the engine never re-binds on its own — the user gets
    // total silence. We detect the ERROR and rebuild the TextToSpeech client.
    // These flags are read/written from both the RN module thread (speak) and
    // TTS binder threads (onInit), so they are @Volatile.
    @Volatile private var recreating = false
    @Volatile private var pendingRetryText: String? = null
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
        createEngine(reason = "init")
    }

    /**
     * Construct (or reconstruct) the TextToSpeech client and attach the
     * utterance listener. Configuration that requires a ready engine
     * (language, rate, audio attributes) is applied in onInit. Any text in
     * [pendingRetryText] is spoken once the new engine reports ready.
     */
    private fun createEngine(reason: String) {
        tts = TextToSpeech(reactContext.applicationContext) { status ->
            recreating = false
            if (status == TextToSpeech.SUCCESS) {
                configureEngine()
                ready = true
                emit("init", "ready ($reason)")
                val retry = pendingRetryText
                pendingRetryText = null
                if (retry != null) {
                    val id = "vox_${speakCount}_retry"
                    val result = doSpeak(retry, id)
                    emit("speak", "[retry] tts.speak() returned $result (SUCCESS=${TextToSpeech.SUCCESS})")
                    if (result != TextToSpeech.SUCCESS) {
                        // Fresh engine still rejects speech — give up and let JS
                        // fall back to a non-audio cue (vibration).
                        emit("speakFailed", "retry after recovery returned $result")
                    }
                }
            } else {
                ready = false
                emit("init", "FAILED status=$status ($reason)")
                if (pendingRetryText != null) {
                    pendingRetryText = null
                    emit("speakFailed", "engine recovery failed status=$status")
                }
            }
        }
        attachListener()
    }

    private fun configureEngine() {
        tts?.language = Locale.US
        tts?.setSpeechRate(0.65f)
        // Navigation guidance usage: routes to earbuds/BT headphones (not speaker),
        // ducks music, and works in background with FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK.
        tts?.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
        )
    }

    private fun attachListener() {
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

    /**
     * Rebuild the engine after a speak() failure and retry [text] once the new
     * engine is ready. Coalesces concurrent calls: while a rebuild is in
     * flight, only the latest text is retained for retry.
     */
    private fun recoverAndRetry(text: String) {
        pendingRetryText = text
        if (recreating) return
        recreating = true
        emit("init", "recovering engine after speak failure")
        // Surface teardown errors in the in-app log — the exception type is a
        // breadcrumb for *why* the engine died if this ever fails differently.
        try { tts?.stop() } catch (e: Exception) { emit("init", "stop on recover threw: ${e.message}") }
        try { tts?.shutdown() } catch (e: Exception) { emit("init", "shutdown on recover threw: ${e.message}") }
        tts = null
        ready = false
        createEngine(reason = "recovery")
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

        // Engine not ready (initial init failed, or a rebuild is in flight):
        // recover and let the fresh engine speak this text when it comes up,
        // instead of silently dropping the alert forever.
        if (!ready || tts == null) {
            emit("speak", "[$speakCount] engine not ready — recovering")
            recoverAndRetry(text)
            return
        }

        val result = doSpeak(text, id)
        emit("speak", "[$speakCount] tts.speak() returned $result (SUCCESS=${TextToSpeech.SUCCESS})")

        if (result != TextToSpeech.SUCCESS) {
            // The system TTS service rejected the request — almost always
            // because the bound service was killed in the background. Rebuild
            // the engine and retry this utterance.
            emit("speak", "[$speakCount] ERROR — rebuilding engine and retrying")
            recoverAndRetry(text)
        }
    }

    /** Issue one utterance on the current engine. Returns the speak() result code. */
    private fun doSpeak(text: String, id: String): Int {
        requestAudioFocus()

        val params = Bundle().apply {
            putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC)
        }

        // Apply selected voice if set
        selectedVoiceId?.let { voiceId ->
            tts?.voices?.find { it.name == voiceId }?.let { tts?.voice = it }
        }

        return tts?.speak(text, TextToSpeech.QUEUE_FLUSH, params, id) ?: TextToSpeech.ERROR
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

    /**
     * Start (or re-start) RadarService from JS — called after BLE permissions are confirmed.
     * Safe to call multiple times; START_STICKY service ignores duplicate starts.
     */
    @ReactMethod
    fun startRadarService() {
        val context = reactContext.applicationContext
        // Android 14+: starting connectedDevice FGS requires BLUETOOTH_CONNECT to be granted.
        // On fresh install permissions aren't granted yet — skip silently.
        // MainActivity.onStart() will retry once the user returns after granting permissions.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val granted = context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) ==
                PackageManager.PERMISSION_GRANTED
            if (!granted) return
        }
        val intent = Intent(context, RadarService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
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
        recreating = false
        pendingRetryText = null
        super.invalidate()
    }
}
