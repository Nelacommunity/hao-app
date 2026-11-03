import Ionicons from '@expo/vector-icons/Ionicons';
import * as Speech from 'expo-speech';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Colors, Radius, themed } from '@/constants/theme';
import { useT } from '@/lib/i18n';

type Props = {
  text: string;
  language?: string;
  size?: number;
  tint?: string;
  background?: string;
};

export function SpeakButton({
  text,
  language = 'zh-CN',
  size = 18,
  tint = Colors.red,
  background = Colors.redSoft,
}: Props) {
  const t = useT();
  const [speaking, setSpeaking] = useState(false);

  const onPress = () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(text, {
      language,
      rate: 0.85,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('Play pronunciation of {text}', { text })}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        { width: size * 2, height: size * 2, backgroundColor: background },
        pressed && { opacity: 0.7 },
      ]}>
      <Ionicons name={speaking ? 'stop' : 'volume-high'} size={size} color={tint} />
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  button: {
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
