import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';

import type { AudioInput } from '@shared/ai/types';

/**
 * Plays one of Hao's lines: server audio when provided, otherwise the phone's own voice.
 * Calls `onDone` exactly once when finished (or after a timeout), so the room can move on.
 */
export function playVoice(line: { id: string; text: string; audio: AudioInput | null }, language: string, onDone: () => void) {
  let finished = false;
  const fallback = setTimeout(() => finish(), Math.min(30_000, 2500 + line.text.length * 250));
  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(fallback);
    onDone();
  }

  const speak = () =>
    Speech.speak(line.text, { language, rate: 0.95, onDone: finish, onStopped: finish, onError: finish });

  if (!line.audio?.data) return speak();
  setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })
    .then(() => {
      const file = new File(Paths.cache, `hao-voice-${line.id}.wav`);
      file.write(line.audio!.data, { encoding: 'base64' });
      const player = createAudioPlayer({ uri: file.uri });
      const sub = player.addListener('playbackStatusUpdate', (status) => {
        if (!status.didJustFinish) return;
        sub.remove();
        player.remove();
        file.delete();
        finish();
      });
      player.play();
    })
    .catch(speak);
}

export function stopVoice() {
  Speech.stop();
}
