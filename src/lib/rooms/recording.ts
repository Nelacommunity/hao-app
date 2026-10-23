import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio';

// Same formats as the solo agent: WAV on iOS, raw AAC on Android, WebM in the browser.
export const ROOM_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
  android: { extension: '.aac', outputFormat: 'aac_adts', audioEncoder: 'aac' },
  ios: {
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm' },
};

/** Metering is dBFS (-160 silent … 0 loudest). Below this counts as silence. */
export const SILENCE_DB = -45;
