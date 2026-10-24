// Chat building blocks in the style of Claude and ChatGPT: the user's messages in a soft bubble on
// the right, Hao's replies as plain full-width text with a quiet action row, a gentle "thinking"
// indicator and suggestion chips. Shared by the interpreter, guide and memory chats.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { ToolUse } from '@shared/ai/types';

import { SpeakButton } from '@/components/speak-button';
import { Colors, Spacing, themed, themedPalette } from '@/constants/theme';
import { useT } from '@/lib/i18n';

// WhatsApp-style chat: your messages on the right, Hao's on the left, on a wallpaper. Light and dark like
// WhatsApp's own themes; values follow the active theme (see constants/theme).
export const ChatColors = themedPalette(
  {
    /** The chat wallpaper behind the bubbles. */
    background: '#EFEAE2',
    userBubble: '#D9FDD3',
    haoBubble: '#FFFFFF',
    text: '#111B21',
    soft: '#667781',
    faint: '#8696A0',
    border: '#E2DDD5',
    surface: '#FFFFFF',
    /** Send buttons and strong actions. */
    accent: '#00A884',
  },
  {
    background: '#0B141A',
    userBubble: '#005C4B',
    haoBubble: '#1F2C34',
    text: '#E9EDEF',
    soft: '#8696A0',
    faint: '#667781',
    border: '#2A3942',
    surface: '#1F2C34',
    accent: '#00A884',
  }
);

export function UserMessage({ text }: { text: string }) {
  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.userBubble}>
      <Text style={styles.userText} selectable>
        {text}
      </Text>
    </Animated.View>
  );
}

/** Hao's reply: a bubble on the left (like WhatsApp), with extra content (cards, chips) full width under it. */
export function AssistantMessage({
  text,
  animate,
  speech,
  tools,
  children,
}: {
  text: string;
  /** What Hao did for this reply, shown collapsed above it. */
  tools?: ToolUse[];
  /** Reveal the text word by word, like a streamed reply (only for a reply that just arrived). */
  animate?: boolean;
  /** BCP 47 voice for the speak button; omit to hide it. */
  speech?: string;
  children?: ReactNode;
}) {
  const shown = useTypewriter(text, !!animate);
  const done = shown.length === text.length;
  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.assistant}>
      {tools?.length ? <ToolUses tools={tools} /> : null}
      {text ? (
        <View style={styles.haoBubble}>
          <Text style={styles.assistantText} selectable>
            {shown}
          </Text>
          {done && speech ? (
            <View style={styles.actions}>
              <SpeakButton text={text} language={speech} size={15} tint={ChatColors.soft} background="transparent" />
            </View>
          ) : null}
        </View>
      ) : null}
      {done ? children : null}
    </Animated.View>
  );
}

/** The small 好 mark that sits above Hao's replies, as Claude's spark does. */
export function HaoMark({ pulse }: { pulse?: boolean }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!pulse) return;
    scale.value = withRepeat(
      withSequence(withTiming(0.82, { duration: 600, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) })),
      -1
    );
    return () => cancelAnimation(scale);
  }, [pulse, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { rotate: pulse ? `${(1 - scale.value) * 90}deg` : '0deg' }] }));
  return (
    <Animated.View style={[styles.mark, style]}>
      <Text style={styles.markText}>好</Text>
    </Animated.View>
  );
}

/** Shown while Hao works on a reply: the pulsing mark and a shimmering label. */
export function Thinking({ label }: { label?: string }) {
  const t = useT();
  const opacity = useSharedValue(0.45);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.thinking} accessibilityLiveRegion="polite">
      <HaoMark pulse />
      <Animated.Text style={[styles.thinkingText, style]}>{label ?? t('Thinking…')}</Animated.Text>
    </Animated.View>
  );
}

export function ChatError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <View style={styles.error}>
      <Ionicons name="alert-circle-outline" size={18} color={Colors.redDark} />
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} hitSlop={8} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
          <Ionicons name="refresh" size={14} color={ChatColors.text} />
          <Text style={styles.retryText}>{t('Retry')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Centered greeting for an empty chat, with suggestions under it. */
export function ChatWelcome({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <View style={styles.welcome}>
      <HaoMark />
      <Text style={styles.welcomeTitle}>{title}</Text>
      {body ? <Text style={styles.welcomeBody}>{body}</Text> : null}
      {children ? <View style={styles.welcomeExtra}>{children}</View> : null}
    </View>
  );
}

/** A tappable suggestion, as in ChatGPT's empty state. */
export function Suggestion({ text, icon, emoji, onPress }: { text: string; icon?: keyof typeof Ionicons.glyphMap; emoji?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.suggestion, pressed && styles.suggestionPressed]} accessibilityRole="button">
      {emoji ? <Text style={styles.suggestionEmoji}>{emoji}</Text> : icon ? <Ionicons name={icon} size={16} color={ChatColors.soft} /> : null}
      <Text style={styles.suggestionText} numberOfLines={2}>
        {text}
      </Text>
    </Pressable>
  );
}

const TOOL_ICONS: Record<ToolUse['tool'], keyof typeof Ionicons.glyphMap> = {
  knowledge: 'book-outline',
  recall: 'search-outline',
  remember: 'bookmark-outline',
  listen: 'ear-outline',
  speak: 'volume-medium-outline',
  checklist: 'checkbox-outline',
  search_places: 'location-outline',
  log_visit: 'footsteps-outline',
  my_places: 'albums-outline',
  save_place: 'bookmark-outline',
  story: 'play-circle-outline',
  dna: 'finger-print-outline',
  community_picks: 'people-outline',
};

function toolLine(t: ReturnType<typeof useT>, tool: ToolUse): { title: string; details: string[] } {
  switch (tool.tool) {
    case 'knowledge':
      return { title: t('Read the Hao guide'), details: tool.items };
    case 'recall':
      return { title: tool.count === 1 ? t('Searched your memory · 1 memory') : t('Searched your memory · {count} memories', { count: tool.count }), details: [] };
    case 'remember':
      return { title: t('Saved to memory'), details: tool.items };
    case 'listen':
      return { title: t('Listened and transcribed'), details: [tool.text] };
    case 'speak':
      return { title: t('Spoke Chinese to them'), details: [tool.text] };
    case 'checklist':
      return { title: tool.created ? t('Made a checklist') : t('Updated the checklist'), details: [tool.title] };
    case 'search_places':
      return {
        title: t('Searched places · {count} found', { count: tool.count }),
        details: [tool.query, ...(tool.community ? [t('Ranked by what people from your country liked')] : [])],
      };
    case 'log_visit':
      return { title: t('Logged a visit'), details: [tool.place] };
    case 'my_places':
      return { title: t('Opened your places · {count}', { count: tool.count }), details: [] };
    case 'save_place':
      return { title: t('Saved to Want to go'), details: [tool.place] };
    case 'story':
      return { title: t('Read the Discover story'), details: [tool.title] };
    case 'dna':
      return { title: t('Saved to your Hao DNA'), details: tool.items };
    case 'community_picks':
      return { title: t('Places people from your country liked · {count}', { count: tool.count }), details: [] };
  }
}

/** Claude-style "used tools" row: one summary line that opens into the steps Hao took. */
export function ToolUses({ tools }: { tools: ToolUse[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const lines = tools.map((tool) => ({ tool, ...toolLine(t, tool) }));
  const summary = lines.length === 1 ? lines[0].title : t('Used {count} tools', { count: lines.length });
  return (
    <View style={styles.tools}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.toolsHeader, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}>
        <Ionicons name={lines.length === 1 ? TOOL_ICONS[lines[0].tool.tool] : 'construct-outline'} size={14} color={ChatColors.soft} />
        <Text style={styles.toolsSummary} numberOfLines={1}>
          {summary}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={ChatColors.faint} />
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn.duration(150)} style={styles.toolsList}>
          {lines.map((line, i) => (
            <View key={i} style={styles.toolRow}>
              <View style={styles.toolIcon}>
                <Ionicons name={TOOL_ICONS[line.tool.tool]} size={13} color={ChatColors.soft} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.toolTitle}>{line.title}</Text>
                {line.details.map((d, j) => (
                  <Text key={j} style={styles.toolDetail} numberOfLines={3}>
                    {d}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Follow-up replies under the latest answer. */
export function QuickReplies({ replies, onPress }: { replies: string[]; onPress: (text: string) => void }) {
  return (
    <View style={styles.quick}>
      {replies.map((q) => (
        <Pressable key={q} onPress={() => onPress(q)} style={({ pressed }) => [styles.quickChip, pressed && styles.suggestionPressed]}>
          <Text style={styles.quickText}>{q}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Reveals `text` a few words at a time (about a second and a half for a long reply). */
function useTypewriter(text: string, animate: boolean) {
  const [progress, setProgress] = useState({ text, count: animate ? 0 : text.length });
  useEffect(() => {
    if (!animate) return;
    const step = Math.max(3, Math.ceil(text.length / 60));
    const id = setInterval(() => {
      setProgress((p) => {
        const count = p.text === text ? p.count : 0;
        if (count >= text.length) {
          clearInterval(id);
          return p;
        }
        // Stop at the next space so words appear whole.
        const next = text.indexOf(' ', count + step);
        return { text, count: next === -1 ? text.length : next };
      });
    }, 24);
    return () => clearInterval(id);
  }, [text, animate]);
  if (!animate) return text;
  return progress.text === text ? text.slice(0, progress.count) : '';
}

const styles = themed(() => StyleSheet.create({
  pressed: { opacity: 0.7 },
  // The squared corner at the top points the bubble at its sender, like WhatsApp's tail.
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    backgroundColor: ChatColors.userBubble,
    borderRadius: 12,
    borderTopRightRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  userText: { fontSize: 16, lineHeight: 22, color: ChatColors.text },
  assistant: { alignSelf: 'stretch', gap: 8 },
  haoBubble: {
    alignSelf: 'flex-start',
    maxWidth: '88%',
    backgroundColor: ChatColors.haoBubble,
    borderRadius: 12,
    borderTopLeftRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  assistantText: { fontSize: 16, lineHeight: 23, color: ChatColors.text },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginRight: -6, marginBottom: -4 },
  mark: { width: 24, height: 24, borderRadius: 7, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center' },
  markText: { color: Colors.gold, fontWeight: '900', fontSize: 13 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  thinkingText: { fontSize: 15, fontWeight: '500', color: ChatColors.soft },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.errorBorder,
    backgroundColor: Colors.errorBg,
  },
  errorText: { flex: 1, fontSize: 14, lineHeight: 20, color: Colors.redText },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ChatColors.border,
    backgroundColor: ChatColors.surface,
  },
  retryText: { fontSize: 13, fontWeight: '600', color: ChatColors.text },
  welcome: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: Spacing.xl, gap: 10 },
  welcomeTitle: { fontSize: 26, lineHeight: 32, fontWeight: '600', color: ChatColors.text, textAlign: 'center', letterSpacing: -0.4, marginTop: 6 },
  welcomeBody: { fontSize: 15, lineHeight: 22, color: ChatColors.soft, textAlign: 'center', maxWidth: 340 },
  welcomeExtra: { alignSelf: 'stretch', marginTop: Spacing.lg, gap: Spacing.sm },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ChatColors.border,
    backgroundColor: ChatColors.surface,
  },
  suggestionPressed: { backgroundColor: ChatColors.userBubble },
  suggestionEmoji: { fontSize: 16 },
  suggestionText: { flex: 1, fontSize: 14, lineHeight: 19, color: ChatColors.text },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  tools: { alignSelf: 'flex-start', maxWidth: '100%' },
  toolsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  toolsSummary: { fontSize: 14, color: ChatColors.soft, flexShrink: 1 },
  toolsList: { marginTop: 4, marginLeft: 6, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: ChatColors.border, gap: 10, paddingVertical: 2 },
  toolRow: { flexDirection: 'row', gap: 8 },
  toolIcon: { width: 22, height: 22, borderRadius: 6, backgroundColor: ChatColors.userBubble, alignItems: 'center', justifyContent: 'center' },
  toolTitle: { fontSize: 13, fontWeight: '600', color: ChatColors.text, lineHeight: 22 },
  toolDetail: { fontSize: 13, lineHeight: 18, color: ChatColors.soft },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ChatColors.border,
    backgroundColor: ChatColors.surface,
  },
  quickText: { fontSize: 14, color: ChatColors.text },
}));
