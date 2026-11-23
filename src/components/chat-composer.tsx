import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View, type HostInstance } from 'react-native';
import Animated, { cancelAnimation, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming, ZoomIn } from 'react-native-reanimated';

import { ChatColors } from '@/components/chat-ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { tx, useT } from '@/lib/i18n';

export type ChatMode = 'places' | 'interpret' | 'guide' | 'memory';

export const ChatModes: Record<ChatMode, { label: string; icon: 'location' | 'chatbubbles' | 'compass' | 'sparkles'; placeholder: string }> = {
  places: { label: tx('Places'), icon: 'location', placeholder: tx('Ask for food, sights, anything nearby…') },
  interpret: { label: tx('Interpret'), icon: 'chatbubbles', placeholder: tx('Tell Hao what to say…') },
  guide: { label: tx('Guide'), icon: 'compass', placeholder: tx('Ask about WeChat, trains, payments…') },
  memory: { label: tx('Memory'), icon: 'sparkles', placeholder: tx('Ask what you heard, saw or planned…') },
};

// Fixed per-bar multipliers so the waveform looks organic but reacts to the live level.
const BAR_SHAPE = [0.45, 0.7, 1, 0.8, 0.55, 0.9, 0.65, 1, 0.75, 0.5, 0.85, 0.6, 0.95, 0.7, 0.5, 0.8];

type Props = {
  mode: ChatMode;
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onOpenMenu: () => void;
  /** Shows a "Discover" chip that opens today's stories. */
  onOpenDiscover?: () => void;
  /** Shows a camera button: photograph a menu, sign or something to buy for Hao to read (Places). */
  onScan?: () => void;
  /** Shows a QR button: scan a restaurant table's menu code (Places). */
  onScanQr?: () => void;
  busy: boolean;
  /** Voice input; omit to hide the mic (e.g. Guide mode). */
  voice?: {
    recording: boolean;
    /** Who the next recording is for, shown while recording. */
    speakerLabel: string;
    accent: string;
    durationMillis: number;
    metering?: number;
    onStart: () => void;
    onStop: (send: boolean) => void;
  };
};

type Tool = { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean };

export function ChatComposer({ mode, value, onChangeText, onSend, onOpenMenu, onOpenDiscover, onScan, onScanQr, busy, voice }: Props) {
  const t = useT();
  const hasText = value.trim().length > 0;
  // Two or more tools (Discover, QR, photo) fold into one button with a menu, so the bar never runs into the send
  // button on a narrow phone or in a long language.
  const tools: Tool[] = [];
  if (onOpenDiscover) tools.push({ key: 'discover', icon: 'play-circle-outline', label: t('Discover: today’s stories'), onPress: onOpenDiscover });
  if (onScanQr) tools.push({ key: 'qr', icon: 'qr-code-outline', label: t('Scan a menu QR code'), onPress: onScanQr, disabled: busy });
  // Stays while typing: what they typed goes with the photo ("tell the shopkeeper I want two").
  if (onScan) tools.push({ key: 'photo', icon: 'camera-outline', label: t('Photo of a menu, sign or something to buy'), onPress: onScan, disabled: busy });
  const grouped = tools.length >= 2;

  if (voice?.recording) return <Recorder voice={voice} />;

  return (
    <View style={styles.dock}>
      <View style={styles.box}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={t(ChatModes[mode].placeholder)}
          placeholderTextColor={ChatColors.faint}
          style={styles.input}
          multiline
          editable={!busy}
          submitBehavior="blurAndSubmit"
          onSubmitEditing={onSend}
          returnKeyType="send"
          accessibilityLabel={t('Message to Hao')}
        />
        <View style={styles.toolbar}>
          <Pressable
            onPress={onOpenMenu}
            style={({ pressed }) => [styles.plus, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('Choose mode')}>
            <Ionicons name="add" size={24} color={ChatColors.text} />
          </Pressable>
          <Pressable
            onPress={onOpenMenu}
            style={({ pressed }) => [styles.modeChip, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('Mode: {mode}. Change mode', { mode: t(ChatModes[mode].label) })}>
            <Ionicons name={`${ChatModes[mode].icon}-outline`} size={15} color={ChatColors.text} />
            <Text style={styles.modeChipText}>{t(ChatModes[mode].label)}</Text>
          </Pressable>
          {onOpenDiscover && !grouped ? (
            <Pressable
              onPress={onOpenDiscover}
              style={({ pressed }) => [styles.modeChip, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('Discover: today’s stories')}>
              <Ionicons name="play-circle-outline" size={15} color={ChatColors.text} />
              <Text style={styles.modeChipText}>{t('Discover')}</Text>
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }} />
          {grouped ? <ToolsMenu tools={tools} /> : null}
          {onScanQr && !grouped ? (
            <Pressable
              onPress={onScanQr}
              disabled={busy}
              style={({ pressed }) => [styles.plus, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('Scan a menu QR code')}>
              <Ionicons name="qr-code-outline" size={21} color={ChatColors.text} />
            </Pressable>
          ) : null}
          {onScan && !grouped ? (
            <Pressable
              onPress={onScan}
              disabled={busy}
              style={({ pressed }) => [styles.plus, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('Photo of a menu, sign or something to buy')}>
              <Ionicons name="camera-outline" size={22} color={ChatColors.text} />
            </Pressable>
          ) : null}
          {hasText || !voice ? (
            <Pressable
              onPress={onSend}
              disabled={!hasText || busy}
              style={({ pressed }) => [styles.action, (!hasText || busy) && styles.actionDisabled, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('Send')}>
              {busy ? <ActivityIndicator size="small" color={ChatColors.soft} /> : <Ionicons name="arrow-up" size={20} color={hasText ? '#fff' : ChatColors.faint} />}
            </Pressable>
          ) : (
            <Pressable
              onPress={voice.onStart}
              disabled={busy}
              style={({ pressed }) => [styles.action, { backgroundColor: voice.accent }, busy && styles.actionDisabled, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('Speak ({speaker})', { speaker: voice.speakerLabel })}>
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="mic" size={20} color="#fff" />}
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

/** One button for several tools; opens a small menu above it, closed by a tap anywhere else. */
function ToolsMenu({ tools }: { tools: Tool[] }) {
  const t = useT();
  const button = useRef<HostInstance>(null);
  const window = useWindowDimensions();
  const [at, setAt] = useState<{ right: number; bottom: number } | null>(null);
  const open = () =>
    button.current?.measureInWindow((x, y, width) => setAt({ right: Math.max(8, window.width - x - width), bottom: window.height - y + 8 }));
  const close = () => setAt(null);
  return (
    <>
      <Pressable
        ref={button}
        onPress={open}
        style={({ pressed }) => [styles.plus, at && styles.toolsOpen, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={t('More tools')}
        accessibilityState={{ expanded: !!at }}>
        <Ionicons name="apps-outline" size={20} color={ChatColors.text} />
      </Pressable>
      <Modal visible={!!at} transparent animationType="none" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={t('Close')} />
        {at ? (
          <Animated.View entering={ZoomIn.duration(140)} style={[styles.toolsCard, { right: at.right, bottom: at.bottom }]}>
            {tools.map((tool) => (
              <Pressable
                key={tool.key}
                disabled={tool.disabled}
                onPress={() => {
                  close();
                  tool.onPress();
                }}
                style={({ pressed }) => [styles.toolRow, tool.disabled && styles.toolDisabled, pressed && styles.toolPressed]}
                accessibilityRole="button">
                <Ionicons name={tool.icon} size={20} color={ChatColors.text} />
                <Text style={styles.toolLabel} numberOfLines={2}>
                  {tool.label}
                </Text>
              </Pressable>
            ))}
          </Animated.View>
        ) : null}
      </Modal>
    </>
  );
}

function Recorder({ voice }: { voice: NonNullable<Props['voice']> }) {
  const t = useT();
  const seconds = Math.floor(voice.durationMillis / 1000);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  // Metering is in dBFS (-160 silent … 0 loudest); map the useful range to 0–1.
  const level = voice.metering === undefined ? 0.3 : Math.min(1, Math.max(0.08, (voice.metering + 55) / 50));

  return (
    <Animated.View entering={FadeIn.duration(150)} style={styles.dock}>
      <View style={[styles.recorder, { borderColor: voice.accent }]}>
        <Pressable
          onPress={() => voice.onStop(false)}
          hitSlop={8}
          style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('Cancel recording')}>
          <Ionicons name="close" size={20} color={Colors.inkSoft} />
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.recorderTop}>
            <PulseDot color={voice.accent} />
            <Text style={styles.timer}>{time}</Text>
            <Text style={styles.recorderLabel} numberOfLines={1}>
              {voice.speakerLabel}
            </Text>
          </View>
          <View style={styles.wave}>
            {BAR_SHAPE.map((shape, i) => (
              <View key={i} style={[styles.bar, { height: 4 + 22 * level * shape, backgroundColor: voice.accent }]} />
            ))}
          </View>
        </View>
        <Pressable
          onPress={() => voice.onStop(true)}
          style={({ pressed }) => [styles.sendRecording, { backgroundColor: voice.accent }, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('Send recording')}>
          <Ionicons name="arrow-up" size={22} color="#fff" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

function PulseDot({ color }: { color: string }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.3, { duration: 700 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const styles = themed(() => StyleSheet.create({
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
  dock: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10, backgroundColor: ChatColors.background },
  box: {
    backgroundColor: ChatColors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: ChatColors.border,
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  input: { maxHeight: 160, minHeight: 26, paddingHorizontal: 10, paddingVertical: 2, fontSize: 16, lineHeight: 22, color: ChatColors.text },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  plus: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: ChatColors.border,
  },
  modeChipText: { fontSize: 14, fontWeight: '500', color: ChatColors.text },
  toolsOpen: { backgroundColor: ChatColors.userBubble },
  toolsCard: {
    position: 'absolute',
    minWidth: 220,
    maxWidth: 280,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: ChatColors.surface,
    borderWidth: 1,
    borderColor: ChatColors.border,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    transformOrigin: 'bottom right',
  },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  toolPressed: { backgroundColor: ChatColors.userBubble },
  toolDisabled: { opacity: 0.4 },
  toolLabel: { flexShrink: 1, fontSize: 15, color: ChatColors.text },
  action: { width: 36, height: 36, borderRadius: 18, backgroundColor: ChatColors.accent, alignItems: 'center', justifyContent: 'center' },
  actionDisabled: { backgroundColor: ChatColors.userBubble },
  recorder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 64,
    paddingHorizontal: 8,
    borderRadius: 32,
    borderWidth: 1.5,
    backgroundColor: Colors.card,
  },
  cancel: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  recorderTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  timer: { fontSize: 14, fontWeight: '800', color: Colors.ink, fontVariant: ['tabular-nums'] },
  recorderLabel: { flex: 1, fontSize: 13, color: Colors.inkSoft },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 26 },
  bar: { flex: 1, borderRadius: 2, opacity: 0.85 },
  sendRecording: { width: 48, height: 48, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
}));
