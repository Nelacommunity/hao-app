import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { cancelAnimation, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { tx, useT } from '@/lib/i18n';

export type ChatMode = 'interpret' | 'guide' | 'memory';

export const ChatModes: Record<ChatMode, { label: string; icon: 'chatbubbles' | 'compass' | 'sparkles'; placeholder: string }> = {
  interpret: { label: tx('Interpret'), icon: 'chatbubbles', placeholder: tx('Tell Hao what to say…') },
  guide: { label: tx('Guide'), icon: 'compass', placeholder: tx('Ask about WeChat, trains, payments…') },
  memory: { label: tx('Memory'), icon: 'sparkles', placeholder: tx('Ask what you heard, saw or planned…') },
};

// Fixed per-bar multipliers so the waveform looks organic but reacts to the live level.
const BAR_SHAPE = [0.45, 0.7, 1, 0.8, 0.55, 0.9, 0.65, 1, 0.75, 0.5, 0.85, 0.6, 0.95, 0.7, 0.5, 0.8];

type Props = {
  mode: ChatMode;
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onOpenMenu: () => void;
  busy: boolean;
  /** Voice input; omit to hide the mic (e.g. Guide mode). */
  voice?: {
    recording: boolean;
    /** Who the next recording is for, shown while recording. */
    speakerLabel: string;
    accent: string;
    durationMillis: number;
    metering?: number;
    onStart: () => void;
    onStop: (send: boolean) => void;
  };
};

export function ChatComposer({ mode, value, onChangeText, onSend, onOpenMenu, busy, voice }: Props) {
  const t = useT();
  const hasText = value.trim().length > 0;

  if (voice?.recording) return <Recorder voice={voice} />;

  return (
    <View style={styles.dock}>
      <View style={styles.box}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={t(ChatModes[mode].placeholder)}
          placeholderTextColor={Colors.muted}
          style={styles.input}
          multiline
          editable={!busy}
          submitBehavior="blurAndSubmit"
          onSubmitEditing={onSend}
          returnKeyType="send"
          accessibilityLabel={t('Message to Hao')}
        />
        <View style={styles.toolbar}>
          <Pressable
            onPress={onOpenMenu}
            style={({ pressed }) => [styles.plus, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('Choose mode')}>
            <Ionicons name="add" size={22} color={Colors.ink} />
          </Pressable>
          <Pressable
            onPress={onOpenMenu}
            style={({ pressed }) => [styles.modeChip, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('Mode: {mode}. Change mode', { mode: t(ChatModes[mode].label) })}>
            <Ionicons name={ChatModes[mode].icon} size={14} color={Colors.red} />
            <Text style={styles.modeChipText}>{t(ChatModes[mode].label)}</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          {hasText || !voice ? (
            <Pressable
              onPress={onSend}
              disabled={!hasText || busy}
              style={({ pressed }) => [styles.action, (!hasText || busy) && styles.actionDisabled, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('Send')}>
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-up" size={20} color="#fff" />}
            </Pressable>
          ) : (
            <Pressable
              onPress={voice.onStart}
              disabled={busy}
              style={({ pressed }) => [styles.action, { backgroundColor: voice.accent }, busy && styles.actionDisabled, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('Speak ({speaker})', { speaker: voice.speakerLabel })}>
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="mic" size={20} color="#fff" />}
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

function Recorder({ voice }: { voice: NonNullable<Props['voice']> }) {
  const t = useT();
  const seconds = Math.floor(voice.durationMillis / 1000);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  // Metering is in dBFS (-160 silent … 0 loudest); map the useful range to 0–1.
  const level = voice.metering === undefined ? 0.3 : Math.min(1, Math.max(0.08, (voice.metering + 55) / 50));

  return (
    <Animated.View entering={FadeIn.duration(150)} style={styles.dock}>
      <View style={[styles.recorder, { borderColor: voice.accent }]}>
        <Pressable
          onPress={() => voice.onStop(false)}
          hitSlop={8}
          style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('Cancel recording')}>
          <Ionicons name="close" size={20} color={Colors.inkSoft} />
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.recorderTop}>
            <PulseDot color={voice.accent} />
            <Text style={styles.timer}>{time}</Text>
            <Text style={styles.recorderLabel} numberOfLines={1}>
              {voice.speakerLabel}
            </Text>
          </View>
          <View style={styles.wave}>
            {BAR_SHAPE.map((shape, i) => (
              <View key={i} style={[styles.bar, { height: 4 + 22 * level * shape, backgroundColor: voice.accent }]} />
            ))}
          </View>
        </View>
        <Pressable
          onPress={() => voice.onStop(true)}
          style={({ pressed }) => [styles.sendRecording, { backgroundColor: voice.accent }, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('Send recording')}>
          <Ionicons name="arrow-up" size={22} color="#fff" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

function PulseDot({ color }: { color: string }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.3, { duration: 700 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
  dock: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md, backgroundColor: Colors.paper },
  box: {
    backgroundColor: Colors.card,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: Colors.line,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 8,
    shadowColor: '#3B1A10',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  input: { maxHeight: 140, minHeight: 28, paddingHorizontal: 10, paddingVertical: 4, fontSize: 16, lineHeight: 22, color: Colors.ink },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  plus: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: Colors.redSoft,
  },
  modeChipText: { fontSize: 14, fontWeight: '700', color: Colors.red },
  action: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center' },
  actionDisabled: { backgroundColor: Colors.line },
  recorder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 64,
    paddingHorizontal: 8,
    borderRadius: 32,
    borderWidth: 1.5,
    backgroundColor: Colors.card,
  },
  cancel: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  recorderTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  timer: { fontSize: 14, fontWeight: '800', color: Colors.ink, fontVariant: ['tabular-nums'] },
  recorderLabel: { flex: 1, fontSize: 13, color: Colors.inkSoft },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 26 },
  bar: { flex: 1, borderRadius: 2, opacity: 0.85 },
  sendRecording: { width: 48, height: 48, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
});
