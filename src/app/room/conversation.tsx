import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RoomContexts, type ConvCaption, type RoomAlert, type RoomContext } from '@shared/rooms/protocol';

import { RoomQr } from '@/components/room-qr';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useLanguagePreference } from '@/lib/auth';
import { forgetHostedRoom, getHostedRoom, getRoomContext } from '@/lib/rooms/session';
import { useConversationHost } from '@/lib/rooms/use-conversation-host';
import { useVadRecorder } from '@/lib/rooms/use-vad-recorder';
import { stopVoice } from '@/lib/rooms/voice';
import { tx, useT } from '@/lib/i18n';

type FeedItem = ConvCaption | { id: string; whisper: string; at: number };

const ALERT_STYLE: Record<RoomAlert['type'], { icon: 'warning' | 'pricetag' | 'shield' | 'wallet'; bg: string; fg: string; label: string }> = {
  allergy: { icon: 'warning', bg: '#FDE2E4', fg: '#A3172B', label: tx('Allergy check') },
  price: { icon: 'pricetag', bg: '#FEF4DE', fg: '#8A5A00', label: tx('Price') },
  budget: { icon: 'wallet', bg: '#FEF4DE', fg: '#8A5A00', label: tx('Over budget') },
  scam: { icon: 'shield', bg: '#1B1A1F', fg: '#F2B33D', label: tx('Be careful') },
};

export default function ConversationRoom() {
  const t = useT();
  const [language] = useLanguagePreference();
  // The QR page created the room and opened this screen when the local person joined.
  const [room] = useState(() => getHostedRoom('conversation'));
  const [initialContext] = useState(getRoomContext);
  const host = useConversationHost({
    code: room?.roomId ?? null,
    userLanguage: { code: language.code, name: language.name, speech: language.speech },
    initialContext,
  });
  const { captions, whispers, alerts, summary, context, phase, localConnected, connected, notice, ended } = host;
  const [dismissedAlert, setDismissedAlert] = useState(0);
  const [showQr, setShowQr] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const vad = useVadRecorder((result) => {
    if ('audio' in result) host.sendAudio(result.audio);
    else {
      host.claimMic(false);
      if ('notHeard' in result) host.setNotice(t('Didn’t catch that, tap and try again.'));
    }
  });

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [captions.length, whispers.length, phase.phase]);

  const myTurn = phase.phase === 'idle' || (phase.phase === 'listening' && phase.by === 'USER');
  const tapCircle = async () => {
    host.setNotice(null);
    if (vad.recording) return vad.stop('send');
    if (!myTurn || ended) return;
    stopVoice();
    if (!host.claimMic(true)) return;
    if (!(await vad.start())) host.claimMic(false);
  };

  const sendText = () => {
    const text = draft.trim();
    if (!text || !myTurn) return;
    setDraft('');
    host.sendText(text);
  };

  const chooseContext = (c: RoomContext | null) => {
    host.setContext(c);
    setContextOpen(false);
  };

  const endRoom = () => {
    host.end();
    forgetHostedRoom('conversation');
    router.back();
  };

  if (!room) {
    return (
      <SafeAreaView style={[styles.container, styles.missing]}>
        <Text style={styles.missingText}>{t('This conversation has ended. Show your QR code to start a new one.')}</Text>
        <Pressable onPress={() => router.replace('/room')} style={styles.missingBtn}>
          <Text style={styles.missingBtnText}>{t('Show my QR code')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const feed: FeedItem[] = [...captions, ...whispers].sort((a, b) => a.at - b.at);
  const alert = alerts.length > dismissedAlert ? alerts[alerts.length - 1] : null;
  const hint = vad.recording
    ? t('Listening… it sends when you stop talking')
    : phase.phase === 'thinking'
      ? t('Hao is thinking…')
      : phase.phase === 'speaking'
        ? t('Hao is speaking…')
        : phase.phase === 'listening' && phase.by === 'LOCAL'
          ? t('They’re talking…')
          : t('Tap and speak');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={endRoom} style={styles.topBtn} accessibilityLabel={t('End conversation')}>
          <Ionicons name="close" size={20} color={Colors.ink} />
        </Pressable>
        <View style={styles.center}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: connected && localConnected ? '#3CCB8F' : Colors.gold }]} />
            <Text style={styles.status}>{!connected ? t('Reconnecting…') : localConnected ? t('Connected') : t('Waiting for them')}</Text>
          </View>
          <Pressable onPress={() => setContextOpen(true)} style={styles.contextChip} accessibilityLabel={t('Change where you are')}>
            <Text style={styles.contextText}>{context ? t(RoomContexts[context].label) : t('Set place')}</Text>
            <Ionicons name="chevron-down" size={12} color={Colors.inkSoft} />
          </Pressable>
        </View>
        <Pressable onPress={() => setShowQr(true)} style={styles.topBtn} accessibilityLabel={t('Show QR code')}>
          <Ionicons name="qr-code-outline" size={20} color={Colors.ink} />
        </Pressable>
      </View>

      {alert ? (
        <Animated.View entering={FadeInUp} style={[styles.alert, { backgroundColor: ALERT_STYLE[alert.type].bg }]}>
          <Ionicons name={ALERT_STYLE[alert.type].icon} size={20} color={ALERT_STYLE[alert.type].fg} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.alertLabel, { color: ALERT_STYLE[alert.type].fg }]}>{t(ALERT_STYLE[alert.type].label)}</Text>
            <Text style={[styles.alertText, alert.type === 'scam' && { color: '#fff' }]}>{alert.message}</Text>
          </View>
          <Pressable onPress={() => setDismissedAlert(alerts.length)} hitSlop={8}>
            <Text style={[styles.alertOk, { color: ALERT_STYLE[alert.type].fg }]}>OK</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {summary ? (
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>{summary.title}</Text>
          {summary.items.map((item, i) => (
            <Text key={i} style={styles.summaryItem}>
              • {item}
            </Text>
          ))}
          {summary.total ? <Text style={styles.summaryTotal}>{t('Total {total}', { total: summary.total })}</Text> : null}
        </View>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.feed}>
          {feed.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="mic-circle-outline" size={44} color={Colors.red} />
              <Text style={styles.emptyTitle}>{localConnected ? t('You’re connected') : t('Waiting for them to join')}</Text>
              <Text style={styles.emptyBody}>{t('Tap the circle once and speak. Hao listens, talks to them in Chinese with its own voice, and only checks with you for allergies, payments or anything over budget.')}</Text>
            </View>
          ) : null}
          {feed.map((item) => (
            <Animated.View key={item.id} entering={FadeInUp.duration(200)}>
              <FeedRow item={item} />
            </Animated.View>
          ))}
        </ScrollView>

        <View style={styles.dock}>
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {ended ? <Text style={styles.notice}>{t('This conversation has ended.')}</Text> : null}
          {typing ? (
            <View style={styles.inputRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={t('Type what you want to say…')}
                placeholderTextColor={Colors.muted}
                style={styles.input}
                onSubmitEditing={sendText}
                returnKeyType="send"
                autoFocus
              />
              <Pressable onPress={sendText} disabled={!myTurn} style={[styles.send, !myTurn && { opacity: 0.4 }]} accessibilityLabel={t('Send')}>
                <Ionicons name="arrow-up" size={20} color="#fff" />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.circleRow}>
            <Pressable onPress={() => setTyping((v) => !v)} style={styles.sideBtn} accessibilityLabel={typing ? t('Hide keyboard') : t('Type instead')}>
              <Ionicons name={typing ? 'close' : 'create-outline'} size={22} color={Colors.ink} />
            </Pressable>
            <Pressable
              onPress={tapCircle}
              disabled={(!myTurn && !vad.recording) || ended}
              accessibilityRole="button"
              accessibilityLabel={vad.recording ? t('Stop and send') : t('Tap and speak')}
              style={[styles.circle, vad.recording && styles.circleRecording, !myTurn && !vad.recording && styles.circleLocked]}>
              {vad.recording ? (
                <View style={[styles.levelRing, { transform: [{ scale: 1 + Math.max(0, Math.min(1, ((vad.level ?? -60) + 50) / 40)) * 0.35 }] }]} />
              ) : null}
              <Ionicons name={vad.recording ? 'radio-button-on' : 'mic'} size={38} color={vad.recording ? Colors.red : '#fff'} />
            </Pressable>
            <View style={styles.sideBtnSpacer} />
          </View>
          <Text style={styles.hint}>{hint}</Text>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showQr} transparent animationType="fade" onRequestClose={() => setShowQr(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowQr(false)}>
          <LinearGradient colors={[Colors.red, Colors.redDark]} style={styles.qrSheet}>
            <RoomQr joinUrl={room.joinUrl} roomId={room.roomId} captionZh="请用微信或相机扫码加入对话" caption={t('They can scan again to rejoin')} />
          </LinearGradient>
        </Pressable>
      </Modal>

      <Modal visible={contextOpen} transparent animationType="fade" onRequestClose={() => setContextOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setContextOpen(false)}>
          <View style={styles.contextSheet}>
            <Text style={styles.contextTitle}>{t('Where are you?')}</Text>
            <Text style={styles.contextBody}>{t('Hao uses this to ask the right questions.')}</Text>
            <View style={styles.contextGrid}>
              {(Object.keys(RoomContexts) as RoomContext[]).map((c) => (
                <Pressable key={c} onPress={() => chooseContext(c)} style={[styles.contextOption, context === c && styles.contextOptionActive]}>
                  <Text style={[styles.contextOptionText, context === c && { color: '#fff' }]}>{t(RoomContexts[c].label)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const t = useT();
  if ('whisper' in item) {
    return (
      <View style={styles.whisper}>
        <Ionicons name="lock-closed" size={13} color={Colors.inkSoft} />
        <Text style={styles.whisperText}>
          <Text style={{ fontWeight: '800' }}>{t('Only you:')}</Text>
          {item.whisper}
        </Text>
      </View>
    );
  }
  if (item.speaker === 'USER') {
    return (
      <View style={[styles.bubble, styles.userBubble]}>
        <Text style={styles.userText}>{item.text}</Text>
      </View>
    );
  }
  if (item.speaker === 'LOCAL') {
    return (
      <View style={[styles.bubble, styles.localBubble]}>
        <Text style={styles.localLabel}>{t('They said')}</Text>
        <Text style={styles.localText}>{item.text}</Text>
      </View>
    );
  }
  const toLocal = item.to === 'LOCAL';
  return (
    <View style={[styles.hao, toLocal ? styles.haoToLocal : styles.haoToUser]}>
      <View style={styles.haoHeader}>
        <View style={styles.haoBadge}>
          <Text style={styles.haoBadgeText}>好</Text>
        </View>
        <Text style={[styles.haoLabel, toLocal && { color: Colors.gold }]}>{toLocal ? t('Hao → them') : t('Hao → you')}</Text>
      </View>
      <Text style={[styles.haoText, toLocal && { color: '#fff', fontSize: 20, fontWeight: '800' }]}>{item.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  missing: { justifyContent: 'center', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  missingText: { fontSize: 15, color: Colors.inkSoft, textAlign: 'center' },
  missingBtn: { paddingHorizontal: Spacing.lg, paddingVertical: 12, borderRadius: Radius.pill, backgroundColor: Colors.red },
  missingBtnText: { color: '#fff', fontWeight: '800' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, height: 60 },
  topBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line },
  center: { alignItems: 'center', gap: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  status: { fontSize: 14, fontWeight: '800', color: Colors.ink },
  contextChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.pill, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line },
  contextText: { fontSize: 12, fontWeight: '700', color: Colors.inkSoft },
  alert: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.md, marginBottom: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md },
  alertLabel: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  alertText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: Colors.ink, marginTop: 2 },
  alertOk: { fontSize: 14, fontWeight: '900' },
  summary: { marginHorizontal: Spacing.md, marginBottom: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.card, ...Shadow },
  summaryTitle: { fontSize: 12, fontWeight: '900', color: Colors.red, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  summaryItem: { fontSize: 14, lineHeight: 21, color: Colors.ink },
  summaryTotal: { fontSize: 15, fontWeight: '800', color: Colors.ink, marginTop: 6 },
  feed: { padding: Spacing.md, gap: Spacing.sm, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: Colors.ink },
  emptyBody: { fontSize: 14, lineHeight: 21, color: Colors.inkSoft, textAlign: 'center' },
  bubble: { maxWidth: '85%', padding: Spacing.md, borderRadius: Radius.lg },
  userBubble: { alignSelf: 'flex-end', backgroundColor: Colors.red, borderBottomRightRadius: 6 },
  userText: { color: '#fff', fontSize: 16, lineHeight: 22, fontWeight: '600' },
  localBubble: { alignSelf: 'flex-start', backgroundColor: Colors.card, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: Colors.line },
  localLabel: { fontSize: 11, fontWeight: '800', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  localText: { fontSize: 18, fontWeight: '700', color: Colors.ink, marginTop: 4 },
  hao: { borderRadius: Radius.lg, padding: Spacing.md },
  haoToLocal: { backgroundColor: Colors.ink },
  haoToUser: { backgroundColor: Colors.goldSoft },
  haoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  haoBadge: { width: 22, height: 22, borderRadius: 7, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center' },
  haoBadgeText: { color: Colors.gold, fontWeight: '900', fontSize: 12 },
  haoLabel: { fontSize: 11, fontWeight: '800', color: '#A26A00', letterSpacing: 1, textTransform: 'uppercase' },
  haoText: { fontSize: 15, lineHeight: 22, color: Colors.ink, fontWeight: '600' },
  whisper: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, alignSelf: 'center', maxWidth: '92%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.md, backgroundColor: Colors.card, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.line },
  whisperText: { flex: 1, fontSize: 13, lineHeight: 18, color: Colors.inkSoft, fontStyle: 'italic' },
  dock: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md, gap: Spacing.sm, alignItems: 'stretch' },
  notice: { fontSize: 13, color: Colors.redDark, textAlign: 'center', fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  input: { flex: 1, height: 48, borderRadius: 24, paddingHorizontal: Spacing.md, fontSize: 16, color: Colors.ink, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center' },
  circleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg },
  sideBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line },
  sideBtnSpacer: { width: 48 },
  circle: { width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center', ...Shadow, shadowOpacity: 0.2 },
  circleRecording: { backgroundColor: Colors.card, borderWidth: 3, borderColor: Colors.red },
  circleLocked: { backgroundColor: Colors.muted },
  levelRing: { position: 'absolute', width: 112, height: 112, borderRadius: 56, borderWidth: 3, borderColor: 'rgba(215,38,61,0.35)' },
  hint: { fontSize: 14, fontWeight: '700', color: Colors.inkSoft, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: Spacing.md },
  qrSheet: { borderRadius: 32, padding: Spacing.md },
  contextSheet: { backgroundColor: Colors.paper, borderRadius: 24, padding: Spacing.lg, gap: Spacing.sm },
  contextTitle: { fontSize: 20, fontWeight: '800', color: Colors.ink },
  contextBody: { fontSize: 14, color: Colors.inkSoft },
  contextGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  contextOption: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.pill, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line },
  contextOptionActive: { backgroundColor: Colors.red, borderColor: Colors.red },
  contextOptionText: { fontSize: 14, fontWeight: '700', color: Colors.ink },
});
