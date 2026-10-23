import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatComposer, type ChatMode } from '@/components/chat-composer';
import { GuideChat, type GuideChatHandle } from '@/components/guide-chat';
import { LanguagePicker } from '@/components/language-picker';
import { MemoryChat, type MemoryChatHandle } from '@/components/memory-chat';
import { ModeSheet } from '@/components/mode-sheet';
import { SpeakButton } from '@/components/speak-button';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { askAgent, entriesForTurn, type LogEntry, type Speaker } from '@/lib/agent';
import { readAudioBase64 } from '@/lib/audio-file';
import { useLanguagePreference } from '@/lib/auth';
import { tx, useT } from '@/lib/i18n';

// Formats Gemini accepts directly: WAV on iOS, raw AAC on Android, WebM in the browser.
const RECORDING_OPTIONS: RecordingOptions = {
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

const SUGGESTIONS = [
  { icon: 'train-outline' as const, text: tx('Ask how to get to the Forbidden City by metro') },
  { icon: 'restaurant-outline' as const, text: tx('Check if this dish has peanuts, I’m allergic') },
  { icon: 'car-outline' as const, text: tx('Tell the driver to take me to my hotel and ask the price') },
  { icon: 'phone-portrait-outline' as const, text: tx('Ask where I can buy a SIM card nearby') },
];

type Input = { text: string } | { audio: { data: string; mimeType: string } };

export default function AgentScreen() {
  const t = useT();
  const [lang, setLang] = useLanguagePreference();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Interpret: Hao talks to a local for you. Guide: Hao coaches you through tasks (WeChat, payments, transport…).
  const [mode, setMode] = useState<ChatMode>('interpret');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [goal, setGoal] = useState('');
  const [status, setStatus] = useState<'in_progress' | 'done'>('in_progress');
  const [nextSpeaker, setNextSpeaker] = useState<Speaker>('traveller');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [guideBusy, setGuideBusy] = useState(false);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [recordingFor, setRecordingFor] = useState<Speaker | null>(null);
  // Lets the user flip who the mic is for on the current turn (e.g. the local spoke out of turn).
  const [speakerOverride, setSpeakerOverride] = useState<{ turn: number; speaker: Speaker } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ speaker: Speaker; input: Input } | null>(null);

  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 100);
  const scrollRef = useRef<ScrollView>(null);
  const guideRef = useRef<GuideChatHandle>(null);
  const memoryRef = useRef<MemoryChatHandle>(null);

  // The single mic listens to whoever's turn it is: after Hao speaks Chinese, it's the local's turn.
  const defaultSpeaker: Speaker = log.length ? nextSpeaker : 'traveller';
  const micSpeaker = speakerOverride?.turn === log.length ? speakerOverride.speaker : defaultSpeaker;

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [log, busy]);

  const run = async (speaker: Speaker, input: Input) => {
    setBusy(true);
    setError(null);
    setFailed(null);
    try {
      const turn = await askAgent({ speaker, travellerLanguage: lang.name, log, ...input });
      setLog((prev) => [...prev, ...entriesForTurn(speaker, turn, 'text' in input ? input.text : undefined)]);
      setGoal(turn.goal);
      setStatus(turn.status);
      setNextSpeaker(turn.next_speaker);
      if (turn.say_to_local_zh) {
        Speech.speak(turn.say_to_local_zh, { language: 'zh-CN', rate: 0.9 });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong'));
      setFailed({ speaker, input });
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    if (mode === 'guide') guideRef.current?.send(text);
    else if (mode === 'memory') memoryRef.current?.send(text);
    else if (!busy) run('traveller', { text });
  };

  const startRecording = async () => {
    if (recordingFor || busy) return;
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError(t('Hao needs microphone access to listen.'));
      return;
    }
    Speech.stop();
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecordingFor(micSpeaker);
  };

  const stopRecording = async (sendIt: boolean) => {
    const speaker = recordingFor;
    if (!speaker) return;
    await recorder.stop();
    setRecordingFor(null);
    // Leave recording mode so speech plays through the loudspeaker on iOS.
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (!sendIt) return;
    if (!recorder.uri) {
      setError(t('Nothing was recorded. Try again.'));
      return;
    }
    run(speaker, { audio: await readAudioBase64(recorder.uri) });
  };

  const reset = () => {
    Speech.stop();
    setLog([]);
    setGoal('');
    setStatus('in_progress');
    setNextSpeaker('traveller');
    setSpeakerOverride(null);
    setError(null);
    setFailed(null);
  };

  const localTurn = mode === 'interpret' && micSpeaker === 'local';

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <View style={styles.mark}>
              <Text style={styles.markText}>好</Text>
            </View>
            <View>
              <Text style={styles.brandName}>Hao</Text>
              <Text style={styles.brandMode}>{{ interpret: t('Interpreter'), guide: t('China guide'), memory: t('Your memory') }[mode]}</Text>
            </View>
          </View>

          {/* Language, QR rooms and new chat share one pill. */}
          <View style={styles.pill}>
            <Pressable onPress={() => setPickerOpen(true)} style={styles.pillItem} accessibilityLabel={t('Your language: {language}. Change', { language: lang.name })}>
              <Text style={{ fontSize: 16 }}>{lang.flag}</Text>
              <Text style={styles.pillText} numberOfLines={1}>
                {lang.code.startsWith('custom:') ? lang.native.slice(0, 10) : lang.code.toUpperCase()}
              </Text>
            </Pressable>
            <View style={styles.pillDivider} />
            <Pressable onPress={() => router.push('/room')} style={styles.pillItem} accessibilityLabel={t('QR rooms: talk on two phones or broadcast a tour')}>
              <Ionicons name="qr-code-outline" size={18} color={Colors.ink} />
            </Pressable>
            {mode === 'interpret' && log.length > 0 ? (
              <>
                <View style={styles.pillDivider} />
                <Pressable onPress={reset} style={styles.pillItem} accessibilityLabel={t('New conversation')}>
                  <Ionicons name="create-outline" size={18} color={Colors.ink} />
                </Pressable>
              </>
            ) : null}
          </View>
        </View>

        {mode === 'memory' ? (
          <MemoryChat ref={memoryRef} language={lang} onBusyChange={setMemoryBusy} />
        ) : mode === 'guide' ? (
          <GuideChat
            ref={guideRef}
            language={lang}
            onBusyChange={setGuideBusy}
            onHandoff={(handoffGoal) => {
              setMode('interpret');
              run('traveller', { text: handoffGoal });
            }}
          />
        ) : (
          <>
            {goal ? (
              <View style={styles.mission}>
                <Ionicons name="flag" size={14} color={Colors.red} />
                <Text style={styles.missionText} numberOfLines={1}>
                  {goal}
                </Text>
                <View style={[styles.statusBadge, status === 'done' && { backgroundColor: Colors.jadeSoft }]}>
                  <Text style={[styles.statusText, status === 'done' && { color: Colors.jade }]}>
                    {status === 'done' ? t('Done') : t('Working')}
                  </Text>
                </View>
              </View>
            ) : null}

            <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.feed} keyboardShouldPersistTaps="handled">
              {log.length === 0 && !busy ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>{t('What should I say for you?')}</Text>
                  <Text style={styles.emptyBody}>{t('Tell me in your own words. I’ll speak Chinese to the person, listen to their answer and tell you what to do.')}</Text>
                  <View style={styles.suggestions}>
                    {SUGGESTIONS.map((s) => (
                      <Pressable
                        key={s.text}
                        onPress={() => run('traveller', { text: t(s.text) })}
                        style={({ pressed }) => [styles.suggestion, pressed && { opacity: 0.7 }]}>
                        <Ionicons name={s.icon} size={18} color={Colors.red} />
                        <Text style={styles.suggestionText}>{t(s.text)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {log.map((entry, i) => (
                <Animated.View key={i} entering={FadeInUp.duration(250)}>
                  <FeedItem entry={entry} speech={lang.speech} />
                </Animated.View>
              ))}

              {busy ? (
                <View style={styles.thinking}>
                  <ActivityIndicator color={Colors.red} />
                  <Text style={styles.thinkingText}>{t('Hao is thinking…')}</Text>
                </View>
              ) : null}

              {error ? (
                <View style={styles.error}>
                  <Ionicons name="alert-circle" size={18} color={Colors.redDark} />
                  <Text style={styles.errorText}>{error}</Text>
                  {failed ? (
                    <Pressable onPress={() => run(failed.speaker, failed.input)} hitSlop={8}>
                      <Text style={styles.retry}>{t('Retry')}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>

            {log.length > 0 && !recordingFor ? (
              <Pressable
                onPress={() => setSpeakerOverride({ turn: log.length, speaker: micSpeaker === 'local' ? 'traveller' : 'local' })}
                style={styles.turn}
                accessibilityRole="button"
                accessibilityLabel={localTurn ? t('Microphone is for the local person. Tap to switch') : t('Microphone is for you. Tap to switch')}>
                <View style={[styles.turnDot, { backgroundColor: localTurn ? Colors.ink : Colors.red }]} />
                <Text style={styles.turnText}>
                  {localTurn ? `${t('Their turn')} · 请对方说话` : t('Your turn')}
                </Text>
                <Text style={styles.turnSwitch}>{t('Switch')}</Text>
              </Pressable>
            ) : null}
          </>
        )}

        <ChatComposer
          mode={mode}
          value={draft}
          onChangeText={setDraft}
          onSend={send}
          onOpenMenu={() => setMenuOpen(true)}
          busy={{ interpret: busy, guide: guideBusy, memory: memoryBusy }[mode]}
          voice={
            mode === 'interpret'
              ? {
                  recording: !!recordingFor,
                  speakerLabel: recordingFor === 'local' ? `正在听对方 · ${t('Listening to them')}` : t('Listening to you'),
                  accent: (recordingFor ?? micSpeaker) === 'local' ? Colors.ink : Colors.red,
                  durationMillis: recorderState.durationMillis,
                  metering: recorderState.metering,
                  onStart: startRecording,
                  onStop: stopRecording,
                }
              : undefined
          }
        />
      </KeyboardAvoidingView>

      <ModeSheet
        visible={menuOpen}
        mode={mode}
        onSelect={setMode}
        onBrowseTopics={() => guideRef.current?.showTopics()}
        onClose={() => setMenuOpen(false)}
      />
      <LanguagePicker visible={pickerOpen} selected={lang} onSelect={setLang} onClose={() => setPickerOpen(false)} />
    </SafeAreaView>
  );
}

function FeedItem({ entry, speech }: { entry: LogEntry; speech: string }) {
  switch (entry.kind) {
    case 'traveller':
      return (
        <View style={[styles.bubble, styles.travellerBubble]}>
          <Text style={styles.travellerText}>{entry.text}</Text>
        </View>
      );
    case 'local':
      return (
        <View style={[styles.bubble, styles.localBubble]}>
          <Text style={styles.localLabel}>对方 said</Text>
          <Text style={styles.localZh}>{entry.text}</Text>
          {entry.translation ? <Text style={styles.localTranslation}>{entry.translation}</Text> : null}
        </View>
      );
    case 'to_local':
      return (
        <View style={styles.toLocal}>
          <View style={styles.toLocalHeader}>
            <Text style={styles.toLocalLabel}>Hao → 对方</Text>
            <SpeakButton text={entry.zh} tint="#fff" background={Colors.red} />
          </View>
          <Text style={styles.toLocalZh}>{entry.zh}</Text>
          {entry.pinyin ? <Text style={styles.toLocalPinyin}>{entry.pinyin}</Text> : null}
          {entry.gloss ? <Text style={styles.toLocalGloss}>“{entry.gloss}”</Text> : null}
        </View>
      );
    case 'to_traveller':
      return (
        <View style={styles.toTraveller}>
          <View style={styles.toTravellerHeader}>
            <View style={styles.haoBadge}>
              <Text style={styles.haoBadgeText}>好</Text>
            </View>
            <Text style={styles.toTravellerText}>{entry.text}</Text>
            <SpeakButton text={[entry.text, ...entry.points].join('. ')} language={speech} tint="#A26A00" background="#fff" />
          </View>
          {entry.points.length > 0 ? (
            <View style={styles.points}>
              {entry.points.map((p, i) => (
                <View key={i} style={styles.point}>
                  <Text style={styles.pointNum}>{i + 1}</Text>
                  <Text style={styles.pointText}>{p}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center' },
  markText: { color: Colors.gold, fontSize: 19, fontWeight: '900' },
  brandName: { fontSize: 17, fontWeight: '800', color: Colors.ink },
  brandMode: { fontSize: 12, fontWeight: '600', color: Colors.muted },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
    paddingHorizontal: 4,
  },
  pillItem: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 40, paddingHorizontal: 10 },
  pillText: { fontSize: 13, fontWeight: '800', color: Colors.ink, maxWidth: 80 },
  pillDivider: { width: 1, height: 18, backgroundColor: Colors.line },
  mission: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.redSoft,
    borderRadius: Radius.md,
  },
  missionText: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.ink },
  statusBadge: { backgroundColor: Colors.goldSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.pill },
  statusText: { fontSize: 11, fontWeight: '800', color: '#A26A00' },
  feed: { padding: Spacing.md, gap: Spacing.sm, flexGrow: 1 },
  empty: { flex: 1, justifyContent: 'center', paddingVertical: Spacing.lg },
  emptyTitle: { fontSize: 26, fontWeight: '800', color: Colors.ink, letterSpacing: -0.5 },
  emptyBody: { fontSize: 15, lineHeight: 22, color: Colors.inkSoft, marginTop: Spacing.sm },
  suggestions: { gap: Spacing.sm, marginTop: Spacing.lg },
  suggestion: {
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
  suggestionText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.ink },
  bubble: { maxWidth: '85%', padding: Spacing.md, borderRadius: Radius.lg },
  travellerBubble: { alignSelf: 'flex-end', backgroundColor: Colors.red, borderBottomRightRadius: 6 },
  travellerText: { fontSize: 16, lineHeight: 22, color: '#fff', fontWeight: '600' },
  localBubble: { alignSelf: 'flex-start', backgroundColor: Colors.card, borderBottomLeftRadius: 6, ...Shadow },
  localLabel: { fontSize: 11, fontWeight: '800', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  localZh: { fontSize: 18, fontWeight: '700', color: Colors.ink, marginTop: 4 },
  localTranslation: { fontSize: 14, lineHeight: 20, color: Colors.inkSoft, marginTop: 4 },
  toLocal: { backgroundColor: Colors.ink, borderRadius: Radius.lg, padding: Spacing.md },
  toLocalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toLocalLabel: { fontSize: 12, fontWeight: '800', color: Colors.gold, letterSpacing: 1 },
  toLocalZh: { fontSize: 26, lineHeight: 36, fontWeight: '800', color: '#fff', marginTop: Spacing.sm },
  toLocalPinyin: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  toLocalGloss: { fontSize: 13, color: Colors.muted, marginTop: Spacing.sm, fontStyle: 'italic' },
  toTraveller: { backgroundColor: Colors.goldSoft, borderRadius: Radius.lg, padding: Spacing.md },
  toTravellerHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  haoBadge: { width: 28, height: 28, borderRadius: 9, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center' },
  haoBadgeText: { color: Colors.gold, fontWeight: '900', fontSize: 15 },
  toTravellerText: { flex: 1, fontSize: 15, lineHeight: 22, color: Colors.ink, fontWeight: '600' },
  points: { marginTop: Spacing.md, gap: Spacing.sm },
  point: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  pointNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.red,
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 22,
    overflow: 'hidden',
  },
  pointText: { flex: 1, fontSize: 14, lineHeight: 21, color: Colors.ink },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, alignSelf: 'center', padding: Spacing.sm },
  thinkingText: { fontSize: 14, fontWeight: '600', color: Colors.inkSoft },
  error: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, backgroundColor: Colors.redSoft, borderRadius: Radius.md },
  errorText: { flex: 1, fontSize: 14, color: Colors.redDark },
  retry: { fontSize: 14, fontWeight: '800', color: Colors.red },
  turn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  turnDot: { width: 8, height: 8, borderRadius: 4 },
  turnText: { fontSize: 13, fontWeight: '700', color: Colors.ink },
  turnSwitch: { fontSize: 13, fontWeight: '700', color: Colors.red },
});
