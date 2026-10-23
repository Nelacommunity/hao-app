import { File } from 'expo-file-system';

const MIME_BY_EXTENSION: Record<string, string> = {
  wav: 'audio/wav',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  mp3: 'audio/mp3',
  webm: 'audio/webm',
};

export async function readAudioBase64(uri: string) {
  const extension = uri.split('.').pop()?.toLowerCase() ?? '';
  const data = await new File(uri).base64();
  return { data, mimeType: MIME_BY_EXTENSION[extension] ?? 'audio/aac' };
}
