import Tts from 'react-native-tts';
import {NativeModules, NativeEventEmitter, Platform} from 'react-native';
import {ITTSBackend} from './TTSEngine';
import {useRadarStore} from '../ble/radarStore';

const {VoxTTS} = NativeModules;

/**
 * NativeTTSBackend — production TTS for VoxRider.
 *
 * On Android we use VoxTTSModule (our custom native module) which calls
 * TextToSpeech with QUEUE_FLUSH. react-native-tts uses QUEUE_ADD, which
 * silently stalls after the first utterance on Android 12+ and OEM devices.
 *
 * On iOS we use react-native-tts directly (no equivalent issue).
 */
export class NativeTTSBackend implements ITTSBackend {
  private eventSubscription: ReturnType<NativeEventEmitter['addListener']> | null = null;

  async initialize(): Promise<void> {
    if (Platform.OS === 'android' && VoxTTS) {
      // Forward every native TTS lifecycle event to the debug label
      const emitter = new NativeEventEmitter(VoxTTS);
      this.eventSubscription = emitter.addListener('VoxTTSEvent', (msg: string) => {
        // Use a separate field so VoxTTS events don't trigger the main
        // store subscription that runs announceThreats
        useRadarStore.getState().setDebugTTSLog(msg);
      });
    } else {
      await Tts.getInitStatus();
      await Tts.setIgnoreSilentSwitch('ignore');
      await Tts.setDefaultRate(0.45);
    }
  }

  destroy(): void {
    this.eventSubscription?.remove();
  }

  speak(utterance: string, _onFinished: () => void): void {
    if (Platform.OS === 'android') {
      VoxTTS?.speak(utterance);
    } else {
      Tts.stop();
      Tts.speak(utterance);
    }
  }

  stop(): void {
    if (Platform.OS === 'android') {
      VoxTTS?.stop();
    } else {
      Tts.stop();
    }
  }
}
