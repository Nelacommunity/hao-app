// On web the recorder returns a blob: URL, so read it with FileReader.
export async function readAudioBase64(uri: string) {
  const blob = await (await fetch(uri)).blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return { data: dataUrl.split(',')[1] ?? '', mimeType: blob.type.split(';')[0] || 'audio/webm' };
}
