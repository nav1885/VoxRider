import Tts from 'react-native-tts';
import {NativeModules, NativeEventEmitter, Platform} from 'react-native';
import {ITTSBackend} from './TTSEngine';
import {useDebugStore} from '../debug/debugStore';

const {VoxTTS, TextToSpeech: NativeTTS} = NativeModules;

/**
 * NativeTTSBackend — production TTS for VoxRider.
 *
 * On Android we use VoxTTSModule (our custom native module) which calls
 * TextToSpeech with QUEUE_FLUSH. react-native-tts uses QUEUE_ADD, which
 * silently stalls after the first utterance on Android 12+ and OEM devices.
 *
 * On iOS we use react-native-tts directly (no equivalent issue).
 *
 * onFinished is called when the utterance completes naturally (onDone /
 * tts-finish). It is NOT called when interrupted by stop() or QUEUE_FLUSH —
 * the next speak() call sets a new onFinished for the replacement utterance.
 * TTSEngine's 10 s watchdog covers any case where onFinished never fires.
 */
export class NativeTTSBackend implements ITTSBackend {
  private eventSubscription: ReturnType<NativeEventEmitter['addListener']> | null = null;
  private iosFinishHandler: (() => void) | null = null;
  private pendingOnFinished: (() => void) | null = null;

  async initialize(): Promise<void> {
    if (Platform.OS === 'android' && VoxTTS) {
      const emitter = new NativeEventEmitter(VoxTTS);
      this.eventSubscription = emitter.addListener('VoxTTSEvent', (msg: string) => {
        useDebugStore.getState().appendTTSLog(`nat: ${msg}`);
        // onDone = utterance finished naturally → snapshot-on-completion
        if (msg.startsWith('onDone')) {
          const cb = this.pendingOnFinished;
          this.pendingOnFinished = null;
          cb?.();
        }
        // onStop = interrupted (QUEUE_FLUSH or explicit stop) → ignore;
        // the replacement speak() or TTSEngine watchdog handles state reset.
      });
    } else {
      await Tts.getInitStatus();
      await Tts.setIgnoreSilentSwitch('ignore');
      await Tts.setDefaultRate(0.45);
      this.iosFinishHandler = () => {
        const cb = this.pendingOnFinished;
        this.pendingOnFinished = null;
        cb?.();
      };
      Tts.addEventListener('tts-finish', this.iosFinishHandler);
    }
  }

  destroy(): void {
    this.eventSubscription?.remove();
    if (this.iosFinishHandler) {
      Tts.removeEventListener('tts-finish', this.iosFinishHandler);
      this.iosFinishHandler = null;
    }
  }

  speak(utterance: string, onFinished: () => void): void {
    this.pendingOnFinished = onFinished;
    if (Platform.OS === 'android') {
      VoxTTS?.speak(utterance);
    } else {
      // iOS: speak() interrupts any current utterance naturally.
      // Calling stop() via TurboModules crashes (react-native-tts 4.1.1
      // passes a null resolve callback through the new arch bridge).
      Tts.speak(utterance);
    }
  }

  stop(): void {
    // Clear callback before stopping — interrupted utterances don't trigger
    // snapshot-on-completion; the caller (TTSEngine) manages state directly.
    this.pendingOnFinished = null;
    if (Platform.OS === 'android') {
      VoxTTS?.stop();
    }
    // iOS: no-op — utterance finishes naturally; TTSEngine watchdog covers
    // the edge case where it never completes.
  }
}
