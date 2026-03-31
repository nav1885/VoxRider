import Tts from 'react-native-tts';
import {Platform} from 'react-native';
import {ITTSBackend} from './TTSEngine';

/**
 * NativeTTSBackend — wraps react-native-tts for production use.
 *
 * Audio ducking:
 *  - iOS: AVAudioSession .duckOthers via setIgnoreSilentSwitch('ignore') + iOS audio session config
 *  - Android: AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK via setDucking(true)
 *
 * Volume: maximum (1.0)
 * Rate: slightly slower than default for clarity over wind noise (0.45)
 *
 * Call initialize() once on app start before any speech.
 */
export class NativeTTSBackend implements ITTSBackend {
  private currentUtteranceId: string | number | null = null;
  private onFinishedCallback: (() => void) | null = null;

  async initialize(): Promise<void> {
    await Tts.getInitStatus();

    if (Platform.OS === 'android') {
      await Tts.setDucking(true);
    } else {
      // iOS: ignore silent switch so radar alerts always play
      await Tts.setIgnoreSilentSwitch('ignore');
    }

    await Tts.setDefaultRate(0.45);

    // Wire TTS events
    Tts.addEventListener('tts-finish', this._handleFinish);
    Tts.addEventListener('tts-cancel', this._handleFinish);
    Tts.addEventListener('tts-error', this._handleFinish);
  }

  destroy(): void {
    Tts.removeEventListener('tts-finish', this._handleFinish);
    Tts.removeEventListener('tts-cancel', this._handleFinish);
    Tts.removeEventListener('tts-error', this._handleFinish);
  }

  speak(utterance: string, onFinished: () => void): void {
    // Cancel any in-progress speech first (speak() on Android queues by default)
    Tts.stop();
    this.onFinishedCallback = onFinished;
    this.currentUtteranceId = Tts.speak(utterance);
  }

  stop(): void {
    this.onFinishedCallback = null;
    this.currentUtteranceId = null;
    Tts.stop();
  }

  private _handleFinish = (event: {utteranceId: string | number}): void => {
    if (
      this.currentUtteranceId !== null &&
      event.utteranceId === this.currentUtteranceId
    ) {
      const cb = this.onFinishedCallback;
      this.currentUtteranceId = null;
      this.onFinishedCallback = null;
      cb?.();
    }
  };
}
