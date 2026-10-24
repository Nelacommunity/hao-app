import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ConvCaption, RoomAlert } from '@shared/rooms/protocol';

import { ChatColors } from '@/components/chat-ui';
import { RoomQr } from '@/components/room-qr';
import { Colors, Radius, Shadow, Spacing, themed } from '@/constants/theme';
import { useAuth, useLanguagePreference } from '@/lib/auth';
import { roomApi } from '@/lib/rooms/api';
import { forgetHostedRoom, getHostedRoom, getRoomContext, getRoomPlace, setRoomContext, setRoomPlace } from '@/lib/rooms/session';
import { useConversationHost } from '@/lib/rooms/use-conversation-host';
import { useVadRecorder } from '@/lib/rooms/use-vad-recorder';
import { stopVoice } from '@/lib/rooms/voice';
import { logVisit } from '@/lib/visits';
import { tx, useT } from '@/lib/i18n';

type FeedItem = ConvCaption | { id: string; whisper: string; at: number };

const ALERT_STYLE: Record<RoomAlert['type'], { icon: 'warning' | 'pricetag' | 'shield' | 'wallet'; bg: keyof typeof Colors; fg: keyof typeof Colors; label: string }> = {
  allergy: { icon: 'warning', bg: 'redSoft', fg: 'redText', label: tx('Allergy check') },
  price: { icon: 'pricetag', bg: 'goldSoft', fg: 'goldText', label: tx('Price') },
  budget: { icon: 'wallet', bg: 'goldSoft', fg: 'goldText', label: tx('Over budget') },
  scam: { icon: 'shield', bg: 'strong', fg: 'gold', label: tx('Be careful') },
};

export default function ConversationRoom() {
  const t = useT();
  const [language] = useLanguagePreference();
  // The QR page created the room and opened this screen when the local person joined.
  const [room] = useState(() => getHostedRoom('conversation'));
  const [initialContext] = useState(getRoomContext);
  const { refreshProfile, profile, session } = useAuth();
  const myName = profile?.display_name || session?.user.email?.split('@')[0] || '';
  const host = useConversationHost({
    code: room?.roomId ?? null,
    userLanguage: { code: language.code, name: language.name, speech: language.speech },
    userName: myName,
    initialContext,
  });
  const { captions, whispers, alerts, summary, context, phase, localConnected, localName, connected, notice, ended } = host;
  const [dismissedAlert, setDismissedAlert] = useState(0);
  const [showQr, setShowQr] = useState(false);
  // After ending: keep it (summarised into Hao DNA) or delete it.
  const [askSave, setAskSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollViewInstance>(null);

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

  const leave = () => {
    forgetHostedRoom('conversation');
    setRoomContext(null);
    // Opened from a place card and they actually talked: ask later whether they went.
    const place = getRoomPlace();
    setRoomPlace(null);
    if (place && captions.length) logVisit({ placeId: place.id, source: 'voice_room' }).catch(() => {});
    router.back();
  };

  const endRoom = () => {
    host.end();
    // Nothing is kept unless they choose to save it.
    if (captions.some((c) => c.speaker !== 'AGENT')) setAskSave(true);
    else leave();
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await roomApi.save({ captions, summary, context, language: { code: language.code, name: language.name }, names: { user: myName, local: localName } });
      refreshProfile().catch(() => {});
      leave();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t('Something went wrong'));
    } finally {
      setSaving(false);
    }
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
            <Text style={styles.status} numberOfLines={1}>
              {!connected
                ? t('Reconnecting…')
                : localConnected
                  ? localName
                    ? t('Talking with {name}', { name: localName })
                    : t('Connected')
                  : t('Waiting for them')}
            </Text>
          </View>
        </View>
        <Pressable onPress={() => setShowQr(true)} style={styles.topBtn} accessibilityLabel={t('Show QR code')}>
          <Ionicons name="qr-code-outline" size={20} color={Colors.ink} />
        </Pressable>
      </View>

      {alert ? (
        <Animated.View entering={FadeInUp} style={[styles.alert, { backgroundColor: Colors[ALERT_STYLE[alert.type].bg] }]}>
          <Ionicons name={ALERT_STYLE[alert.type].icon} size={20} color={Colors[ALERT_STYLE[alert.type].fg]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.alertLabel, { color: Colors[ALERT_STYLE[alert.type].fg] }]}>{t(ALERT_STYLE[alert.type].label)}</Text>
            <Text style={[styles.alertText, alert.type === 'scam' && { color: '#fff' }]}>{alert.message}</Text>
          </View>
          <Pressable onPress={() => setDismissedAlert(alerts.length)} hitSlop={8}>
            <Text style={[styles.alertOk, { color: Colors[ALERT_STYLE[alert.type].fg] }]}>OK</Text>
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
              <Text style={styles.emptyBody}>{t('Just talk. Tap the circle and speak; Hao translates for them in Chinese, and their answer for you.')}</Text>
            </View>
          ) : null}
          {feed.map((item) => (
            <Animated.View key={item.id} entering={FadeInUp.duration(200)}>
              <FeedRow item={item} localName={localName} />
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
          <View style={styles.qrSheet}>
            <RoomQr joinUrl={room.joinUrl} roomId={room.roomId} captionZh="请用微信或相机扫码加入对话" caption={t('They can scan again to rejoin')} />
          </View>
        </Pressable>
      </Modal>

      <Modal visible={askSave} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={styles.saveBackdrop}>
          <View style={styles.saveSheet}>
            <Ionicons name="bookmark" size={28} color={ChatColors.accent} />
            <Text style={styles.saveTitle}>{t('Save this conversation?')}</Text>
            <Text style={styles.saveBody}>
              {t('Hao keeps a short summary in your chats and adds what it learned to your Hao DNA, like “ordered at a restaurant” or “how to open a bank card”. Delete keeps nothing.')}
            </Text>
            {saveError ? <Text style={styles.notice}>{saveError}</Text> : null}
            <Pressable onPress={save} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]} accessibilityRole="button">
              <Text style={styles.saveBtnText}>{saving ? t('Saving…') : t('Save to Hao')}</Text>
            </Pressable>
            <Pressable onPress={leave} disabled={saving} style={styles.deleteBtn} accessibilityRole="button">
              <Text style={styles.deleteBtnText}>{t('Delete')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function FeedRow({ item, localName }: { item: FeedItem; localName: string | null }) {
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
        <Text style={styles.userLabel}>{t('You')}</Text>
        <Text style={styles.userText}>{item.text}</Text>
      </View>
    );
  }
  if (item.speaker === 'LOCAL') {
    return (
      <View style={[styles.bubble, styles.localBubble]}>
        <Text style={styles.localLabel}>{localName ?? t('They said')}</Text>
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
        <Text style={[styles.haoLabel, toLocal && { color: Colors.gold }]}>
          {toLocal ? (localName ? t('Hao → {name}', { name: localName }) : t('Hao → them')) : t('Hao → you')}
        </Text>
      </View>
      <Text style={[styles.haoText, toLocal && { color: '#fff', fontSize: 20, fontWeight: '800' }]}>{item.text}</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: ChatColors.background },
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
  userBubble: { alignSelf: 'flex-end', backgroundColor: ChatColors.userBubble, borderRadius: 12, borderTopRightRadius: 3 },
  userText: { color: '#fff', fontSize: 16, lineHeight: 22, fontWeight: '600' },
  userLabel: { fontSize: 11, fontWeight: '800', color: ChatColors.soft, marginBottom: 2 },
  localBubble: { alignSelf: 'flex-start', backgroundColor: ChatColors.haoBubble, borderRadius: 12, borderTopLeftRadius: 3 },
  localLabel: { fontSize: 12, fontWeight: '800', color: Colors.jade },
  localText: { fontSize: 18, fontWeight: '700', color: Colors.ink, marginTop: 4 },
  hao: { borderRadius: Radius.lg, padding: Spacing.md },
  haoToLocal: { backgroundColor: Colors.strong },
  haoToUser: { backgroundColor: Colors.goldSoft },
  haoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  haoBadge: { width: 22, height: 22, borderRadius: 7, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center' },
  haoBadgeText: { color: Colors.gold, fontWeight: '900', fontSize: 12 },
  haoLabel: { fontSize: 11, fontWeight: '800', color: Colors.goldText, letterSpacing: 1, textTransform: 'uppercase' },
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
  qrSheet: { borderRadius: 32, padding: Spacing.md, backgroundColor: Colors.paper },
  saveBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  saveSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.sm, alignItems: 'center' },
  saveTitle: { fontSize: 20, fontWeight: '800', color: Colors.ink },
  saveBody: { fontSize: 14, lineHeight: 21, color: Colors.inkSoft, textAlign: 'center', marginBottom: Spacing.sm },
  saveBtn: { alignSelf: 'stretch', minHeight: 50, borderRadius: Radius.pill, backgroundColor: ChatColors.accent, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  deleteBtn: { alignSelf: 'stretch', minHeight: 50, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { color: Colors.red, fontSize: 16, fontWeight: '700' },
}));
