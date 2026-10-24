import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, View } from 'react-native';

import { GuideApps, GuideTopics, type GuideApp } from '@shared/ai/china-guide';
import { parsePreferences } from '@shared/ai/preferences';
import type { GuideTask } from '@shared/ai/types';

import { AssistantMessage, ChatColors, ChatError, ChatWelcome, QuickReplies, Suggestion, Thinking, UserMessage } from '@/components/chat-ui';
import { SpeakButton } from '@/components/speak-button';
import { StoryCard } from '@/components/story-card';
import { Colors, Radius, Shadow, Spacing, themed } from '@/constants/theme';
import { Cities } from '@/data/places';
import { useAuth } from '@/lib/auth';
import { chatTitle, useChatAutosave, type OpenChat } from '@/lib/chats';
import { applyGuideTurn, askGuide, useGuideState, type GuideChatMessage, type GuideState } from '@/lib/guide';
import { stripMarkdown } from '@/lib/guide-state';
import type { Language } from '@/lib/languages';
import { distanceKm, useCurrentLocation } from '@/lib/location';
import { useT } from '@/lib/i18n';

const BLUE = '#2576FF';

type Props = {
  /** The chat to show; give the component `key={chat.id}` so opening another chat starts fresh. */
  chat: OpenChat<GuideState>;
  language: Language;
  onHandoff: (goal: string) => void;
  onBusyChange: (busy: boolean) => void;
};

/** The screen's shared composer drives the guide through this handle. */
export type GuideChatHandle = { send: (text: string, options?: { storyId?: string }) => void; showTopics: () => void };

/** Opens the store search for an app (App Store on iOS; the phone's app store on Android). */
function openStore(app: GuideApp) {
  const term = encodeURIComponent(GuideApps[app].search);
  const native =
    Platform.OS === 'ios'
      ? `itms-apps://search.itunes.apple.com/WebObjects/MZSearch.woa/wa/search?media=software&term=${term}`
      : `market://search?q=${term}&c=apps`;
  const web = Platform.OS === 'ios' ? `https://apps.apple.com/search?term=${term}` : `https://play.google.com/store/search?q=${term}&c=apps`;
  Linking.openURL(Platform.OS === 'web' ? web : native).catch(() => Linking.openURL(web));
}

export const GuideChat = forwardRef<GuideChatHandle, Props>(function GuideChat({ chat, language, onHandoff, onBusyChange }, ref) {
  const t = useT();
  const { profile, refreshProfile } = useAuth();
  const location = useCurrentLocation();
  const { state, setState, toggleStep, setActiveTask, removeTask } = useGuideState(chat.data);
  const firstAsked = state.messages.find((m) => m.role === 'user')?.text;
  const saved = useMemo(() => ({ id: chat.id, title: chatTitle(firstAsked), data: state }), [chat.id, firstAsked, state]);
  useChatAutosave('guide', saved, state.messages.length > 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedText, setFailedText] = useState<string | null>(null);
  // Compact by default so the chat stays visible; opens when Hao proposes a new plan.
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [showTopics, setShowTopics] = useState(false);
  // The reply that just arrived, which types itself out.
  const [fresh, setFresh] = useState<string | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  // The Discover story this chat is about ("Ask Hao more"), sent with every later turn too.
  const [storyId, setStoryId] = useState<string | null>(null);

  const here = location.coords;
  const nearest = here ? [...Cities].sort((a, b) => distanceKm(here, a) - distanceKm(here, b))[0] : null;
  const city = nearest && here && distanceKm(here, nearest) < 150 ? nearest.name : null;
  const activeTask = state.tasks.find((task) => task.id === state.activeTaskId) ?? null;

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [state.messages.length, busy]);

  const send = async (raw: string, options?: { storyId?: string }) => {
    const text = raw.trim();
    if (!text || busy) return;
    const story = options?.storyId || storyId;
    if (options?.storyId) setStoryId(options.storyId);
    setShowTopics(false);
    setChecklistOpen(false);
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setFailedText(null);
    try {
      const turn = await askGuide({
        language: { code: language.code, name: language.name },
        preferences: parsePreferences(profile?.preferences),
        city,
        state,
        text,
        storyId: story,
      });
      if (turn.tools?.some((tool) => tool.tool === 'dna')) refreshProfile().catch(() => {});
      setFresh(stripMarkdown(turn.reply));
      setState((s) => applyGuideTurn(s, text, turn));
      if (turn.task_id) setChecklistOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong'));
      setFailedText(text);
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  useImperativeHandle(ref, () => ({ send, showTopics: () => setShowTopics(true) }));

  const lastHao = [...state.messages].reverse().find((m) => m.role === 'hao');
  const empty = state.messages.length === 0;

  return (
    <View style={{ flex: 1 }}>
      {state.tasks.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.taskStrip}>
          {state.tasks.map((task) => {
            const done = task.steps.filter((s) => s.status === 'done').length;
            const active = task.id === state.activeTaskId;
            return (
              <Pressable
                key={task.id}
                onPress={() => {
                  setActiveTask(task.id);
                  setChecklistOpen(true);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[styles.taskChip, active && styles.taskChipActive]}>
                <Text style={[styles.taskChipText, active && { color: '#fff' }]} numberOfLines={1}>
                  {task.title}
                </Text>
                <Text style={[styles.taskChipCount, active && { color: 'rgba(255,255,255,0.8)' }]}>
                  {done}/{task.steps.length}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {activeTask ? (
        <TaskCard
          task={activeTask}
          open={checklistOpen}
          onToggleOpen={() => setChecklistOpen((o) => !o)}
          onToggleStep={(i) => toggleStep(activeTask.id, i)}
          onRemove={() => removeTask(activeTask.id)}
        />
      ) : null}

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.feed} keyboardShouldPersistTaps="handled">
        {empty || showTopics ? (
          <ChatWelcome
            title={empty ? t('Everything for life in China') : t('Pick a topic')}
            body={empty ? t('Pick a topic or ask anything. I’ll make a step-by-step checklist and keep track as you go.') : undefined}>
            <View style={styles.topics}>
              {GuideTopics.map((topic) => (
                <View key={topic.id} style={styles.topic}>
                  <Suggestion emoji={topic.emoji} text={t(topic.title)} onPress={() => send(t(topic.starter))} />
                </View>
              ))}
            </View>
          </ChatWelcome>
        ) : null}

        {state.messages.map((m, i) => (
          <MessageView
            key={i}
            message={m}
            latest={m === lastHao}
            animate={m === lastHao && m.text === fresh}
            language={language}
            onHandoff={onHandoff}
            onQuickReply={(text) => send(text)}
          />
        ))}

        {busy ? <Thinking /> : null}
        {error ? <ChatError message={error} onRetry={failedText ? () => send(failedText) : undefined} /> : null}
      </ScrollView>

    </View>
  );
});

function TaskCard({
  task,
  open,
  onToggleOpen,
  onToggleStep,
  onRemove,
}: {
  task: GuideTask;
  open: boolean;
  onToggleOpen: () => void;
  onToggleStep: (index: number) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const done = task.steps.filter((s) => s.status === 'done').length;
  const complete = done === task.steps.length && task.steps.length > 0;
  const current = task.steps.find((s) => s.status === 'doing') ?? task.steps.find((s) => s.status !== 'done');
  return (
    <View style={styles.taskCard}>
      <Pressable onPress={onToggleOpen} style={styles.taskHeader} accessibilityRole="button" accessibilityLabel={t('{title}, {done} of {total} done', { title: task.title, done, total: task.steps.length })}>
        <View style={{ flex: 1 }}>
          <Text style={styles.taskTitle} numberOfLines={1}>
            {complete ? '🎉 ' : ''}
            {task.title}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${task.steps.length ? (done / task.steps.length) * 100 : 0}%` }]} />
          </View>
          {!open && current ? (
            <Text style={styles.currentStep} numberOfLines={1}>{t('Now:')}{' '}<Text style={{ fontWeight: '800', color: Colors.ink }}>{current.title}</Text>
            </Text>
          ) : null}
          {!open && complete ? <Text style={styles.currentStep}>{t('All steps done')}</Text> : null}
        </View>
        <Text style={styles.taskCount}>
          {done}/{task.steps.length}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.inkSoft} />
      </Pressable>
      {open ? (
        <ScrollView style={styles.stepsScroll} contentContainerStyle={styles.steps} nestedScrollEnabled>
          {task.steps.map((step, i) => (
            <Pressable
              key={i}
              onPress={() => onToggleStep(i)}
              style={styles.step}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: step.status === 'done' }}>
              <View
                style={[
                  styles.check,
                  step.status === 'done' && styles.checkDone,
                  step.status === 'doing' && styles.checkDoing,
                ]}>
                {step.status === 'done' ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stepTitle, step.status === 'done' && styles.stepTitleDone]}>{step.title}</Text>
                {step.status !== 'done' && step.detail ? <Text style={styles.stepDetail}>{step.detail}</Text> : null}
              </View>
            </Pressable>
          ))}
          <Pressable onPress={onRemove} hitSlop={8} style={styles.removeTask}>
            <Text style={styles.removeTaskText}>{t('Remove this task')}</Text>
          </Pressable>
        </ScrollView>
      ) : null}
    </View>
  );
}

function MessageView({
  message,
  latest,
  animate,
  language,
  onHandoff,
  onQuickReply,
}: {
  message: GuideChatMessage;
  latest: boolean;
  animate: boolean;
  language: Language;
  onHandoff: (goal: string) => void;
  onQuickReply: (text: string) => void;
}) {
  const t = useT();
  if (message.role === 'user') return <UserMessage text={message.text} />;
  return (
    <AssistantMessage text={message.text} animate={animate} speech={language.speech} tools={message.tools}>
      {message.story ? <StoryCard story={message.story} /> : null}
      {message.phrase ? (
        <View style={styles.phrase}>
          <View style={styles.phraseHeader}>
            <Text style={styles.phraseLabel}>{t('Show or say to staff')}</Text>
            <SpeakButton text={message.phrase.zh} tint={ChatColors.text} background={ChatColors.userBubble} />
          </View>
          <Text style={styles.phraseZh} selectable>
            {message.phrase.zh}
          </Text>
          {message.phrase.pinyin ? <Text style={styles.phrasePinyin}>{message.phrase.pinyin}</Text> : null}
          {message.phrase.meaning ? <Text style={styles.phraseMeaning}>{message.phrase.meaning}</Text> : null}
        </View>
      ) : null}

      {message.apps?.length ? (
        <View style={styles.apps}>
          {message.apps.map((a) => (
            <Pressable key={a} onPress={() => openStore(a)} style={({ pressed }) => [styles.app, pressed && styles.pressed]}>
              <Ionicons name="download-outline" size={15} color={ChatColors.text} />
              <Text style={styles.appText}>{t('Get {name}', { name: GuideApps[a].name })}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {latest && message.handoffGoal ? (
        <Pressable
          onPress={() => onHandoff(message.handoffGoal!)}
          style={({ pressed }) => [styles.handoff, pressed && styles.pressed]}
          accessibilityRole="button">
          <View style={styles.handoffIcon}>
            <Ionicons name="chatbubbles-outline" size={18} color={ChatColors.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.handoffTitle}>{t('Let Hao talk to them')}</Text>
            <Text style={styles.handoffGoal} numberOfLines={2}>
              {message.handoffGoal}
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={18} color={ChatColors.soft} />
        </Pressable>
      ) : null}

      {latest && message.quickReplies?.length ? <QuickReplies replies={message.quickReplies} onPress={onQuickReply} /> : null}
    </AssistantMessage>
  );
}

const styles = themed(() => StyleSheet.create({
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  taskStrip: { gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  taskChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 220,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  taskChipActive: { backgroundColor: Colors.strong, borderColor: Colors.strong },
  taskChipText: { fontSize: 13, fontWeight: '700', color: Colors.ink, flexShrink: 1 },
  taskChipCount: { fontSize: 12, fontWeight: '700', color: Colors.muted },
  taskCard: { marginHorizontal: Spacing.md, marginBottom: Spacing.sm, backgroundColor: Colors.card, borderRadius: Radius.lg, ...Shadow },
  taskHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  taskTitle: { fontSize: 15, fontWeight: '800', color: Colors.ink },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.line, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: Colors.jade },
  taskCount: { fontSize: 13, fontWeight: '800', color: Colors.jade },
  stepsScroll: { maxHeight: 280 },
  steps: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, gap: 2 },
  currentStep: { fontSize: 13, color: Colors.inkSoft, marginTop: 8 },
  step: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: 8 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkDone: { backgroundColor: Colors.jade, borderColor: Colors.jade },
  checkDoing: { borderColor: BLUE },
  stepTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  stepTitleDone: { color: Colors.muted, textDecorationLine: 'line-through' },
  stepDetail: { fontSize: 13, lineHeight: 18, color: Colors.inkSoft, marginTop: 1 },
  removeTask: { alignSelf: 'flex-end', paddingVertical: 6 },
  removeTaskText: { fontSize: 12, fontWeight: '600', color: Colors.muted },
  feed: { paddingHorizontal: 20, paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: 22, flexGrow: 1 },
  topics: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.sm },
  topic: { width: '48.8%' },
  phrase: { borderRadius: 16, borderWidth: 1, borderColor: ChatColors.border, backgroundColor: ChatColors.surface, padding: Spacing.md, marginTop: 4 },
  phraseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  phraseLabel: { fontSize: 12, fontWeight: '600', color: ChatColors.soft },
  phraseZh: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: ChatColors.text, marginTop: 6 },
  phrasePinyin: { fontSize: 14, color: ChatColors.soft, marginTop: 2 },
  phraseMeaning: { fontSize: 14, lineHeight: 20, color: ChatColors.soft, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: ChatColors.border },
  apps: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  app: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: ChatColors.border,
    backgroundColor: ChatColors.surface,
  },
  appText: { fontSize: 13, fontWeight: '500', color: ChatColors.text },
  handoff: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ChatColors.border,
    backgroundColor: ChatColors.surface,
  },
  handoffIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: ChatColors.userBubble, alignItems: 'center', justifyContent: 'center' },
  handoffTitle: { color: ChatColors.text, fontSize: 15, fontWeight: '600' },
  handoffGoal: { color: ChatColors.soft, fontSize: 13, lineHeight: 18, marginTop: 2 },
}));
