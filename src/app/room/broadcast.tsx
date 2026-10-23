import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AudioInput } from '@shared/ai/types';

import { RoomQr } from '@/components/room-qr';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { forgetHostedRoom, getHostedRoom } from '@/lib/rooms/session';
import { useBroadcastHost } from '@/lib/rooms/use-broadcast-host';
import { useChunkedRecorder } from '@/lib/rooms/use-chunked-recorder';
import { useT } from '@/lib/i18n';

export default function BroadcastRoom() {
  const t = useT();
  // Created on the QR page; listeners may already be waiting.
  const [room] = useState(() => getHostedRoom('broadcast'));
  const host = useBroadcastHost({ code: room?.roomId ?? null });
  const { connected, counts, transcript, questions, error, ended } = host;
  const [tab, setTab] = useState<'transcript' | 'questions'>('transcript');
  const [qrOpen, setQrOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const onChunk = useCallback((audio: AudioInput) => void host.sendChunk(audio), [host]);
  const mic = useChunkedRecorder(onChunk);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [transcript, questions, tab]);

  const listenerTotal = Object.values(counts).reduce((sum, c) => sum + c.count, 0);

  const toggleLive = () => {
    if (mic.active) mic.stop();
    else {
      setQrOpen(false);
      mic.start();
    }
  };

  const endRoom = async () => {
    if (mic.active) await mic.stop();
    host.end();
    forgetHostedRoom('broadcast');
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={endRoom} style={styles.topBtn} accessibilityLabel={t('End broadcast')}>
          <Ionicons name="close" size={20} color={Colors.ink} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{t('Tour broadcast')}</Text>
          <Text style={styles.subtitle}>{!room ? t('No active broadcast') : connected ? t('{count} listening', { count: listenerTotal }) : t('Reconnecting…')}</Text>
        </View>
        <Pressable onPress={() => setQrOpen((o) => !o)} style={styles.topBtn} accessibilityLabel={qrOpen ? t('Hide QR code') : t('Show QR code')}>
          <Ionicons name={qrOpen ? 'chevron-up' : 'qr-code-outline'} size={20} color={Colors.ink} />
        </Pressable>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.body}>
        {!room ? (
          <View style={styles.missing}>
            <Text style={styles.placeholder}>{t('This broadcast has ended. Open your QR code to start a new one.')}</Text>
            <Pressable onPress={() => router.replace('/room')} style={styles.missingBtn}>
              <Text style={styles.missingBtnText}>{t('Show my QR code')}</Text>
            </Pressable>
          </View>
        ) : null}

        {room && qrOpen ? (
          <View style={styles.qrWrap}>
            <RoomQr
              joinUrl={room.joinUrl}
              roomId={room.roomId}
              captionZh="扫码收听实时字幕"
              caption={t('Listeners scan to get live captions in their language')}
            />
          </View>
        ) : null}

        {room ? (
          <View style={styles.consent}>
            <Ionicons name="information-circle" size={20} color={Colors.jade} />
            <Text style={styles.consentText}>
              Your voice is sent to an AI service to transcribe and translate for listeners. Please let your group know
              before you start. 您的语音将由AI处理，用于为听众实时翻译。
            </Text>
          </View>
        ) : null}

        {listenerTotal > 0 ? (
          <View style={styles.counts}>
            {Object.entries(counts).map(([code, c]) => (
              <View key={code} style={styles.countChip}>
                <Text style={styles.countNum}>{c.count}</Text>
                <Text style={styles.countName}>{c.name}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {mic.error ? <Text style={styles.error}>{mic.error}</Text> : null}
        {ended ? <Text style={styles.error}>{t('This broadcast has ended.')}</Text> : null}

        {room ? (
          <View style={styles.segmented}>
            {(['transcript', 'questions'] as const).map((id) => (
              <Pressable key={id} onPress={() => setTab(id)} style={[styles.segment, tab === id && styles.segmentActive]}>
                <Text style={[styles.segmentText, tab === id && styles.segmentTextActive]}>
                  {id === 'transcript'
                    ? `中文字幕 · ${t('Transcript')}`
                    : questions.length
                      ? t('Questions ({count})', { count: questions.length })
                      : t('Questions')}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {room && tab === 'transcript' ? (
          <View style={styles.panel}>
            {transcript.length === 0 ? (
              <Text style={styles.placeholder}>{mic.active ? '正在聆听… Speak in Mandarin.' : t('Press “Go live” and start speaking Mandarin.')}</Text>
            ) : (
              transcript.map((line) => (
                <Text key={line.seq} style={styles.line}>
                  {line.zh}
                </Text>
              ))
            )}
          </View>
        ) : null}

        {room && tab === 'questions' ? (
          <View style={styles.panel}>
            {questions.length === 0 ? (
              <Text style={styles.placeholder}>{t('Listeners’ questions appear here, translated into Chinese.')}</Text>
            ) : (
              questions.map((q) => (
                <View key={q.id} style={styles.question}>
                  <Text style={styles.questionZh}>{q.zh}</Text>
                  <Text style={styles.questionOrig}>
                    {q.language} · {q.original}
                  </Text>
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>

      {room ? (
        <View style={styles.dock}>
          <Pressable
            onPress={toggleLive}
            disabled={ended}
            accessibilityRole="button"
            style={({ pressed }) => [styles.live, mic.active && styles.liveOn, pressed && { opacity: 0.9 }]}>
            {mic.active ? <LevelDot level={mic.level} /> : <Ionicons name="radio" size={22} color="#fff" />}
            <Text style={styles.liveText}>{mic.active ? t('Live · tap to pause') : t('Go live')}</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function LevelDot({ level }: { level?: number }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.35, { duration: 700 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const scale = level === undefined ? 1 : 1 + Math.max(0, Math.min(1, (level + 50) / 40)) * 0.6;
  return <Animated.View style={[styles.levelDot, { transform: [{ scale }] }, style]} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, height: 60 },
  topBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: Colors.ink },
  subtitle: { fontSize: 13, color: Colors.inkSoft, marginTop: 1 },
  body: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl },
  qrWrap: { backgroundColor: Colors.red, borderRadius: 32, padding: Spacing.md },
  consent: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.jadeSoft },
  consentText: { flex: 1, fontSize: 13, lineHeight: 19, color: Colors.ink },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  countChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.pill, backgroundColor: Colors.card, ...Shadow },
  countNum: { fontSize: 15, fontWeight: '900', color: Colors.red },
  countName: { fontSize: 14, fontWeight: '600', color: Colors.ink },
  error: { fontSize: 14, color: Colors.redDark, textAlign: 'center' },
  missing: { alignItems: 'center', gap: Spacing.md, marginTop: Spacing.xl },
  missingBtn: { paddingHorizontal: Spacing.lg, paddingVertical: 12, borderRadius: Radius.pill, backgroundColor: Colors.red },
  missingBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  segmented: { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: Radius.sm, padding: 3, borderWidth: 1, borderColor: Colors.line },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  segmentActive: { backgroundColor: Colors.ink },
  segmentText: { fontSize: 13, fontWeight: '700', color: Colors.inkSoft },
  segmentTextActive: { color: '#fff' },
  panel: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm, minHeight: 160, ...Shadow },
  placeholder: { fontSize: 15, color: Colors.muted, textAlign: 'center', marginVertical: Spacing.lg },
  line: { fontSize: 19, lineHeight: 28, color: Colors.ink, fontWeight: '600' },
  question: { padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.goldSoft, gap: 4 },
  questionZh: { fontSize: 18, fontWeight: '800', color: Colors.ink },
  questionOrig: { fontSize: 13, color: Colors.inkSoft },
  dock: { padding: Spacing.md, backgroundColor: Colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  live: { height: 60, borderRadius: Radius.pill, backgroundColor: Colors.red, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  liveOn: { backgroundColor: Colors.ink },
  liveText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  levelDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FF4D5E' },
});
