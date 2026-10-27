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
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ToolUse } from '@shared/ai/types';

import { ChatComposer, ChatModes, type ChatMode } from '@/components/chat-composer';
import { ChatHistory } from '@/components/chat-history';
import { AssistantMessage, ChatColors, ChatError, ChatWelcome, Suggestion, Thinking, ToolUses, UserMessage } from '@/components/chat-ui';
import { GuideChat, type GuideChatHandle } from '@/components/guide-chat';
import { LanguagePicker } from '@/components/language-picker';
import { EMPTY_MEMORY_CHAT, MemoryChat, type MemoryChatData, type MemoryChatHandle } from '@/components/memory-chat';
import { ModeSheet } from '@/components/mode-sheet';
import { EMPTY_PLACES_CHAT, PlacesChat, type PlacesChatData, type PlacesChatHandle } from '@/components/places-chat';
import { SpeakButton } from '@/components/speak-button';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { askAgent, entriesForTurn, type LogEntry, type Speaker } from '@/lib/agent';
import { readAudioBase64 } from '@/lib/audio-file';
import { useLanguagePreference } from '@/lib/auth';
import { chatTitle, loadChat, newChatId, openChat, useChatAutosave, type ChatSummary, type OpenChat } from '@/lib/chats';
import { EMPTY_GUIDE, legacyGuideState, type GuideState } from '@/lib/guide';
import { tx, useT } from '@/lib/i18n';

// Formats the AI accepts directly: WAV on iOS, raw AAC on Android, WebM in the browser.
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

/** An interpreter chat as it is saved (see lib/chats). */
type InterpretData = {
  log: LogEntry[];
  goal: string;
  status: 'in_progress' | 'done';
  nextSpeaker: Speaker;
  /** What Hao did each turn, keyed by the index of the turn's first reply entry. */
  tools: Record<number, ToolUse[]>;
};
const EMPTY_INTERPRET: InterpretData = { log: [], goal: '', status: 'in_progress', nextSpeaker: 'traveller', tools: {} };

const freshChat = <T,>(data: T): OpenChat<T> => ({ id: newChatId(), title: '', data });

/** The Guide chat open last time, or the one saved before chats had a history. */
function openGuideChat(): OpenChat<GuideState> {
  const chat = openChat('guide', EMPTY_GUIDE);
  if (chat.data.messages.length || chat.data.tasks.length) return chat;
  const legacy = legacyGuideState();
  return legacy ? { ...chat, data: legacy } : chat;
}

export default function AgentScreen() {
  const t = useT();
  const [lang, setLang] = useLanguagePreference();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Places: food and places picked for you (the default). Interpret: Hao talks to a local for you.
  // Guide: Hao coaches you through tasks (WeChat, payments, transport…).
  // Other screens can open a mode directly, e.g. Home's Translate button: /translate?mode=interpret.
  // Discover opens the chat with a message ready to send: /translate?mode=guide&ask=…&story=<id>&at=<time>.
  const { mode: requestedMode, ask, story: storyId, at } = useLocalSearchParams<{ mode?: string; ask?: string; story?: string; at?: string }>();
  const modeFrom = (value: string | undefined): ChatMode | null => (value && value in ChatModes ? (value as ChatMode) : null);
  const [mode, setMode] = useState<ChatMode>(modeFrom(requestedMode) ?? 'places');
  const [appliedMode, setAppliedMode] = useState(requestedMode);
  if (requestedMode !== appliedMode) {
    setAppliedMode(requestedMode);
    const next = modeFrom(requestedMode);
    if (next) setMode(next);
  }
  const [historyOpen, setHistoryOpen] = useState(false);
  // The open chat in each mode; Guide and Memory remount (key) when another chat is opened.
  const [interpretChat, setInterpretChat] = useState(() => openChat('interpret', EMPTY_INTERPRET));
  const [guideChat, setGuideChat] = useState(openGuideChat);
  const [memoryChat, setMemoryChat] = useState(() => openChat<MemoryChatData>('memory', EMPTY_MEMORY_CHAT));
  const [placesChat, setPlacesChat] = useState(() => openChat<PlacesChatData>('places', EMPTY_PLACES_CHAT));
  const [log, setLog] = useState<LogEntry[]>(interpretChat.data.log);
  const [goal, setGoal] = useState(interpretChat.data.goal);
  const [status, setStatus] = useState<'in_progress' | 'done'>(interpretChat.data.status);
  const [nextSpeaker, setNextSpeaker] = useState<Speaker>(interpretChat.data.nextSpeaker);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [guideBusy, setGuideBusy] = useState(false);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [placesBusy, setPlacesBusy] = useState(false);
  const [recordingFor, setRecordingFor] = useState<Speaker | null>(null);
  // Lets the user flip who the mic is for on the current turn (e.g. the local spoke out of turn).
  const [speakerOverride, setSpeakerOverride] = useState<{ turn: number; speaker: Speaker } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ speaker: Speaker; input: Input } | null>(null);
  // Entries from this index on arrived with the latest turn, so Hao's reply types itself out.
  const [freshFrom, setFreshFrom] = useState(Infinity);
  const [turnTools, setTurnTools] = useState<Record<number, ToolUse[]>>(interpretChat.data.tools);

  const firstSaid = log.find((e) => e.kind === 'traveller')?.text;
  const savedInterpret = useMemo(
    () => ({ id: interpretChat.id, title: chatTitle(firstSaid), data: { log, goal, status, nextSpeaker, tools: turnTools } }),
    [interpretChat.id, firstSaid, log, goal, status, nextSpeaker, turnTools]
  );
  useChatAutosave('interpret', savedInterpret, log.length > 0);

  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 100);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const guideRef = useRef<GuideChatHandle>(null);
  const memoryRef = useRef<MemoryChatHandle>(null);
  const placesRef = useRef<PlacesChatHandle>(null);

  // The single mic listens to whoever's turn it is: after Hao speaks Chinese, it's the local's turn.
  const defaultSpeaker: Speaker = log.length ? nextSpeaker : 'traveller';
  const micSpeaker = speakerOverride?.turn === log.length ? speakerOverride.speaker : defaultSpeaker;

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [log, busy]);

  // Send the prepared message once per request, after the requested mode's chat has mounted.
  const askedAt = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!ask || !at || askedAt.current === at) return;
    const timer = setTimeout(() => {
      askedAt.current = at;
      if (mode === 'places') placesRef.current?.send(ask);
      else if (mode === 'guide') guideRef.current?.send(ask, { storyId: storyId || undefined });
    }, 50);
    return () => clearTimeout(timer);
  }, [ask, at, storyId, mode]);

  const run = async (speaker: Speaker, input: Input) => {
    setBusy(true);
    setError(null);
    setFailed(null);
    try {
      const turn = await askAgent({ speaker, travellerLanguage: lang.name, log, ...input });
      setFreshFrom(log.length);
      if (turn.tools?.length) setTurnTools((prev) => ({ ...prev, [log.length + 1]: turn.tools! }));
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
    if (mode === 'places') placesRef.current?.send(text);
    else if (mode === 'guide') guideRef.current?.send(text);
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

  const showInterpretChat = (chat: OpenChat<InterpretData>) => {
    Speech.stop();
    setInterpretChat(chat);
    setLog(chat.data.log);
    setGoal(chat.data.goal);
    setStatus(chat.data.status);
    setNextSpeaker(chat.data.nextSpeaker);
    setTurnTools(chat.data.tools ?? {});
    setFreshFrom(Infinity);
    setSpeakerOverride(null);
    setError(null);
    setFailed(null);
  };

  const newChat = () => {
    setDraft('');
    if (mode === 'places') setPlacesChat(freshChat(EMPTY_PLACES_CHAT));
    else if (mode === 'interpret') showInterpretChat(freshChat(EMPTY_INTERPRET));
    // A new Guide chat keeps the checklists in progress.
    else if (mode === 'guide') {
      const { tasks, activeTaskId } = openChat('guide', EMPTY_GUIDE).data;
      setGuideChat(freshChat({ ...EMPTY_GUIDE, tasks, activeTaskId }));
    }
    else setMemoryChat(freshChat(EMPTY_MEMORY_CHAT));
  };

  const openFromHistory = async (summary: ChatSummary) => {
    try {
      const found = await loadChat<unknown>(summary.id);
      if (!found) return;
      setMode(found.mode);
      if (found.mode === 'interpret') {
        const chat = found.chat as OpenChat<InterpretData>;
        showInterpretChat({ ...chat, data: { ...EMPTY_INTERPRET, ...chat.data } });
      } else if (found.mode === 'places') {
        const chat = found.chat as OpenChat<PlacesChatData>;
        setPlacesChat({ ...chat, data: { ...EMPTY_PLACES_CHAT, ...chat.data } });
      } else if (found.mode === 'guide') {
        const chat = found.chat as OpenChat<GuideState>;
        setGuideChat({ ...chat, data: { ...EMPTY_GUIDE, ...chat.data } });
      } else {
        const chat = found.chat as OpenChat<MemoryChatData>;
        setMemoryChat({ ...chat, data: { ...EMPTY_MEMORY_CHAT, ...chat.data } });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong'));
    }
  };

  const onChatDeleted = (summary: ChatSummary) => {
    if (summary.id === interpretChat.id) showInterpretChat(freshChat(EMPTY_INTERPRET));
    if (summary.id === guideChat.id) setGuideChat(freshChat(EMPTY_GUIDE));
    if (summary.id === memoryChat.id) setMemoryChat(freshChat(EMPTY_MEMORY_CHAT));
    if (summary.id === placesChat.id) setPlacesChat(freshChat(EMPTY_PLACES_CHAT));
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
              <Text style={styles.brandMode}>{{ places: t('Places for you'), interpret: t('Interpreter'), guide: t('China guide'), memory: t('Your memory') }[mode]}</Text>
            </View>
          </View>

          {/* Language, QR rooms, chat history and new chat share one pill. */}
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
            <View style={styles.pillDivider} />
            <Pressable onPress={() => setHistoryOpen(true)} style={styles.pillItem} accessibilityLabel={t('Chats')}>
              <Ionicons name="time-outline" size={18} color={Colors.ink} />
            </Pressable>
            <View style={styles.pillDivider} />
            <Pressable onPress={newChat} style={styles.pillItem} accessibilityLabel={t('New chat')}>
              <Ionicons name="create-outline" size={18} color={Colors.ink} />
            </Pressable>
          </View>
        </View>

        {mode === 'places' ? (
          <PlacesChat key={placesChat.id} ref={placesRef} chat={placesChat} language={lang} onBusyChange={setPlacesBusy} />
        ) : mode === 'memory' ? (
          <MemoryChat key={memoryChat.id} ref={memoryRef} chat={memoryChat} language={lang} onBusyChange={setMemoryBusy} />
        ) : mode === 'guide' ? (
          <GuideChat
            key={guideChat.id}
            ref={guideRef}
            chat={guideChat}
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
                <ChatWelcome
                  title={t('What should I say for you?')}
                  body={t('Tell me in your own words. I’ll speak Chinese to the person, listen to their answer and tell you what to do.')}>
                  {SUGGESTIONS.map((s) => (
                    <Suggestion key={s.text} icon={s.icon} text={t(s.text)} onPress={() => run('traveller', { text: t(s.text) })} />
                  ))}
                </ChatWelcome>
              ) : null}

              {log.map((entry, i) => (
                <FeedItem key={i} entry={entry} speech={lang.speech} fresh={i >= freshFrom} tools={turnTools[i]} />
              ))}

              {busy ? <Thinking /> : null}
              {error ? <ChatError message={error} onRetry={failed ? () => run(failed.speaker, failed.input) : undefined} /> : null}
            </ScrollView>

            {log.length > 0 && !recordingFor ? (
              <Pressable
                onPress={() => setSpeakerOverride({ turn: log.length, speaker: micSpeaker === 'local' ? 'traveller' : 'local' })}
                style={styles.turn}
                accessibilityRole="button"
                accessibilityLabel={localTurn ? t('Microphone is for the local person. Tap to switch') : t('Microphone is for you. Tap to switch')}>
                <View style={[styles.turnDot, { backgroundColor: localTurn ? Colors.jade : ChatColors.text }]} />
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
          onOpenDiscover={() => router.navigate('/discover')}
          busy={{ places: placesBusy, interpret: busy, guide: guideBusy, memory: memoryBusy }[mode]}
          voice={
            mode === 'interpret'
              ? {
                  recording: !!recordingFor,
                  speakerLabel: recordingFor === 'local' ? `正在听对方 · ${t('Listening to them')}` : t('Listening to you'),
                  accent: (recordingFor ?? micSpeaker) === 'local' ? Colors.jade : ChatColors.text,
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
      <ChatHistory
        visible={historyOpen}
        openIds={[placesChat.id, interpretChat.id, guideChat.id, memoryChat.id]}
        onOpen={openFromHistory}
        onNewChat={newChat}
        onDeleted={onChatDeleted}
        onClose={() => setHistoryOpen(false)}
      />
      <LanguagePicker visible={pickerOpen} selected={lang} onSelect={setLang} onClose={() => setPickerOpen(false)} />
    </SafeAreaView>
  );
}

function FeedItem({ entry, speech, fresh, tools }: { entry: LogEntry; speech: string; fresh: boolean; tools?: ToolUse[] }) {
  const t = useT();
  switch (entry.kind) {
    case 'traveller':
      return <UserMessage text={entry.text} />;
    case 'local':
      return (
        <Animated.View entering={FadeIn.duration(180)} style={styles.local}>
          <Text style={styles.localLabel}>{t('They said')} · 对方</Text>
          <Text style={styles.localZh} selectable>
            {entry.text}
          </Text>
          {entry.translation ? <Text style={styles.localTranslation}>{entry.translation}</Text> : null}
        </Animated.View>
      );
    case 'to_local':
      // Big and clear: the traveller may turn the phone around to show it.
      return (
        <View style={{ gap: 8 }}>
        {tools?.length ? <ToolUses tools={tools} /> : null}
        <Animated.View entering={FadeIn.duration(180)} style={styles.toLocal}>
          <View style={styles.toLocalHeader}>
            <Text style={styles.toLocalLabel}>{t('Hao says to them')} · 对方请看</Text>
            <SpeakButton text={entry.zh} tint={ChatColors.text} background={ChatColors.userBubble} />
          </View>
          <Text style={styles.toLocalZh} selectable>
            {entry.zh}
          </Text>
          {entry.pinyin ? <Text style={styles.toLocalPinyin}>{entry.pinyin}</Text> : null}
          {entry.gloss ? <Text style={styles.toLocalGloss}>{entry.gloss}</Text> : null}
        </Animated.View>
        </View>
      );
    case 'to_traveller':
      return (
        <AssistantMessage text={entry.text} animate={fresh} speech={speech} tools={tools}>
          {entry.points.length > 0 ? (
            <View style={styles.points}>
              {entry.points.map((p, i) => (
                <View key={i} style={styles.point}>
                  <Text style={styles.pointNum}>{i + 1}.</Text>
                  <Text style={styles.pointText}>{p}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </AssistantMessage>
      );
  }
}

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: ChatColors.background },
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
  statusText: { fontSize: 11, fontWeight: '800', color: Colors.goldText },
  feed: { paddingHorizontal: 20, paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: 22, flexGrow: 1 },
  local: { alignSelf: 'flex-start', maxWidth: '88%', borderLeftWidth: 3, borderLeftColor: ChatColors.border, paddingLeft: 12, paddingVertical: 2 },
  localLabel: { fontSize: 12, fontWeight: '600', color: ChatColors.soft },
  localZh: { fontSize: 18, lineHeight: 26, fontWeight: '600', color: ChatColors.text, marginTop: 4 },
  localTranslation: { fontSize: 15, lineHeight: 22, color: ChatColors.soft, marginTop: 2 },
  toLocal: { borderRadius: 18, borderWidth: 1, borderColor: ChatColors.border, backgroundColor: ChatColors.surface, padding: Spacing.md },
  toLocalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toLocalLabel: { fontSize: 12, fontWeight: '600', color: ChatColors.soft },
  toLocalZh: { fontSize: 26, lineHeight: 36, fontWeight: '700', color: ChatColors.text, marginTop: Spacing.sm },
  toLocalPinyin: { fontSize: 14, color: ChatColors.soft, marginTop: 4 },
  toLocalGloss: { fontSize: 14, lineHeight: 20, color: ChatColors.soft, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: ChatColors.border },
  points: { gap: 8 },
  point: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  pointNum: { minWidth: 18, fontSize: 16, lineHeight: 25, fontWeight: '600', color: ChatColors.text },
  pointText: { flex: 1, fontSize: 16, lineHeight: 25, color: ChatColors.text },
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
}));
