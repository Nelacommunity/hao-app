import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { GuideApps, GuideTopics, type GuideApp } from '@shared/ai/china-guide';
import { parsePreferences } from '@shared/ai/preferences';
import type { GuideTask } from '@shared/ai/types';

import { SpeakButton } from '@/components/speak-button';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { Cities } from '@/data/places';
import { useAuth } from '@/lib/auth';
import { applyGuideTurn, askGuide, useGuideState, type GuideChatMessage } from '@/lib/guide';
import type { Language } from '@/lib/languages';
import { distanceKm, useCurrentLocation } from '@/lib/location';
import { useT } from '@/lib/i18n';

const BLUE = '#2576FF';

type Props = { language: Language; onHandoff: (goal: string) => void; onBusyChange: (busy: boolean) => void };

/** The screen's shared composer drives the guide through this handle. */
export type GuideChatHandle = { send: (text: string) => void; showTopics: () => void };

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

export const GuideChat = forwardRef<GuideChatHandle, Props>(function GuideChat({ language, onHandoff, onBusyChange }, ref) {
  const t = useT();
  const { profile } = useAuth();
  const location = useCurrentLocation();
  const { state, setState, toggleStep, setActiveTask, removeTask } = useGuideState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedText, setFailedText] = useState<string | null>(null);
  // Compact by default so the chat stays visible; opens when Hao proposes a new plan.
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [showTopics, setShowTopics] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const here = location.coords;
  const nearest = here ? [...Cities].sort((a, b) => distanceKm(here, a) - distanceKm(here, b))[0] : null;
  const city = nearest && here && distanceKm(here, nearest) < 150 ? nearest.name : null;
  const activeTask = state.tasks.find((task) => task.id === state.activeTaskId) ?? null;

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [state.messages.length, busy]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
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
      });
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
          <View style={styles.intro}>
            {empty ? (
              <>
                <Text style={styles.introTitle}>{t('Everything for life in China')}</Text>
                <Text style={styles.introBody}>{t('Pick a topic or ask anything. I’ll make a step-by-step checklist and keep track as you go.')}</Text>
              </>
            ) : null}
            <View style={styles.topics}>
              {GuideTopics.map((topic) => (
                <Pressable
                  key={topic.id}
                  onPress={() => send(t(topic.starter))}
                  style={({ pressed }) => [styles.topic, pressed && styles.pressed]}
                  accessibilityRole="button">
                  <Text style={styles.topicEmoji}>{topic.emoji}</Text>
                  <Text style={styles.topicTitle}>{t(topic.title)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {state.messages.map((m, i) => (
          <Animated.View key={i} entering={FadeInUp.duration(220)}>
            <MessageView message={m} latest={m === lastHao} language={language} onHandoff={onHandoff} onQuickReply={send} />
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
            {failedText ? (
              <Pressable onPress={() => send(failedText)} hitSlop={8}>
                <Text style={styles.retry}>{t('Retry')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
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
  language,
  onHandoff,
  onQuickReply,
}: {
  message: GuideChatMessage;
  latest: boolean;
  language: Language;
  onHandoff: (goal: string) => void;
  onQuickReply: (text: string) => void;
}) {
  const t = useT();
  if (message.role === 'user') {
    return (
      <View style={[styles.bubble, styles.userBubble]}>
        <Text style={styles.userText}>{message.text}</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: Spacing.sm }}>
      <View style={[styles.bubble, styles.haoBubble]}>
        <View style={styles.haoHeader}>
          <View style={styles.haoBadge}>
            <Text style={styles.haoBadgeText}>好</Text>
          </View>
          <SpeakButton text={message.text} language={language.speech} size={14} tint={Colors.inkSoft} background={Colors.paper} />
        </View>
        <Text style={styles.haoText}>{message.text}</Text>
      </View>

      {message.phrase ? (
        <View style={styles.phrase}>
          <View style={styles.phraseHeader}>
            <Text style={styles.phraseLabel}>{t('Show or say to staff')}</Text>
            <SpeakButton text={message.phrase.zh} tint="#fff" background={Colors.red} />
          </View>
          <Text style={styles.phraseZh}>{message.phrase.zh}</Text>
          {message.phrase.pinyin ? <Text style={styles.phrasePinyin}>{message.phrase.pinyin}</Text> : null}
          {message.phrase.meaning ? <Text style={styles.phraseMeaning}>“{message.phrase.meaning}”</Text> : null}
        </View>
      ) : null}

      {message.apps?.length ? (
        <View style={styles.apps}>
          {message.apps.map((a) => (
            <Pressable key={a} onPress={() => openStore(a)} style={({ pressed }) => [styles.app, pressed && styles.pressed]}>
              <Ionicons name="download-outline" size={16} color={Colors.ink} />
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
          <Ionicons name="chatbubbles" size={18} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.handoffTitle}>{t('Let Hao talk to them')}</Text>
            <Text style={styles.handoffGoal} numberOfLines={2}>
              {message.handoffGoal}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </Pressable>
      ) : null}

      {latest && message.quickReplies?.length ? (
        <View style={styles.quick}>
          {message.quickReplies.map((q) => (
            <Pressable key={q} onPress={() => onQuickReply(q)} style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}>
              <Text style={styles.quickText}>{q}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  taskChipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
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
  feed: { padding: Spacing.md, gap: Spacing.md, flexGrow: 1 },
  intro: { gap: Spacing.sm },
  introTitle: { fontSize: 20, fontWeight: '800', color: Colors.ink },
  introBody: { fontSize: 14, lineHeight: 20, color: Colors.inkSoft, marginBottom: Spacing.sm },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  topic: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  topicEmoji: { fontSize: 20 },
  topicTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.ink },
  bubble: { maxWidth: '88%', padding: Spacing.md, borderRadius: Radius.lg },
  userBubble: { alignSelf: 'flex-end', backgroundColor: Colors.red, borderBottomRightRadius: 6 },
  userText: { color: '#fff', fontSize: 15, lineHeight: 21, fontWeight: '600' },
  haoBubble: { alignSelf: 'flex-start', backgroundColor: Colors.card, borderBottomLeftRadius: 6, ...Shadow },
  haoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  haoBadge: { width: 24, height: 24, borderRadius: 8, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center' },
  haoBadgeText: { color: Colors.gold, fontWeight: '900', fontSize: 13 },
  haoText: { fontSize: 15, lineHeight: 22, color: Colors.ink },
  phrase: { backgroundColor: Colors.ink, borderRadius: Radius.lg, padding: Spacing.md },
  phraseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  phraseLabel: { fontSize: 11, fontWeight: '800', color: Colors.gold, letterSpacing: 1, textTransform: 'uppercase' },
  phraseZh: { fontSize: 22, lineHeight: 30, fontWeight: '800', color: '#fff', marginTop: 6 },
  phrasePinyin: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  phraseMeaning: { fontSize: 13, color: Colors.muted, marginTop: 6, fontStyle: 'italic' },
  apps: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  app: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.goldSoft,
  },
  appText: { fontSize: 13, fontWeight: '700', color: Colors.ink },
  handoff: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, backgroundColor: BLUE },
  handoffTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  handoffGoal: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.red,
  },
  quickText: { fontSize: 13, fontWeight: '700', color: Colors.red },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, alignSelf: 'center' },
  thinkingText: { fontSize: 14, fontWeight: '600', color: Colors.inkSoft },
  error: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.redSoft },
  errorText: { flex: 1, fontSize: 14, color: Colors.redDark },
  retry: { fontSize: 14, fontWeight: '800', color: Colors.red },
});
