import {ITTSBackend} from './TTSEngine';

/**
 * NoOpTTSBackend — placeholder until react-native-tts native integration (TASK-023 native).
 * Logs to console so behavior is visible in Metro, fires onFinished immediately.
 */
export class NoOpTTSBackend implements ITTSBackend {
  speak(utterance: string, onFinished: () => void): void {
    console.log('[TTS]', utterance);
    // Simulate speech completing immediately so snapshot logic works in dev/test
    setTimeout(onFinished, 0);
  }

  stop(): void {
    console.log('[TTS] stop');
  }
}
