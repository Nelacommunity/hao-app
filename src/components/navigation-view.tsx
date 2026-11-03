import Ionicons from '@expo/vector-icons/Ionicons';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Maneuver } from '@shared/places/route';

import { Colors, Radius, Shadow, Spacing, themed } from '@/constants/theme';
import type { Place } from '@/data/places';
import { formatDuration, formatMeters, ManeuverText, type NavProgress, type TravelMode } from '@/lib/directions';
import { useT } from '@/lib/i18n';
import { useTravellerLanguage } from '@/lib/language-store';

const BLUE = '#2576FF';

const ICON: Record<Maneuver, keyof typeof Ionicons.glyphMap> = {
  depart: 'navigate',
  straight: 'arrow-up',
  left: 'arrow-back',
  right: 'arrow-forward',
  'slight-left': 'arrow-up',
  'slight-right': 'arrow-up',
  'sharp-left': 'arrow-back',
  'sharp-right': 'arrow-forward',
  'keep-left': 'arrow-up',
  'keep-right': 'arrow-up',
  uturn: 'return-down-back',
  roundabout: 'refresh',
  arrive: 'flag',
};
// Bear/keep left and right share the straight arrow, tilted.
const TILT: Partial<Record<Maneuver, string>> = { 'slight-left': '-45deg', 'keep-left': '-25deg', 'slight-right': '45deg', 'keep-right': '25deg' };

// Say the next turn when it's this close (metres), and again just before it.
const ANNOUNCE_M: Record<TravelMode, number> = { foot: 60, bike: 120, car: 300 };
const NOW_M: Record<TravelMode, number> = { foot: 15, bike: 25, car: 50 };

type Props = {
  place: Place;
  mode: TravelMode;
  progress: NavProgress | null;
  /** A new route is being fetched (the user left the old one). */
  rerouting: boolean;
  approximate: boolean;
  onEnd: () => void;
};

/** Turn-by-turn guidance over the map: the next turn on top, time and distance left at the bottom. */
export function NavigationView({ place, mode, progress, rerouting, approximate, onEnd }: Props) {
  const t = useT();
  const language = useTravellerLanguage();
  const [muted, setMuted] = useMutedVoice();

  const next = progress?.next ?? null;
  const instruction = !progress
    ? t('Finding your position…')
    : progress.arrived
      ? t('You have arrived')
      : approximate
        ? t('Head towards {place}', { place: place.name })
        : next
          ? next.road && next.maneuver !== 'arrive'
            ? t('{action} onto {road}', { action: t(ManeuverText[next.maneuver]), road: next.road })
            : t(ManeuverText[next.maneuver])
          : t(ManeuverText.arrive);
  const maneuver: Maneuver = progress?.arrived ? 'arrive' : approximate ? 'depart' : (next?.maneuver ?? 'straight');

  // Voice: announce each turn once when it's near, once more right before it, and the arrival.
  const said = useRef(new Set<string>());
  useEffect(() => {
    if (!progress || muted) return;
    const speak = (key: string, text: string) => {
      if (said.current.has(key)) return;
      said.current.add(key);
      Speech.stop();
      Speech.speak(text, { language: language.speech, rate: 0.95 });
    };
    if (progress.arrived) return speak('arrived', t('You have arrived at {place}', { place: place.name }));
    if (!next || approximate) return;
    const id = `${next.start}:${next.maneuver}`;
    if (progress.nextInM <= NOW_M[mode]) speak(`${id}:now`, instruction);
    else if (progress.nextInM <= ANNOUNCE_M[mode]) speak(`${id}:soon`, t('In {distance}, {instruction}', { distance: formatMeters(progress.nextInM), instruction }));
  }, [progress, next, muted, mode, instruction, approximate, language.speech, place.name, t]);

  useEffect(() => () => void Speech.stop(), []);

  // The clock for the arrival time, refreshed every 15 s.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const eta = progress ? new Date(now + progress.remainingS * 1000) : null;

  return (
    <>
      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <Animated.View entering={FadeInDown.duration(200)} style={[styles.banner, progress?.arrived && { backgroundColor: Colors.jade }]}>
          <View style={styles.bannerIcon}>
            <Ionicons name={ICON[maneuver]} size={34} color="#fff" style={TILT[maneuver] ? { transform: [{ rotate: TILT[maneuver]! }] } : undefined} />
          </View>
          <View style={{ flex: 1 }}>
            {progress && !progress.arrived && next && !approximate ? (
              <Text style={styles.bannerDistance}>{formatMeters(progress.nextInM)}</Text>
            ) : null}
            <Text style={styles.bannerText} numberOfLines={3}>
              {instruction}
            </Text>
            {rerouting ? <Text style={styles.bannerSub}>{t('Finding a new route…')}</Text> : null}
            {!rerouting && progress?.currentRoad && !progress.arrived ? (
              <Text style={styles.bannerSub} numberOfLines={1}>
                {t('On {road}', { road: progress.currentRoad })}
              </Text>
            ) : null}
          </View>
          <Pressable onPress={() => setMuted(!muted)} hitSlop={10} style={styles.mute} accessibilityLabel={muted ? t('Turn voice guidance on') : t('Turn voice guidance off')}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color="#fff" />
          </Pressable>
        </Animated.View>
      </SafeAreaView>

      <Animated.View entering={FadeInUp.duration(200)} style={styles.bottom}>
        <SafeAreaView edges={['bottom']} style={styles.bottomInner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.remaining}>{progress ? formatDuration(progress.remainingS) : '–'}</Text>
            <Text style={styles.remainingSub} numberOfLines={1}>
              {progress ? `${formatMeters(progress.remainingM)} · ${t('Arrive {time}', { time: clock(eta!) })}` : place.name}
            </Text>
            {approximate ? <Text style={styles.estimate}>{t('No street route here: follow the line towards the place.')}</Text> : null}
          </View>
          <Pressable onPress={onEnd} style={({ pressed }) => [styles.end, pressed && { opacity: 0.85 }]} accessibilityRole="button">
            <Text style={styles.endText}>{progress?.arrived ? t('Done') : t('End')}</Text>
          </Pressable>
        </SafeAreaView>
      </Animated.View>
    </>
  );
}

const clock = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

// Voice guidance on/off, remembered on this device.
const MUTE_KEY = 'hao.nav.muted';
function useMutedVoice(): [boolean, (v: boolean) => void] {
  const [muted, setMuted] = useState(() => {
    try {
      return globalThis.localStorage?.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const set = (v: boolean) => {
    setMuted(v);
    if (v) Speech.stop();
    try {
      globalThis.localStorage?.setItem(MUTE_KEY, v ? '1' : '0');
    } catch {
      // Kept for this session only.
    }
  };
  return [muted, set];
}

const styles = themed(() => StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, backgroundColor: BLUE, ...Shadow },
  bannerIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  bannerDistance: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  bannerText: { color: '#fff', fontSize: 17, fontWeight: '700', lineHeight: 23 },
  bannerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', marginTop: 2 },
  mute: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: Colors.card, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, ...Shadow },
  bottomInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.md },
  remaining: { fontSize: 26, fontWeight: '800', color: Colors.jade, letterSpacing: -0.5 },
  remainingSub: { fontSize: 14, color: Colors.inkSoft, marginTop: 2 },
  estimate: { fontSize: 12, color: Colors.goldText, marginTop: 4 },
  end: { height: 48, paddingHorizontal: Spacing.lg, borderRadius: Radius.pill, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center' },
  endText: { color: '#fff', fontSize: 16, fontWeight: '800' },
}));
