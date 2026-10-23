import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { SpeakButton } from '@/components/speak-button';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { stripMarkdown } from '@/lib/guide-state';
import type { Language } from '@/lib/languages';
import { askMemory, countMemories, formatWhen, MemoryKindMeta, type MemoryItem } from '@/lib/memory';
import { tx, useT } from '@/lib/i18n';

type Message = { role: 'user' | 'hao'; text: string; cited?: MemoryItem[]; saved?: number };

const EXAMPLES = [
  { text: tx('What did the taxi driver say about the fare?'), remember: false },
  { text: tx('Which restaurants did I like?'), remember: false },
  { text: tx('Remember: my hotel room is 1208'), remember: true },
  { text: tx('What are my plans this week?'), remember: false },
];

type Props = { language: Language; onBusyChange: (busy: boolean) => void };

export type MemoryChatHandle = { send: (text: string) => void };

/** Ask Hao about anything you've seen, heard or planned in China. */
export const MemoryChat = forwardRef<MemoryChatHandle, Props>(function MemoryChat({ language, onBusyChange }, ref) {
  const t = useT();
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      countMemories().then(setCount).catch(() => setCount(null));
    }, [])
  );

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, busy]);

  const send = async (raw: string) => {
    const question = raw.trim();
    if (!question || busy) return;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setMessages((m) => [...m, { role: 'user', text: question }]);
    try {
      const result = await askMemory({
        language: { code: language.code, name: language.name },
        question,
        history: messages.map(({ role, text }) => ({ role, text })),
      });
      setMessages((m) => [...m, { role: 'hao', text: stripMarkdown(result.answer), cited: result.cited, saved: result.saved }]);
      if (result.saved) setCount((c) => (c ?? 0) + result.saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong'));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  useImperativeHandle(ref, () => ({ send }));

  return (
    <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.feed} keyboardShouldPersistTaps="handled">
      {messages.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.title}>{t('Your China memory')}</Text>
          <Text style={styles.body}>{t('I remember what people told you, places you liked and your plans. Ask me anything, or tell me something to remember.')}</Text>
          <Pressable onPress={() => router.push('/memories')} style={({ pressed }) => [styles.countCard, pressed && styles.pressed]}>
            <View style={styles.countIcon}>
              <Ionicons name="sparkles" size={18} color={Colors.red} />
            </View>
            <Text style={styles.countText}>
              {count === null ? t('Hao’s memory') : count === 0 ? t('Nothing remembered yet') : count === 1 ? t('I remember 1 thing') : t('I remember {count} things', { count })}
            </Text>
            <Text style={styles.manage}>{t('Manage')}</Text>
          </Pressable>
          <View style={styles.examples}>
            {EXAMPLES.map((e) => (
              <Pressable key={e.text} onPress={() => send(t(e.text))} style={({ pressed }) => [styles.example, pressed && styles.pressed]}>
                <Ionicons name={e.remember ? 'bookmark-outline' : 'search'} size={16} color={Colors.red} />
                <Text style={styles.exampleText}>{t(e.text)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {messages.map((m, i) => (
        <Animated.View key={i} entering={FadeInUp.duration(220)} style={{ gap: Spacing.sm }}>
          {m.role === 'user' ? (
            <View style={[styles.bubble, styles.userBubble]}>
              <Text style={styles.userText}>{m.text}</Text>
            </View>
          ) : (
            <>
              <View style={[styles.bubble, styles.haoBubble]}>
                <View style={styles.haoHeader}>
                  <View style={styles.haoBadge}>
                    <Ionicons name="sparkles" size={13} color={Colors.gold} />
                  </View>
                  <SpeakButton text={m.text} language={language.speech} size={14} tint={Colors.inkSoft} background={Colors.paper} />
                </View>
                <Text style={styles.haoText}>{m.text}</Text>
                {m.saved ? (
                  <View style={styles.saved}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.jade} />
                    <Text style={styles.savedText}>{t('Saved to memory')}</Text>
                  </View>
                ) : null}
              </View>
              {m.cited?.length ? (
                <View style={styles.sources}>
                  <Text style={styles.sourcesLabel}>{t('From your memory')}</Text>
                  {m.cited.map((c) => (
                    <View key={c.id} style={styles.source}>
                      <Ionicons name={MemoryKindMeta[c.kind].icon} size={14} color={Colors.inkSoft} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sourceText}>{c.content}</Text>
                        <Text style={styles.sourceMeta}>
                          {t(MemoryKindMeta[c.kind].label)} · {formatWhen(c.happened_at)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          )}
        </Animated.View>
      ))}

      {busy ? (
        <View style={styles.thinking}>
          <ActivityIndicator color={Colors.red} />
          <Text style={styles.thinkingText}>{t('Remembering…')}</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  feed: { padding: Spacing.md, gap: Spacing.md, flexGrow: 1 },
  empty: { flex: 1, justifyContent: 'center', paddingVertical: Spacing.lg },
  title: { fontSize: 26, fontWeight: '800', color: Colors.ink, letterSpacing: -0.5 },
  body: { fontSize: 15, lineHeight: 22, color: Colors.inkSoft, marginTop: Spacing.sm },
  countCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.goldSoft,
  },
  countIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  countText: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.ink },
  manage: { fontSize: 14, fontWeight: '800', color: Colors.red },
  examples: { gap: Spacing.sm, marginTop: Spacing.md },
  example: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  exampleText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.ink },
  bubble: { maxWidth: '88%', padding: Spacing.md, borderRadius: Radius.lg },
  userBubble: { alignSelf: 'flex-end', backgroundColor: Colors.red, borderBottomRightRadius: 6 },
  userText: { color: '#fff', fontSize: 15, lineHeight: 21, fontWeight: '600' },
  haoBubble: { alignSelf: 'flex-start', backgroundColor: Colors.card, borderBottomLeftRadius: 6, ...Shadow },
  haoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  haoBadge: { width: 24, height: 24, borderRadius: 8, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center' },
  haoText: { fontSize: 15, lineHeight: 22, color: Colors.ink },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.sm },
  savedText: { fontSize: 12, fontWeight: '700', color: Colors.jade },
  sources: { alignSelf: 'flex-start', maxWidth: '88%', gap: 6, padding: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.line },
  sourcesLabel: { fontSize: 11, fontWeight: '800', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 4 },
  source: { flexDirection: 'row', gap: Spacing.sm, padding: 8, borderRadius: Radius.sm, backgroundColor: Colors.card },
  sourceText: { fontSize: 13, lineHeight: 18, color: Colors.ink },
  sourceMeta: { fontSize: 11, color: Colors.muted, marginTop: 2 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, alignSelf: 'center' },
  thinkingText: { fontSize: 14, fontWeight: '600', color: Colors.inkSoft },
  error: { fontSize: 14, color: Colors.redDark, textAlign: 'center' },
});
