import type { AudioInput } from '@shared/ai/types';

/** Web version: HTML audio for server voice, speechSynthesis otherwise. `onDone` fires exactly once. */
export function playVoice(line: { id: string; text: string; audio: AudioInput | null }, language: string, onDone: () => void) {
  let finished = false;
  const fallback = setTimeout(() => finish(), Math.min(30_000, 2500 + line.text.length * 250));
  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(fallback);
    onDone();
  }
  const speak = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return finish();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line.text);
    u.lang = language;
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.speak(u);
  };
  if (!line.audio?.data) return speak();
  const audio = new Audio(`data:${line.audio.mimeType};base64,${line.audio.data}`);
  audio.onended = finish;
  audio.play().catch(speak);
}

export function stopVoice() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}
