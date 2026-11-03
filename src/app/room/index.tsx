import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RoomType } from '@shared/rooms/protocol';

import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useAuth, useLanguagePreference } from '@/lib/auth';
import { useHostChannel } from '@/lib/rooms/channel';
import { ensureHostedRoom } from '@/lib/rooms/session';
import { tx, useT } from '@/lib/i18n';

type Tab = 'code' | 'scan';

const MODES: Record<RoomType, { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; zh: string; en: string }> = {
  conversation: {
    label: tx('Talk with a local'),
    icon: 'chatbubbles',
    zh: '请用微信或手机相机扫码，和我对话',
    en: tx('They scan with WeChat or their camera. No app needed.'),
  },
  broadcast: {
    label: tx('Tour broadcast'),
    icon: 'radio',
    zh: '扫码收听实时字幕',
    en: tx('Listeners scan to get live captions in their language.'),
  },
};

const formatCode = (code: string) => code.replace(/(.{5})(?=.)/g, '$1 ');

export default function QrScreen() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('code');
  const focused = useIsFocused();

  return (
    <View style={styles.page}>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.roundBtn} accessibilityLabel={t('Go back')}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <View style={styles.tabs} accessibilityRole="tablist">
            {(['code', 'scan'] as const).map((id) => (
              <Pressable
                key={id}
                onPress={() => setTab(id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === id }}
                style={[styles.tab, tab === id && styles.tabActive]}>
                <Ionicons name={id === 'code' ? 'qr-code' : 'scan'} size={16} color={tab === id ? '#fff' : Colors.inkSoft} />
                <Text style={[styles.tabText, tab === id && styles.tabTextActive]}>{id === 'code' ? t('My code') : t('Scan')}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ width: 40 }} />
        </View>

        {tab === 'code' ? <MyCode active={focused} /> : <Scanner active={focused} />}
      </SafeAreaView>
    </View>
  );
}

// ─── My code ─────────────────────────────────────────────────────────────────
function MyCode({ active }: { active: boolean }) {
  const t = useT();
  const { session, profile } = useAuth();
  const [language] = useLanguagePreference();
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<RoomType>('conversation');
  const navigated = useRef(false);

  // Rooms are just unguessable codes on a Supabase Realtime channel; creating one is instant.
  const room = ensureHostedRoom(mode);
  const name = profile?.display_name || session?.user.email?.split('@')[0] || t('Traveller');
  const qrSize = Math.min(width - 128, 260);
  const linkProblem = !/^https?:\/\//.test(room.joinUrl);
  // Phones only allow the microphone on https pages, and WeChat warns about or blocks plain http links.
  const insecureLink = room.joinUrl.startsWith('http://');

  // Listen on the room channel only while this screen is visible, so the live screen can take over.
  const { presence } = useHostChannel(active ? room.roomId : null, mode, () => {}, name);
  const localPresent = presence.some((p) => p.role === 'local');
  const listeners = presence.filter((p) => p.role === 'listener').length;

  // Like WeChat: the moment they scan and join, go straight into the conversation.
  useEffect(() => {
    if (mode === 'conversation' && localPresent && !navigated.current) {
      navigated.current = true;
      router.replace('/room/conversation');
    }
  }, [mode, localPresent]);

  const switchMode = (next: RoomType) => setMode(next);

  return (
    <View style={styles.codeWrap}>
      <Animated.View entering={FadeIn.duration(250)} style={styles.card}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>{t('{flag} {native} · Hao traveller', { flag: language.flag, native: language.native })}</Text>
          </View>
        </View>

        <View style={styles.modes}>
          {(Object.keys(MODES) as RoomType[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => switchMode(m)}
              accessibilityRole="radio"
              accessibilityState={{ selected: mode === m }}
              style={[styles.mode, mode === m && styles.modeActive]}>
              <Ionicons name={MODES[m].icon} size={15} color={mode === m ? Colors.ink : Colors.muted} />
              <Text style={[styles.modeText, mode === m && styles.modeTextActive]} numberOfLines={1}>
                {t(MODES[m].label)}
              </Text>
            </Pressable>
          ))}
        </View>


        <View style={[styles.qrBox, { width: qrSize + 24, height: qrSize + 24 }]}>
          {/* Always dark on white, whatever the theme, so every scanner reads it. */}
          <QRCode value={room.joinUrl} size={qrSize} color="#111111" backgroundColor="#fff" ecl="M" />
        </View>

        <Text style={styles.captionZh}>{MODES[mode].zh}</Text>
        <Text style={styles.caption}>{t(MODES[mode].en)}</Text>
        <Text style={styles.code}>{formatCode(room.roomId)}</Text>
        {linkProblem ? (
          <Text style={styles.linkProblem}>{t('Set EXPO_PUBLIC_WEB_URL (or start Expo with --tunnel) so other phones can open this link.')}</Text>
        ) : insecureLink ? (
          <Text style={styles.linkProblem}>
            {t('This link is not https, so WeChat may block it and their microphone won’t work. Set EXPO_PUBLIC_WEB_URL to an https address.')}
          </Text>
        ) : null}
      </Animated.View>

      <View style={styles.below}>
        {mode === 'conversation' ? (
          <View style={styles.waiting}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.waitingText}>{t('Waiting for them to scan…')}</Text>
          </View>
        ) : (
          <Pressable
            onPress={() => router.replace('/room/broadcast')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.whiteBtn, pressed && styles.pressed]}>
            <Ionicons name="radio" size={20} color="#fff" />
            <Text style={styles.whiteBtnText}>{listeners > 0 ? t('Start broadcast · {count} waiting', { count: listeners }) : t('Start broadcast')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Scan ────────────────────────────────────────────────────────────────────
function Scanner({ active }: { active: boolean }) {
  const t = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<string | null>(null);
  const locked = useRef(false);
  const { width } = useWindowDimensions();
  const frame = Math.min(width - 96, 280);

  const onScanned = async ({ data }: BarcodeScanningResult) => {
    if (locked.current) return;
    locked.current = true;
    // Hao codes open the join page in an in-app browser; anything else is shown first.
    if (/\/join\/[A-Za-z0-9]{4,16}\/?$/.test(data)) {
      await WebBrowser.openBrowserAsync(data, { toolbarColor: Colors.red, controlsColor: '#fff' });
      locked.current = false;
    } else {
      setResult(data);
    }
  };

  const dismiss = () => {
    setResult(null);
    locked.current = false;
  };

  if (!permission) return <View style={{ flex: 1 }} />;

  if (!permission.granted) {
    return (
      <View style={styles.permission}>
        <View style={styles.permissionIcon}>
          <Ionicons name="camera" size={34} color={Colors.red} />
        </View>
        <Text style={styles.permissionTitle}>{t('Scan QR codes')}</Text>
        <Text style={styles.permissionBody}>{t('Allow camera access to scan a guide’s tour code or another Hao user’s code.')}</Text>
        <Pressable
          onPress={permission.canAskAgain ? requestPermission : () => Linking.openSettings()}
          style={({ pressed }) => [styles.whiteBtn, pressed && styles.pressed]}>
          <Text style={styles.whiteBtnText}>{permission.canAskAgain ? t('Allow camera') : t('Open settings')}</Text>
        </Pressable>
      </View>
    );
  }

  const isUrl = !!result && /^https?:\/\//i.test(result);

  return (
    <View style={styles.scanWrap}>
      <View style={[styles.camera, { width: frame + 48, height: frame + 48 }]}>
        {active ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={result ? undefined : onScanned}
          />
        ) : null}
        <View style={[styles.frame, { width: frame, height: frame }]} pointerEvents="none">
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
        </View>
      </View>

      <Text style={styles.scanHint}>{t('Point at a Hao QR code to join a tour or conversation')}</Text>

      {result ? (
        <Animated.View entering={FadeIn.duration(200)} style={styles.resultCard}>
          <Text style={styles.resultLabel}>{isUrl ? t('Link found') : t('QR code text')}</Text>
          <Text style={styles.resultText} numberOfLines={3} selectable>
            {result}
          </Text>
          <View style={styles.resultActions}>
            <Pressable onPress={dismiss} style={[styles.resultBtn, styles.resultBtnGhost]}>
              <Text style={styles.resultBtnGhostText}>{t('Scan again')}</Text>
            </Pressable>
            {isUrl ? (
              <Pressable
                onPress={async () => {
                  await WebBrowser.openBrowserAsync(result);
                  dismiss();
                }}
                style={styles.resultBtn}>
                <Text style={styles.resultBtnText}>{t('Open')}</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, height: 60 },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  page: { flex: 1, backgroundColor: Colors.paper },
  tabs: { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: Radius.pill, padding: 4 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.pill },
  tabActive: { backgroundColor: Colors.strong },
  tabText: { color: Colors.inkSoft, fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: '#fff' },

  codeWrap: { flex: 1, paddingHorizontal: Spacing.lg, justifyContent: 'center' },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 28,
    padding: Spacing.lg,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, alignSelf: 'stretch' },
  avatar: { width: 52, height: 52, borderRadius: 16, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontWeight: '900', color: Colors.gold },
  name: { fontSize: 19, fontWeight: '800', color: Colors.ink },
  meta: { fontSize: 13, color: Colors.muted, marginTop: 2 },
  modes: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    backgroundColor: Colors.paper,
    borderRadius: Radius.md,
    padding: 4,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  mode: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 12 },
  modeActive: { backgroundColor: Colors.strong, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
  modeText: { fontSize: 13, fontWeight: '700', color: Colors.muted },
  modeTextActive: { color: Colors.ink },
  // The white card around the code, like WeChat's in dark mode.
  qrBox: { alignItems: 'center', justifyContent: 'center', marginTop: Spacing.lg, marginBottom: Spacing.md, backgroundColor: '#fff', borderRadius: Radius.md },
  qrError: { alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md },
  qrErrorText: { fontSize: 13, lineHeight: 19, color: Colors.inkSoft, textAlign: 'center' },
  retry: { paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.pill, backgroundColor: Colors.red },
  retryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  captionZh: { fontSize: 17, fontWeight: '800', color: Colors.ink, textAlign: 'center' },
  caption: { fontSize: 13, color: Colors.muted, textAlign: 'center', marginTop: 4 },
  code: { fontSize: 13, fontWeight: '800', color: Colors.red, letterSpacing: 2, marginTop: Spacing.sm },
  linkProblem: { fontSize: 12, color: Colors.redDark, textAlign: 'center', marginTop: Spacing.sm },
  below: { minHeight: 88, justifyContent: 'center', paddingTop: Spacing.lg },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  waitingText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  whiteBtn: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignSelf: 'stretch',
    height: 56,
    borderRadius: Radius.pill,
    backgroundColor: Colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whiteBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },

  scanWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg, gap: Spacing.lg },
  camera: { borderRadius: 32, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  frame: { position: 'absolute' },
  corner: { position: 'absolute', width: 36, height: 36, borderColor: Colors.gold },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 16 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 },
  scanHint: { color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  resultCard: { alignSelf: 'stretch', backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm },
  resultLabel: { fontSize: 12, fontWeight: '800', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  resultText: { fontSize: 15, color: Colors.ink },
  resultActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  resultBtn: { flex: 1, height: 46, borderRadius: Radius.pill, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center' },
  resultBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  resultBtnGhost: { backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.line },
  resultBtnGhostText: { color: Colors.ink, fontWeight: '800', fontSize: 15 },

  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg, gap: Spacing.md },
  permissionIcon: { width: 80, height: 80, borderRadius: 26, backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center' },
  permissionTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  permissionBody: { fontSize: 15, lineHeight: 22, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginBottom: Spacing.sm },
}));
