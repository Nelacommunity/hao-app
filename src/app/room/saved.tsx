import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RoomSummary } from '@shared/rooms/protocol';

import { ChatColors } from '@/components/chat-ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { deleteChat } from '@/lib/chats';
import { useT } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type Saved = {
  title: string;
  updated_at: string;
  data: {
    lines?: { speaker: 'USER' | 'LOCAL' | 'AGENT'; to?: 'USER' | 'LOCAL'; text: string }[];
    names?: { user: string | null; local: string | null };
    summary?: string;
    learned?: string[];
    order?: RoomSummary | null;
  };
};

/** A QR-room conversation the user saved: what Hao took from it, and the whole conversation. Read-only. */
export default function SavedConversation() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('chats')
      .select('title, updated_at, data')
      .eq('id', id)
      .eq('mode', 'room')
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (e || !data) setError(t('This conversation is no longer saved.'));
        else setSaved(data as unknown as Saved);
      });
  }, [id, t]);

  const remove = () => {
    const run = () =>
      deleteChat(id)
        .then(() => router.back())
        .catch((e: Error) => setError(e.message));
    if (Platform.OS === 'web') return void run();
    Alert.alert(t('Delete this conversation?'), t('It is removed from your chats. What Hao already learned stays in your Hao DNA, where you can change it.'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Delete'), style: 'destructive', onPress: run },
    ]);
  };

  const lines = saved?.data.lines ?? [];
  const local = saved?.data.names?.local ?? null;
  const who = (l: (typeof lines)[number]) =>
    l.speaker === 'USER' ? t('You') : l.speaker === 'LOCAL' ? (local ?? t('They said')) : l.to === 'LOCAL' && local ? t('Hao → {name}', { name: local }) : 'Hao';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t('Go back')}>
          <Ionicons name="chevron-back" size={22} color={Colors.ink} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {saved?.title ?? t('Saved conversation')}
        </Text>
        <Pressable onPress={remove} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t('Delete this conversation')}>
          <Ionicons name="trash-outline" size={20} color={Colors.red} />
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!saved && !error ? <ActivityIndicator color={Colors.inkSoft} style={{ marginTop: Spacing.xl }} /> : null}

      {saved ? (
        <ScrollView contentContainerStyle={styles.feed}>
          {local ? <Text style={styles.with}>{t('Conversation with {name}', { name: local })}</Text> : null}
          {saved.data.summary ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>{t('What happened')}</Text>
              <Text style={styles.cardText}>{saved.data.summary}</Text>
              {saved.data.order?.items.length ? (
                <Text style={styles.cardText}>
                  {saved.data.order.items.join(' · ')}
                  {saved.data.order.total ? ` — ${saved.data.order.total}` : ''}
                </Text>
              ) : null}
            </View>
          ) : null}
          {saved.data.learned?.length ? (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>{t('Good to know next time')}</Text>
              {saved.data.learned.map((l, i) => (
                <Text key={i} style={styles.cardText}>
                  • {l}
                </Text>
              ))}
            </View>
          ) : null}

          {lines.map((l, i) => (
            <View key={i} style={[styles.bubble, l.speaker === 'USER' ? styles.mine : l.speaker === 'LOCAL' ? styles.theirs : styles.hao]}>
              <Text style={styles.who}>{who(l)}</Text>
              <Text style={styles.text} selectable>
                {l.text}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: ChatColors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.sm, height: 56, backgroundColor: Colors.card },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 17, fontWeight: '800', color: Colors.ink, textAlign: 'center' },
  error: { color: Colors.red, textAlign: 'center', margin: Spacing.md },
  feed: { padding: Spacing.md, gap: Spacing.sm },
  with: { fontSize: 13, fontWeight: '700', color: ChatColors.soft, textAlign: 'center', marginBottom: Spacing.xs },
  card: { backgroundColor: Colors.card, borderRadius: Radius.md, padding: Spacing.md, gap: 6, marginBottom: Spacing.sm },
  cardLabel: { fontSize: 12, fontWeight: '800', color: Colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.6 },
  cardText: { fontSize: 15, lineHeight: 22, color: Colors.ink },
  bubble: { maxWidth: '85%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  mine: { alignSelf: 'flex-end', backgroundColor: ChatColors.userBubble, borderTopRightRadius: 3 },
  theirs: { alignSelf: 'flex-start', backgroundColor: ChatColors.haoBubble, borderTopLeftRadius: 3 },
  hao: { alignSelf: 'center', backgroundColor: Colors.strong },
  who: { fontSize: 11, fontWeight: '800', color: ChatColors.soft, marginBottom: 2 },
  text: { fontSize: 16, lineHeight: 22, color: ChatColors.text },
}));
