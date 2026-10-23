import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AudioInput } from '@shared/ai/types';

import { readAudioBase64 } from '@/lib/audio-file';
import { ROOM_RECORDING_OPTIONS, SILENCE_DB } from '@/lib/rooms/recording';

const MIN_CHUNK_MS = 4000;
const MAX_CHUNK_MS = 6000;
const PAUSE_MS = 600;

/**
 * Records continuously and emits sentence-sized chunks: after 4 s it cuts at the next pause,
 * and never lets a chunk exceed 6 s. Chunks with no speech are dropped to save AI calls.
 */
export function useChunkedRecorder(onChunk: (audio: AudioInput) => void) {
  const recorder = useAudioRecorder(ROOM_RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, 100);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onChunkRef = useRef(onChunk);
  const chunkStart = useRef(0);
  const silenceSince = useRef<number | null>(null);
  const heardSpeech = useRef(false);
  const cutting = useRef(false);

  useEffect(() => {
    onChunkRef.current = onChunk;
  }, [onChunk]);

  const beginChunk = useCallback(async () => {
    await recorder.prepareToRecordAsync();
    recorder.record();
    chunkStart.current = Date.now();
    silenceSince.current = null;
    heardSpeech.current = false;
  }, [recorder]);

  const cut = useCallback(
    async (continueRecording: boolean) => {
      if (cutting.current) return;
      cutting.current = true;
      const hadSpeech = heardSpeech.current;
      try {
        await recorder.stop();
        const uri = recorder.uri;
        if (continueRecording) await beginChunk();
        if (uri && hadSpeech) onChunkRef.current(await readAudioBase64(uri));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Recording failed');
      } finally {
        cutting.current = false;
      }
    },
    [recorder, beginChunk]
  );

  useEffect(() => {
    if (!active || cutting.current) return;
    const now = Date.now();
    const level = state.metering ?? -160;
    if (level > SILENCE_DB) {
      heardSpeech.current = true;
      silenceSince.current = null;
    } else {
      silenceSince.current ??= now;
    }
    const elapsed = now - chunkStart.current;
    const silentFor = silenceSince.current ? now - silenceSince.current : 0;
    if ((elapsed >= MIN_CHUNK_MS && silentFor >= PAUSE_MS) || elapsed >= MAX_CHUNK_MS) cut(true);
  }, [active, state.durationMillis, state.metering, cut]);

  const start = useCallback(async () => {
    setError(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError('Microphone access is needed to broadcast.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await beginChunk();
    setActive(true);
  }, [beginChunk]);

  const stop = useCallback(async () => {
    setActive(false);
    await cut(false);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  }, [cut]);

  return { active, start, stop, error, level: state.metering };
}
