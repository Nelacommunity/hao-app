import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AudioInput } from '@shared/ai/types';

import { readAudioBase64 } from '@/lib/audio-file';
import { ROOM_RECORDING_OPTIONS } from '@/lib/rooms/recording';

const SILENCE_AFTER_SPEECH_MS = 700;
const NO_SPEECH_TIMEOUT_MS = 5000;
const MAX_MS = 20_000;
const CALIBRATE_MS = 300;

type Result = { audio: AudioInput } | { notHeard: true } | { cancelled: true };

/**
 * Tap once to talk: records until ~0.7 s of silence after speech (voice activity detection on the
 * recorder's level meter), so nobody has to hold a button.
 */
export function useVadRecorder(onFinish: (result: Result) => void) {
  const recorder = useAudioRecorder(ROOM_RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, 50);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinishRef = useRef(onFinish);
  const startedAt = useRef(0);
  const heard = useRef(false);
  const silentSince = useRef<number | null>(null);
  const noiseFloor = useRef(-60);
  const stopping = useRef(false);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const stop = useCallback(
    async (mode: 'send' | 'cancel') => {
      if (stopping.current) return;
      stopping.current = true;
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        setRecording(false);
        if (mode === 'cancel') return onFinishRef.current({ cancelled: true });
        if (!heard.current || !recorder.uri) return onFinishRef.current({ notHeard: true });
        onFinishRef.current({ audio: await readAudioBase64(recorder.uri) });
      } catch (e) {
        setRecording(false);
        setError(e instanceof Error ? e.message : 'Recording failed');
        onFinishRef.current({ cancelled: true });
      } finally {
        stopping.current = false;
      }
    },
    [recorder]
  );

  // Voice activity detection on the live level (dBFS, -160 silent … 0 loud).
  useEffect(() => {
    if (!recording || stopping.current) return;
    const now = Date.now();
    const level = state.metering ?? -160;
    const elapsed = now - startedAt.current;
    if (elapsed < CALIBRATE_MS) {
      noiseFloor.current = Math.max(noiseFloor.current, level);
      return;
    }
    const threshold = Math.max(-45, noiseFloor.current + 10);
    if (level > threshold) {
      heard.current = true;
      silentSince.current = null;
    } else {
      silentSince.current ??= now;
    }
    const silentFor = silentSince.current ? now - silentSince.current : 0;
    if ((heard.current && silentFor >= SILENCE_AFTER_SPEECH_MS) || (!heard.current && elapsed > NO_SPEECH_TIMEOUT_MS) || elapsed > MAX_MS) {
      stop('send');
    }
  }, [recording, state.durationMillis, state.metering, stop]);

  const start = useCallback(async () => {
    setError(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError('Hao needs microphone access.');
      return false;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    startedAt.current = Date.now();
    heard.current = false;
    silentSince.current = null;
    noiseFloor.current = -60;
    setRecording(true);
    return true;
  }, [recorder]);

  return { recording, start, stop, error, level: state.metering };
}
