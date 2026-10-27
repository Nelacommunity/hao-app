import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, View } from 'react-native';

import type { ToolUse } from '@shared/ai/types';

import { AssistantMessage, ChatColors, ChatError, ChatWelcome, Suggestion, Thinking, UserMessage } from '@/components/chat-ui';
import { Colors, Spacing, themed } from '@/constants/theme';
import { chatTitle, useChatAutosave, type OpenChat } from '@/lib/chats';
import { stripMarkdown } from '@/lib/guide-state';
import type { Language } from '@/lib/languages';
import { askMemory, countMemories, formatWhen, MemoryKindMeta, type MemoryItem } from '@/lib/memory';
import { tx, useT } from '@/lib/i18n';

export type MemoryChatData = { messages: Message[] };
export const EMPTY_MEMORY_CHAT: MemoryChatData = { messages: [] };

type Message = { role: 'user' | 'hao'; text: string; cited?: MemoryItem[]; saved?: number; tools?: ToolUse[] };

const EXAMPLES = [
  { text: tx('What did the taxi driver say about the fare?'), remember: false },
  { text: tx('Which restaurants did I like?'), remember: false },
  { text: tx('Remember: my hotel room is 1208'), remember: true },
  { text: tx('What are my plans this week?'), remember: false },
];

type Props = {
  /** The chat to show; give the component `key={chat.id}` so opening another chat starts fresh. */
  chat: OpenChat<MemoryChatData>;
  language: Language;
  onBusyChange: (busy: boolean) => void;
};

export type MemoryChatHandle = { send: (text: string) => void };

/** Ask Hao about anything you've seen, heard or planned in China. */
export const MemoryChat = forwardRef<MemoryChatHandle, Props>(function MemoryChat({ chat, language, onBusyChange }, ref) {
  const t = useT();
  const [messages, setMessages] = useState<Message[]>(chat.data.messages);
  const firstAsked = messages.find((m) => m.role === 'user')?.text;
  const saved = useMemo(() => ({ id: chat.id, title: chatTitle(firstAsked), data: { messages } }), [chat.id, firstAsked, messages]);
  useChatAutosave('memory', saved, messages.length > 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  // The reply that just arrived, which types itself out.
  const [fresh, setFresh] = useState<Message | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);

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
      const reply: Message = { role: 'hao', text: stripMarkdown(result.answer), cited: result.cited, saved: result.saved, tools: result.tools };
      setFresh(reply);
      setMessages((m) => [...m, reply]);
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
        <ChatWelcome
          title={t('Your China memory')}
          body={t('I remember what people told you, places you liked and your plans. Ask me anything, or tell me something to remember.')}>
          <Pressable onPress={() => router.push('/memories')} style={({ pressed }) => [styles.countCard, pressed && styles.pressed]}>
            <Ionicons name="sparkles-outline" size={18} color={ChatColors.soft} />
            <Text style={styles.countText}>
              {count === null ? t('Hao’s memory') : count === 0 ? t('Nothing remembered yet') : count === 1 ? t('I remember 1 thing') : t('I remember {count} things', { count })}
            </Text>
            <Text style={styles.manage}>{t('Manage')}</Text>
          </Pressable>
          {EXAMPLES.map((e) => (
            <Suggestion key={e.text} icon={e.remember ? 'bookmark-outline' : 'search'} text={t(e.text)} onPress={() => send(t(e.text))} />
          ))}
        </ChatWelcome>
      ) : null}

      {messages.map((m, i) =>
        m.role === 'user' ? (
          <UserMessage key={i} text={m.text} />
        ) : (
          <AssistantMessage key={i} text={m.text} animate={m === fresh} speech={language.speech} tools={m.tools}>
            {m.saved ? (
              <View style={styles.saved}>
                <Ionicons name="checkmark-circle" size={15} color={Colors.jade} />
                <Text style={styles.savedText}>{t('Saved to memory')}</Text>
              </View>
            ) : null}
            {m.cited?.length ? (
              <View style={styles.sources}>
                <Text style={styles.sourcesLabel}>{t('From your memory')}</Text>
                {m.cited.map((c) => (
                  <View key={c.id} style={styles.source}>
                    <Ionicons name={MemoryKindMeta[c.kind].icon} size={14} color={ChatColors.soft} />
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
          </AssistantMessage>
        )
      )}

      {busy ? <Thinking label={t('Remembering…')} /> : null}
      {error ? <ChatError message={error} /> : null}
    </ScrollView>
  );
});

const styles = themed(() => StyleSheet.create({
  pressed: { opacity: 0.7 },
  feed: { paddingHorizontal: 20, paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: 22, flexGrow: 1 },
  countCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: ChatColors.userBubble,
  },
  countText: { flex: 1, fontSize: 14, fontWeight: '500', color: ChatColors.text },
  manage: { fontSize: 14, fontWeight: '600', color: ChatColors.text, textDecorationLine: 'underline' },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  savedText: { fontSize: 13, fontWeight: '500', color: Colors.jade },
  sources: { gap: 2, borderRadius: 14, borderWidth: 1, borderColor: ChatColors.border, backgroundColor: ChatColors.surface, paddingVertical: 6 },
  sourcesLabel: { fontSize: 12, fontWeight: '600', color: ChatColors.soft, paddingHorizontal: 12, paddingVertical: 4 },
  source: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  sourceText: { fontSize: 14, lineHeight: 20, color: ChatColors.text },
  sourceMeta: { fontSize: 12, color: ChatColors.faint, marginTop: 2 },
}));
