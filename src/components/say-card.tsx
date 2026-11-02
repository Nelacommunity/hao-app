// "I want this": what Hao says for the traveller to a waiter or shopkeeper. The card shows the Chinese and what it
// means; Play reads it aloud in Mandarin, and Show opens it full screen, big enough to hold up across a counter.
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { StaffLine } from '@shared/ai/types';

import { ChatColors } from '@/components/chat-ui';
import { Colors, Radius, themed } from '@/constants/theme';
import { tx, useT } from '@/lib/i18n';

const TITLES: Record<StaffLine['to'], string> = {
  restaurant: tx('Show this to the waiter'),
  shop: tx('Show this to the shopkeeper'),
  anyone: tx('Show this to them'),
};

/** Plays the Chinese aloud; tap again to stop. */
function usePlay(zh: string) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => void Speech.stop(), []);
  const toggle = () => {
    if (playing) {
      Speech.stop();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    Speech.speak(zh.replace(/\n/g, ' '), {
      language: 'zh-CN',
      rate: 0.85,
      onDone: () => setPlaying(false),
      onStopped: () => setPlaying(false),
      onError: () => setPlaying(false),
    });
  };
  return { playing, toggle };
}

export function SayCard({ data }: { data: StaffLine }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { playing, toggle } = usePlay(data.zh);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Ionicons name={data.to === 'restaurant' ? 'restaurant' : data.to === 'shop' ? 'storefront' : 'chatbubbles'} size={16} color={Colors.red} />
        </View>
        <Text style={styles.title}>{t(TITLES[data.to])}</Text>
      </View>
      <Text style={styles.zh} selectable>
        {data.zh}
      </Text>
      {data.meaning ? <Text style={styles.meaning}>{data.meaning}</Text> : null}
      <View style={styles.actions}>
        <Pressable
          onPress={toggle}
          style={({ pressed }) => [styles.button, styles.ghost, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={playing ? t('Stop') : t('Say it in Chinese')}>
          <Ionicons name={playing ? 'stop' : 'volume-high'} size={18} color={Colors.red} />
          <Text style={styles.ghostText}>{playing ? t('Stop') : t('Say it')}</Text>
        </Pressable>
        <Pressable
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.button, styles.solid, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('Show full screen')}>
          <Ionicons name="expand" size={17} color="#fff" />
          <Text style={styles.solidText}>{t('Show them')}</Text>
        </Pressable>
      </View>
      <StaffSheet line={open ? data : null} onClose={() => setOpen(false)} />
    </View>
  );
}

/** The line full screen, for the waiter or shopkeeper to read. `line` null hides it. */
export function StaffSheet({ line, onClose }: { line: StaffLine | null; onClose: () => void }) {
  const t = useT();
  const { playing, toggle } = usePlay(line?.zh ?? '');
  return (
    <Modal visible={!!line} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={styles.sheet}>
        <View style={styles.sheetTop}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.close} accessibilityRole="button" accessibilityLabel={t('Close')}>
            <Ionicons name="close" size={26} color={Colors.ink} />
          </Pressable>
        </View>
        {line ? (
          <ScrollView contentContainerStyle={styles.sheetBody}>
            {/* For the person reading it: who is showing them this. */}
            <Text style={styles.sheetIntro}>您好！我是外国游客，正在用翻译软件和您沟通 🙏</Text>
            <Text style={styles.sheetZh} selectable adjustsFontSizeToFit>
              {line.zh}
            </Text>
            {line.meaning ? <Text style={styles.sheetMeaning}>{line.meaning}</Text> : null}
          </ScrollView>
        ) : null}
        <Pressable
          onPress={toggle}
          style={({ pressed }) => [styles.play, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={playing ? t('Stop') : t('Say it in Chinese')}>
          <Ionicons name={playing ? 'stop' : 'volume-high'} size={22} color="#fff" />
          <Text style={styles.playText}>{playing ? t('Stop') : `${t('Say it')} · 播放`}</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
    card: { backgroundColor: ChatColors.surface, borderRadius: 20, borderWidth: 1, borderColor: ChatColors.border, padding: 14, gap: 10 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    icon: { width: 30, height: 30, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.redSoft },
    title: { flex: 1, fontSize: 14, fontWeight: '700', color: ChatColors.soft },
    zh: { fontSize: 22, lineHeight: 32, fontWeight: '700', color: ChatColors.text },
    meaning: { fontSize: 14, lineHeight: 20, color: ChatColors.soft },
    actions: { flexDirection: 'row', gap: 10, marginTop: 2 },
    button: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: Radius.pill },
    ghost: { backgroundColor: Colors.redSoft },
    ghostText: { fontSize: 15, fontWeight: '700', color: Colors.red },
    solid: { backgroundColor: Colors.red },
    solidText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    // Always light: easiest to read for someone across a counter, whatever the traveller's theme.
    sheet: { flex: 1, backgroundColor: '#FFFFFF' },
    sheetTop: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 8 },
    close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2F2F2' },
    sheetBody: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 16, gap: 20 },
    sheetIntro: { fontSize: 17, lineHeight: 24, color: '#5E5B66' },
    sheetZh: { fontSize: 40, lineHeight: 54, fontWeight: '800', color: '#111111' },
    sheetMeaning: { fontSize: 15, lineHeight: 21, color: '#8A8794' },
    play: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 56,
      marginHorizontal: 20,
      marginBottom: 16,
      borderRadius: Radius.pill,
      backgroundColor: '#D7263D',
    },
    playText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  })
);
