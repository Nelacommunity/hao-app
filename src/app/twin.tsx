import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { twinDna, twinFromRow } from '@shared/ai/twin';

import { AssistantMessage, ChatColors, ChatError, QuickReplies, Thinking, UserMessage } from '@/components/chat-ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useTravellerLanguage } from '@/lib/language-store';
import { useCurrentLocation } from '@/lib/location';
import { countryName } from '@/lib/place-actions';
import { askTwin, detectCity, deviceCountry, type TwinMessage } from '@/lib/twin';

/** How long to wait for a GPS fix before starting the chat without a detected city. */
const LOCATION_WAIT_MS = 2000;

/**
 * Hao gets to know the user by chatting (after sign-up, and from Me to change anything later) and
 * builds their "Hao DNA": where they're from, student or tourist, diet, allergies, spice, budget and
 * what they love. The country and city are detected and only confirmed here.
 */
export default function TwinScreen() {
  const t = useT();
  const language = useTravellerLanguage();
  const { profile, refreshProfile, updateProfile } = useAuth();
  const location = useCurrentLocation({ askOnMount: true });
  const [messages, setMessages] = useState<TwinMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [dna, setDna] = useState<string | null>(null);
  const [dnaOpen, setDnaOpen] = useState(false);
  const [fresh, setFresh] = useState<number>(-1);
  const [detectedCity, setDetectedCity] = useState<string | null>(null);
  const [waited, setWaited] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const started = useRef(false);
  const firstTime = !profile?.twin_completed_at;

  const currentDna =
    dna ??
    (profile
      ? twinDna(twinFromRow(profile), { countryName })
      : '');

  // The city comes from GPS; wait briefly for it so Hao can confirm it instead of asking.
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), LOCATION_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!location.coords) return;
    detectCity(location.coords)
      .then(setDetectedCity)
      .catch(() => {});
  }, [location.coords]);

  const send = useCallback(
    async (raw: string, history: TwinMessage[]) => {
      const text = raw.trim();
      setBusy(true);
      setError(null);
      setFailed(null);
      const withUser = text ? [...history, { role: 'user' as const, text }] : history;
      setMessages(withUser);
      try {
        const r = await askTwin({
          language: { code: language.code, name: language.name },
          text,
          history,
          detected: { nationality: deviceCountry(), city: detectedCity },
        });
        setFresh(withUser.length);
        setMessages([...withUser, { role: 'hao', text: r.reply, quickReplies: r.quick_replies }]);
        setDna(r.dna);
        if (r.changed.length) setDnaOpen(true);
        if (r.changed.length || r.done) refreshProfile().catch(() => {});
        if (r.done) setDone(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('Something went wrong'));
        setFailed(text || ' ');
        setMessages(history);
      } finally {
        setBusy(false);
      }
    },
    [language.code, language.name, detectedCity, refreshProfile, t]
  );

  // Hao opens the conversation once the city is known (or after the short wait).
  useEffect(() => {
    if (started.current || !profile || !(waited || detectedCity)) return;
    started.current = true;
    const timer = setTimeout(() => send('', []), 0);
    return () => clearTimeout(timer);
  }, [profile, waited, detectedCity, send]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, busy]);

  const submit = (text: string) => {
    if (!text.trim() || busy) return;
    setDraft('');
    send(text, messages);
  };

  const close = () => {
    // Skipping counts as done for the automatic prompt; the chat stays one tap away in Me.
    if (firstTime) updateProfile({ twin_completed_at: new Date().toISOString() }).catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace('/translate');
  };

  const lastHao = messages.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} accessibilityRole="header">
              {t('Your Hao DNA')}
            </Text>
            <Text style={styles.subtitle}>{t('Hao learns what you like, so every suggestion fits you.')}</Text>
          </View>
          <Pressable onPress={close} style={styles.close} accessibilityRole="button" accessibilityLabel={done || !firstTime ? t('Done') : t('Later')}>
            <Text style={styles.closeText}>{done || !firstTime ? t('Done') : t('Later')}</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => setDnaOpen((o) => !o)}
          style={styles.dna}
          accessibilityRole="button"
          accessibilityState={{ expanded: dnaOpen }}
          accessibilityLabel={t('Your Hao DNA')}>
          <View style={styles.dnaHeader}>
            <Ionicons name="finger-print" size={18} color={Colors.red} />
            <Text style={styles.dnaTitle}>{t('What Hao knows about you')}</Text>
            <Ionicons name={dnaOpen ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.muted} />
          </View>
          {dnaOpen ? (
            <Text style={styles.dnaText} selectable>
              {currentDna}
            </Text>
          ) : null}
        </Pressable>

        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.feed} keyboardShouldPersistTaps="handled">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <UserMessage key={i} text={m.text} />
            ) : (
              <AssistantMessage key={i} text={m.text} animate={i === fresh} speech={language.speech}>
                {i === lastHao && !busy && m.quickReplies?.length ? <QuickReplies replies={m.quickReplies} onPress={submit} /> : null}
              </AssistantMessage>
            )
          )}
          {busy ? <Thinking /> : null}
          {error ? <ChatError message={error} onRetry={failed !== null ? () => send(failed.trim(), messages) : undefined} /> : null}
          {done ? (
            <Pressable onPress={close} style={styles.finish} accessibilityRole="button">
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.finishText}>{t('Start exploring')}</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('Answer Hao, or tell it what to change…')}
            placeholderTextColor={ChatColors.faint}
            style={styles.input}
            multiline
            editable={!busy}
            submitBehavior="blurAndSubmit"
            onSubmitEditing={() => submit(draft)}
            returnKeyType="send"
            accessibilityLabel={t('Message to Hao')}
          />
          <Pressable
            onPress={() => submit(draft)}
            disabled={!draft.trim() || busy}
            style={[styles.send, (!draft.trim() || busy) && { opacity: 0.4 }]}
            accessibilityRole="button"
            accessibilityLabel={t('Send')}>
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: ChatColors.background },
  topBar: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  title: { fontSize: 22, fontWeight: '900', color: Colors.ink },
  subtitle: { fontSize: 14, color: Colors.inkSoft, marginTop: 2 },
  close: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.pill, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line },
  closeText: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  dna: { margin: Spacing.md, marginBottom: 0, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line, gap: Spacing.sm },
  dnaHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dnaTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: Colors.ink },
  dnaText: { fontSize: 14, lineHeight: 21, color: Colors.inkSoft, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
  feed: { padding: Spacing.md, gap: Spacing.md },
  finish: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.lg, minHeight: 48, borderRadius: Radius.pill, backgroundColor: Colors.red },
  finishText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    margin: Spacing.md,
    padding: Spacing.sm,
    borderRadius: 24,
    backgroundColor: ChatColors.surface,
    borderWidth: 1,
    borderColor: ChatColors.border,
  },
  input: { flex: 1, maxHeight: 140, minHeight: 36, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, color: ChatColors.text },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: ChatColors.accent },
}));
