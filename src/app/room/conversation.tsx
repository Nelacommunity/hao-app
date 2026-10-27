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
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ContactKind } from '@shared/ai/types';
import type { ConvCaption, RoomAlert } from '@shared/rooms/protocol';

import { HaoMark, Thinking } from '@/components/chat-ui';
import { RoomQr } from '@/components/room-qr';
import { Colors, Radius, Shadow, Spacing, themed, themedPalette } from '@/constants/theme';
import { useAuth, useLanguagePreference } from '@/lib/auth';
import { roomApi } from '@/lib/rooms/api';
import { forgetHostedRoom, getHostedRoom, getRoomContext, getRoomPlace, setRoomContext, setRoomPlace } from '@/lib/rooms/session';
import { useConversationHost } from '@/lib/rooms/use-conversation-host';
import { useVadRecorder } from '@/lib/rooms/use-vad-recorder';
import { stopVoice } from '@/lib/rooms/voice';
import { logVisit } from '@/lib/visits';
import { tx, useT } from '@/lib/i18n';

type FeedItem = ConvCaption | { id: string; whisper: string; at: number };

// Claude's chat look: a warm, quiet page; Hao's lines as plain text beside its mark, yours in a soft bubble.
const Chat = themedPalette(
  { page: '#FAF9F5', surface: '#FFFFFF', bubble: '#F0EEE6', text: '#1F1E1D', soft: '#6B6A65', faint: '#9C9A92', border: '#E8E6DC', spoken: '#FBF3E4' },
  { page: '#262624', surface: '#30302E', bubble: '#141413', text: '#F5F4EE', soft: '#A6A39A', faint: '#77756E', border: '#3D3D3A', spoken: '#3A3226' }
);

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
  const { refreshProfile, profile, session, updateProfile } = useAuth();
  const myName = profile?.display_name || session?.user.email?.split('@')[0] || '';
  const host = useConversationHost({
    code: room?.roomId ?? null,
    userLanguage: { code: language.code, name: language.name, speech: language.speech },
    userName: myName,
    initialContext,
  });
  const { captions, whispers, alerts, summary, context, phase, localConnected, localName, connected, notice, ended, contactRequest } = host;
  const [dismissedAlert, setDismissedAlert] = useState(0);
  const [showQr, setShowQr] = useState(false);
  // After ending: keep it (summarised into Hao DNA) or delete it.
  const [askSave, setAskSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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

  // Someone asked for the user's phone or email. Only what the user approves here is ever shared.
  const savedContact = contactRequest?.kind === 'phone' ? profile?.contact_phone : profile?.contact_email || session?.user.email;
  const shareContact = (kind: ContactKind, value: string, remember: boolean) => {
    if (remember) updateProfile(kind === 'phone' ? { contact_phone: value } : { contact_email: value }).catch(() => {});
    host.shareContact(kind, value, kind === 'phone' ? t('Here’s my phone number: {value}', { value }) : t('Here’s my email: {value}', { value }));
  };
  const declineContact = (kind: ContactKind) =>
    host.declineContact(kind === 'phone' ? t('Sorry, I’d rather not share my phone number.') : t('Sorry, I’d rather not share my email.'));

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
      await roomApi.save({ captions: captions.filter((c) => !c.contact), summary, context, language: { code: language.code, name: language.name }, names: { user: myName, local: localName } });
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

  const working = phase.phase === 'thinking';
  const level = Math.max(0, Math.min(1, ((vad.level ?? -60) + 50) / 40));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={endRoom} style={styles.topBtn} hitSlop={6} accessibilityLabel={t('End conversation')}>
          <Ionicons name="close" size={22} color={Chat.text} />
        </Pressable>
        <View style={styles.center}>
          <Text style={styles.title} numberOfLines={1}>
            {localName ? t('Talking with {name}', { name: localName }) : t('Live conversation')}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: connected && localConnected ? '#3CCB8F' : Colors.gold }]} />
            <Text style={styles.status} numberOfLines={1}>
              {!connected ? t('Reconnecting…') : localConnected ? t('Connected') : t('Waiting for them')}
            </Text>
          </View>
        </View>
        <Pressable onPress={() => setShowQr(true)} style={styles.topBtn} hitSlop={6} accessibilityLabel={t('Show QR code')}>
          <Ionicons name="qr-code-outline" size={20} color={Chat.text} />
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

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.feed} keyboardShouldPersistTaps="handled">
          {summary ? (
            <View style={styles.summary}>
              <View style={styles.summaryHead}>
                <Ionicons name="receipt-outline" size={15} color={Chat.soft} />
                <Text style={styles.summaryTitle}>{summary.title}</Text>
              </View>
              {summary.items.map((item, i) => (
                <Text key={i} style={styles.summaryItem}>
                  {item}
                </Text>
              ))}
              {summary.total ? <Text style={styles.summaryTotal}>{t('Total {total}', { total: summary.total })}</Text> : null}
            </View>
          ) : null}

          {feed.length === 0 ? (
            <View style={styles.empty}>
              <HaoMark />
              <Text style={styles.emptyTitle}>{localConnected ? t('You’re connected') : t('Waiting for them to join')}</Text>
              <Text style={styles.emptyBody}>{t('Just talk. Tap the circle and speak; Hao translates for them in Chinese, and their answer for you.')}</Text>
            </View>
          ) : null}
          {feed.map((item) => (
            <Animated.View key={item.id} entering={FadeInUp.duration(200)}>
              <FeedRow item={item} localName={localName} />
            </Animated.View>
          ))}
          {working ? <Thinking label={phase.by === 'LOCAL' ? t('Translating for you…') : t('Translating for them…')} /> : null}
        </ScrollView>

        <View style={styles.dock}>
          {contactRequest && !ended ? (
            <ContactRequestCard
              key={contactRequest.id}
              kind={contactRequest.kind}
              saved={savedContact ?? ''}
              asker={localName}
              ready={myTurn && !vad.recording}
              onShare={(value, remember) => shareContact(contactRequest.kind, value, remember)}
              onDecline={() => declineContact(contactRequest.kind)}
              onDismiss={host.dismissContact}
            />
          ) : null}
          {notice ? (
            <View style={styles.notice}>
              <Ionicons name="alert-circle-outline" size={16} color={Colors.redText} />
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}
          {ended ? <Text style={styles.hint}>{t('This conversation has ended.')}</Text> : null}

          <View style={[styles.composer, vad.recording && styles.composerRecording]}>
            {vad.recording ? (
              <View style={styles.wave} accessibilityLabel={t('Listening… it sends when you stop talking')}>
                {WAVE.map((h, i) => (
                  <View key={i} style={[styles.waveBar, { height: 6 + h * level * 26 }]} />
                ))}
              </View>
            ) : (
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={myTurn ? t('Type what you want to say…') : hint}
                placeholderTextColor={Chat.faint}
                style={styles.input}
                onSubmitEditing={sendText}
                returnKeyType="send"
                editable={!ended}
                multiline
                submitBehavior="blurAndSubmit"
              />
            )}
            <View style={styles.toolbar}>
              <Text style={styles.toolbarHint} numberOfLines={1}>
                {hint}
              </Text>
              {draft.trim() && !vad.recording ? (
                <Pressable onPress={sendText} disabled={!myTurn} style={[styles.send, !myTurn && styles.disabled]} accessibilityLabel={t('Send')}>
                  <Ionicons name="arrow-up" size={20} color="#fff" />
                </Pressable>
              ) : (
                <Pressable
                  onPress={tapCircle}
                  disabled={(!myTurn && !vad.recording) || ended}
                  accessibilityRole="button"
                  accessibilityLabel={vad.recording ? t('Stop and send') : t('Tap and speak')}
                  style={[styles.mic, vad.recording && styles.micRecording, !myTurn && !vad.recording && styles.disabled]}>
                  <Ionicons name={vad.recording ? 'stop' : 'mic'} size={vad.recording ? 18 : 22} color="#fff" />
                </Pressable>
              )}
            </View>
          </View>
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
            <HaoMark />
            <Text style={styles.saveTitle}>{t('Save this conversation?')}</Text>
            <Text style={styles.saveBody}>
              {t('Hao keeps a short summary in your chats and adds what it learned to your Hao DNA, like “ordered at a restaurant” or “how to open a bank card”. Delete keeps nothing.')}
            </Text>
            {saveError ? <Text style={styles.noticeText}>{saveError}</Text> : null}
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

// Fixed bar shapes, scaled by the live mic level.
const WAVE = [0.4, 0.7, 1, 0.75, 0.5, 0.9, 0.6, 1, 0.8, 0.45, 0.85, 0.6, 0.95, 0.7, 0.5, 0.8, 0.55, 0.9, 0.65, 0.4];

function FeedRow({ item, localName }: { item: FeedItem; localName: string | null }) {
  const t = useT();
  if ('whisper' in item) {
    // Like Claude's collapsed thoughts: quiet, private notes for the user only.
    return (
      <View style={styles.whisper}>
        <View style={styles.whisperHead}>
          <Ionicons name="lock-closed-outline" size={13} color={Chat.soft} />
          <Text style={styles.whisperLabel}>{t('Only you:')}</Text>
        </View>
        <Text style={styles.whisperText}>{item.whisper}</Text>
      </View>
    );
  }
  if (item.speaker === 'USER') {
    return (
      <View style={styles.userBubble}>
        <Text style={styles.userText} selectable>
          {item.text}
        </Text>
      </View>
    );
  }
  if (item.speaker === 'LOCAL') {
    const name = localName ?? t('They said');
    return (
      <View style={styles.message}>
        <View style={styles.messageHead}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{name.slice(0, 1)}</Text>
          </View>
          <Text style={styles.messageName}>{name}</Text>
        </View>
        <Text style={styles.localText} selectable>
          {item.text}
        </Text>
      </View>
    );
  }
  if (item.contact) {
    return (
      <View style={styles.sharedContact}>
        <Ionicons name={item.contact.kind === 'phone' ? 'call-outline' : 'mail-outline'} size={16} color={Chat.soft} />
        <Text style={styles.sharedContactText} numberOfLines={1}>
          {localName ? t('Shared with {name}: {value}', { name: localName, value: item.contact.value }) : t('Shared with them: {value}', { value: item.contact.value })}
        </Text>
      </View>
    );
  }
  const toLocal = item.to === 'LOCAL';
  return (
    <View style={styles.message}>
      <View style={styles.messageHead}>
        <HaoMark />
        <Text style={styles.messageName}>
          {toLocal ? (localName ? t('Hao → {name}', { name: localName }) : t('Hao → them')) : t('Hao → you')}
        </Text>
      </View>
      {toLocal ? (
        // The line Hao spoke aloud to them, in Chinese: set apart so it's easy to show or read out.
        <View style={styles.spoken}>
          <Ionicons name="volume-medium-outline" size={16} color={Colors.goldText} style={{ marginTop: 3 }} />
          <Text style={styles.spokenText} selectable>
            {item.text}
          </Text>
        </View>
      ) : (
        <Text style={styles.haoText} selectable>
          {item.text}
        </Text>
      )}
    </View>
  );
}

const PHONE = /^\+?[\d\s()-]{5,24}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "They're asking for your phone number": share what's saved (or type it in), or say no. */
function ContactRequestCard({ kind, saved, asker, ready, onShare, onDecline, onDismiss }: {
  kind: ContactKind;
  saved: string;
  asker: string | null;
  ready: boolean;
  onShare: (value: string, remember: boolean) => void;
  onDecline: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const [value, setValue] = useState(saved);
  const [remember, setRemember] = useState(true);
  const phone = kind === 'phone';
  const clean = value.trim();
  const valid = phone ? PHONE.test(clean) : EMAIL.test(clean);
  const title = phone
    ? asker ? t('{name} is asking for your phone number', { name: asker }) : t('They’re asking for your phone number')
    : asker ? t('{name} is asking for your email', { name: asker }) : t('They’re asking for your email');

  return (
    <Animated.View entering={FadeInUp} style={styles.contactCard}>
      <View style={styles.contactHead}>
        <Ionicons name={phone ? 'call-outline' : 'mail-outline'} size={18} color={Chat.text} />
        <Text style={styles.contactTitle}>{title}</Text>
        <Pressable onPress={onDismiss} hitSlop={8} accessibilityLabel={t('Close')}>
          <Ionicons name="close" size={18} color={Chat.soft} />
        </Pressable>
      </View>
      <Text style={styles.contactBody}>{t('Only shared if you tap Share. Hao says it to them and shows it on their screen.')}</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={phone ? t('Your phone number') : t('Your email')}
        placeholderTextColor={Chat.faint}
        keyboardType={phone ? 'phone-pad' : 'email-address'}
        autoComplete={phone ? 'tel' : 'email'}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.contactInput}
      />
      {clean !== saved ? (
        <View style={styles.contactRemember}>
          <Text style={styles.contactRememberText}>{t('Remember it for next time')}</Text>
          <Switch value={remember} onValueChange={setRemember} accessibilityLabel={t('Remember it for next time')} />
        </View>
      ) : null}
      <View style={styles.contactActions}>
        <Pressable onPress={onDecline} disabled={!ready} style={[styles.contactNo, !ready && styles.disabled]} accessibilityRole="button">
          <Text style={styles.contactNoText}>{t('Don’t share')}</Text>
        </Pressable>
        <Pressable
          onPress={() => onShare(clean, remember && clean !== saved)}
          disabled={!ready || !valid}
          style={[styles.contactYes, (!ready || !valid) && styles.disabled]}
          accessibilityRole="button">
          <Text style={styles.contactYesText}>{t('Share')}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: Chat.page },
  missing: { justifyContent: 'center', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  missingText: { fontSize: 15, color: Chat.soft, textAlign: 'center' },
  missingBtn: { paddingHorizontal: Spacing.lg, paddingVertical: 12, borderRadius: Radius.pill, backgroundColor: Colors.red },
  missingBtnText: { color: '#fff', fontWeight: '800' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.sm, height: 56 },
  topBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: Spacing.sm },
  title: { fontSize: 16, fontWeight: '600', color: Chat.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  status: { fontSize: 12, color: Chat.soft },
  alert: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.md, marginBottom: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md },
  alertLabel: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  alertText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: Colors.ink, marginTop: 2 },
  alertOk: { fontSize: 14, fontWeight: '900' },
  feed: { paddingHorizontal: Spacing.md + 4, paddingTop: Spacing.sm, paddingBottom: Spacing.lg, gap: Spacing.lg, flexGrow: 1 },
  summary: { padding: Spacing.md, borderRadius: 14, backgroundColor: Chat.surface, borderWidth: 1, borderColor: Chat.border, gap: 4 },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  summaryTitle: { fontSize: 14, fontWeight: '600', color: Chat.text },
  summaryItem: { fontSize: 14, lineHeight: 21, color: Chat.text },
  summaryTotal: { fontSize: 14, fontWeight: '700', color: Chat.text, marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: Spacing.lg },
  emptyTitle: { fontSize: 24, lineHeight: 30, fontWeight: '600', color: Chat.text, textAlign: 'center', letterSpacing: -0.3, marginTop: 6 },
  emptyBody: { fontSize: 15, lineHeight: 22, color: Chat.soft, textAlign: 'center', maxWidth: 320 },
  userBubble: { alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: Chat.bubble, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10 },
  userText: { fontSize: 16, lineHeight: 23, color: Chat.text },
  message: { gap: 8 },
  messageHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  messageName: { fontSize: 13, fontWeight: '600', color: Chat.soft },
  avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.jadeSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, fontWeight: '800', color: Colors.jade },
  localText: { fontSize: 18, lineHeight: 27, color: Chat.text },
  haoText: { fontSize: 16, lineHeight: 24, color: Chat.text },
  spoken: { flexDirection: 'row', gap: 10, backgroundColor: Chat.spoken, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  spokenText: { flex: 1, fontSize: 19, lineHeight: 28, fontWeight: '600', color: Chat.text },
  whisper: { paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: Chat.border, gap: 4 },
  whisperHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  whisperLabel: { fontSize: 12, fontWeight: '600', color: Chat.soft },
  whisperText: { fontSize: 14, lineHeight: 21, color: Chat.soft },
  dock: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, gap: Spacing.sm },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.errorBorder },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18, color: Colors.redText },
  composer: { backgroundColor: Chat.surface, borderRadius: 24, borderWidth: 1, borderColor: Chat.border, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, gap: 6, ...Shadow, shadowOpacity: 0.06 },
  composerRecording: { borderColor: Colors.red },
  input: { fontSize: 16, lineHeight: 22, color: Chat.text, minHeight: 26, maxHeight: 120, padding: 0 },
  wave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 36 },
  waveBar: { width: 4, borderRadius: 2, backgroundColor: Colors.red },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  toolbarHint: { flex: 1, fontSize: 13, color: Chat.soft },
  mic: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center' },
  micRecording: { backgroundColor: Chat.text },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
  hint: { fontSize: 13, color: Chat.soft, textAlign: 'center' },
  contactCard: { backgroundColor: Chat.surface, borderRadius: 18, borderWidth: 1, borderColor: Chat.border, padding: Spacing.md, gap: 10, ...Shadow, shadowOpacity: 0.06 },
  contactHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contactTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: Chat.text },
  contactBody: { fontSize: 13, lineHeight: 18, color: Chat.soft },
  contactInput: { fontSize: 17, color: Chat.text, borderWidth: 1, borderColor: Chat.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: Chat.page },
  contactRemember: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  contactRememberText: { fontSize: 14, color: Chat.text },
  contactActions: { flexDirection: 'row', gap: Spacing.sm },
  contactNo: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: Chat.border, alignItems: 'center', justifyContent: 'center' },
  contactNoText: { fontSize: 15, fontWeight: '600', color: Chat.text },
  contactYes: { flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: Chat.text, alignItems: 'center', justifyContent: 'center' },
  contactYesText: { fontSize: 15, fontWeight: '600', color: Chat.page },
  sharedContact: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.pill, backgroundColor: Chat.bubble },
  sharedContactText: { fontSize: 13, color: Chat.soft, flexShrink: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: Spacing.md },
  qrSheet: { borderRadius: 32, padding: Spacing.md, backgroundColor: Colors.paper },
  saveBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  saveSheet: { backgroundColor: Chat.page, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.sm, alignItems: 'center' },
  saveTitle: { fontSize: 20, fontWeight: '600', color: Chat.text, marginTop: 4 },
  saveBody: { fontSize: 14, lineHeight: 21, color: Chat.soft, textAlign: 'center', marginBottom: Spacing.sm },
  saveBtn: { alignSelf: 'stretch', minHeight: 50, borderRadius: 14, backgroundColor: Chat.text, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: Chat.page, fontSize: 16, fontWeight: '600' },
  deleteBtn: { alignSelf: 'stretch', minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { color: Colors.red, fontSize: 16, fontWeight: '600' },
}));
