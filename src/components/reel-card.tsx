import Ionicons from '@expo/vector-icons/Ionicons';
import * as Speech from 'expo-speech';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { Radius, Spacing } from '@/constants/theme';
import { DishPhoto, PlacePhoto, photoFor, type Photo } from '@/data/photos';
import { CategoryMeta, Cities } from '@/data/places';
import type { ReelCard as Card, TodayInfo, Upcoming } from '@/lib/discover';
import { useT, type T } from '@/lib/i18n';

type Props = {
  card: Card;
  height: number;
  /** Space covered by the screen header at the top. */
  topInset: number;
  liked: boolean;
  onLike: () => void;
  onShare: () => void;
  onOpen?: () => void;
  /** BCP 47 tag of the user's language, for dates. */
  locale: string;
};

const say = (zh: string) => {
  Speech.stop();
  Speech.speak(zh, { language: 'zh-CN', rate: 0.85 });
};

// Darken a hex colour for the bottom of a gradient.
function shade(hex: string, amount = 0.45) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(c * (1 - amount)).toString(16).padStart(2, '0');
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/** One full-screen Discover card: a big picture-like header and the story at the bottom, like a reel. */
export function ReelCard({ card, height, topInset, liked, onLike, onShare, onOpen, locale }: Props) {
  const t = useT();
  const v = view(card, t, locale);

  return (
    <LinearGradient colors={v.colors} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={[styles.card, { height }]}>
      {v.photo ? (
        <>
          <Image source={v.photo.source} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} accessibilityIgnoresInvertColors />
          {/* Darken the top and bottom so the header and story stay readable on any photo. */}
          <LinearGradient colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']} style={styles.scrimTop} pointerEvents="none" />
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.9)']} locations={[0, 0.45, 1]} style={styles.scrimBottom} pointerEvents="none" />
        </>
      ) : v.watermark ? (
        <Text style={styles.watermark}>{v.watermark}</Text>
      ) : null}

      <View style={[styles.top, { paddingTop: topInset }]}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{v.badge}</Text>
        </View>
      </View>

      {card.kind === 'today' ? (
        <TodayBody today={card.today} t={t} locale={locale} />
      ) : (
        <>
          {v.photo ? (
            <View style={{ flex: 1 }} />
          ) : (
            <Animated.Text entering={FadeInDown.duration(400)} style={styles.emoji}>
              {v.emoji}
            </Animated.Text>
          )}
          <Animated.View entering={FadeInUp.duration(400)} style={styles.bottom}>
            <Text style={styles.title}>{v.title}</Text>
            {v.zh ? (
              <Pressable onPress={() => say(v.zh!)} style={styles.zhRow} accessibilityRole="button" accessibilityLabel={t('Play pronunciation of {text}', { text: v.zh })}>
                <Text style={styles.zh}>{v.zh}</Text>
                {v.pinyin ? <Text style={styles.pinyin}>{v.pinyin}</Text> : null}
                <Ionicons name="volume-high" size={16} color="rgba(255,255,255,0.85)" />
              </Pressable>
            ) : null}
            {v.chips.length ? (
              <View style={styles.chips}>
                {v.chips.map((c) => (
                  <View key={c} style={styles.chip}>
                    <Text style={styles.chipText}>{c}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {v.body ? <Text style={styles.body}>{v.body}</Text> : null}
            {v.extra}
            {v.tip ? (
              <View style={styles.tip}>
                <Text style={styles.tipText}>💡 {v.tip}</Text>
              </View>
            ) : null}
            {v.photo ? <PhotoCredit photo={v.photo} label={t('Photo')} /> : null}
          </Animated.View>
        </>
      )}

      {card.kind !== 'today' ? (
        <View style={styles.rail}>
          <RailButton icon={liked ? 'heart' : 'heart-outline'} color={liked ? '#FF4D6D' : '#fff'} label={card.kind === 'place' ? t(liked ? 'Saved' : 'Save') : t('Like')} onPress={onLike} />
          <RailButton icon="paper-plane-outline" label={t('Share')} onPress={onShare} />
          {v.zh ? <RailButton icon="volume-high-outline" label={t('Listen')} onPress={() => say(v.zh!)} /> : null}
          {onOpen ? <RailButton icon="navigate-outline" label={t('Go')} onPress={onOpen} /> : null}
        </View>
      ) : null}
    </LinearGradient>
  );
}

/** Licence credit for the photo (Wikimedia Commons); tapping opens the source page. */
function PhotoCredit({ photo, label }: { photo: Photo; label: string }) {
  return (
    <Pressable onPress={() => Linking.openURL(photo.url).catch(() => {})} hitSlop={6} accessibilityRole="link">
      <Text style={styles.credit} numberOfLines={1}>
        📷 {label}: {photo.credit}
      </Text>
    </Pressable>
  );
}

function RailButton({ icon, label, onPress, color = '#fff' }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.railBtn, pressed && { transform: [{ scale: 0.92 }] }]} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={30} color={color} style={styles.railIcon} />
      <Text style={styles.railLabel}>{label}</Text>
    </Pressable>
  );
}

const countdown = (t: T, days: number) => (days === 1 ? t('Tomorrow') : t('In {count} days', { count: days }));

function TodayBody({ today, t, locale }: { today: TodayInfo; t: T; locale: string }) {
  const date = today.date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const headline = today.festival
    ? t('Today is {name}', { name: t(today.festival.name) })
    : today.term
      ? t('Today is {name}', { name: t(today.term.name) })
      : t('A new day to explore China');
  const story = today.festival ? t(today.festival.body) : today.term ? t(today.term.custom) : t('Swipe up for today’s place, dish and bit of culture.');
  return (
    <View style={styles.todayWrap}>
      <Animated.View entering={FadeInDown.duration(450)}>
        <Text style={styles.todayDate}>{date}</Text>
        {today.lunar ? <Text style={styles.todayLunar}>农历 {today.lunar}</Text> : null}
        <Text style={styles.todayHeadline}>{headline}</Text>
        <Text style={styles.todayStory}>{story}</Text>
        {today.zodiac ? (
          <View style={styles.zodiac}>
            <Text style={styles.zodiacText}>
              {today.zodiac.emoji} {t(today.zodiac.animal)} · {today.zodiac.zh}
            </Text>
          </View>
        ) : null}
      </Animated.View>

      {today.upcoming.length ? (
        <Animated.View entering={FadeInUp.delay(150).duration(450)} style={styles.upcoming}>
          <Text style={styles.upcomingTitle}>{t('Coming up')}</Text>
          {today.upcoming.map((u) => (
            <UpcomingRow key={`${u.kind}-${u.item.zh}`} u={u} t={t} />
          ))}
        </Animated.View>
      ) : null}

      <View style={styles.swipeHint}>
        <Ionicons name="chevron-up" size={22} color="#fff" />
        <Text style={styles.swipeText}>{t('Swipe up')}</Text>
      </View>
    </View>
  );
}

function UpcomingRow({ u, t }: { u: Upcoming; t: T }) {
  const name = t(u.item.name);
  const emoji = u.kind === 'festival' ? u.item.emoji : '🌗';
  return (
    <View style={styles.upRow}>
      <Text style={styles.upEmoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.upName} numberOfLines={1}>
          {name} · {u.item.zh}
        </Text>
        {u.kind === 'term' ? <Text style={styles.upSub}>{t('Solar term · around this date')}</Text> : null}
      </View>
      <Text style={styles.upDays}>{countdown(t, u.days)}</Text>
    </View>
  );
}

type View_ = {
  colors: [string, string];
  photo?: Photo;
  badge: string;
  emoji?: string;
  watermark?: string;
  title?: string;
  zh?: string;
  pinyin?: string;
  chips: string[];
  body?: string;
  tip?: string;
  extra?: React.ReactNode;
};

function view(card: Card, t: T, locale: string): View_ {
  switch (card.kind) {
    case 'today':
      return {
        colors: card.today.festival?.colors ?? ['#D7263D', '#5E0A16'],
        badge: `📅 ${t('Today in China')}`,
        watermark: card.today.festival?.zh.slice(0, 1) ?? card.today.term?.zh.slice(0, 1) ?? '今',
        chips: [],
      };
    case 'place': {
      const p = card.place;
      const meta = CategoryMeta[p.category];
      const city = Cities.find((c) => c.id === p.city);
      return {
        colors: [meta.color, shade(meta.color, 0.6)],
        photo: photoFor(PlacePhoto[p.id]),
        badge: `📍 ${card.daily ? t('Place of the day') : t(meta.label)} · ${city ? t(city.name) : ''}`,
        emoji: p.emoji,
        watermark: p.nameZh.slice(0, 1),
        title: t(p.name),
        zh: p.nameZh,
        chips: [`★ ${p.rating}`, t(p.hours), t(p.ticket)].filter(Boolean),
        body: t(p.description),
        tip: t(p.tip),
      };
    }
    case 'dish': {
      const d = card.dish;
      return {
        colors: ['#E4572E', '#6E1F0B'],
        photo: photoFor(DishPhoto[d.id]),
        badge: `🍜 ${card.daily ? t('Dish of the day') : t('Taste of China')} · ${t(d.region)}`,
        emoji: d.emoji,
        watermark: d.nameZh.slice(0, 1),
        title: t(d.name),
        zh: d.nameZh,
        pinyin: d.pinyin,
        chips: [d.price, d.spice ? '🌶️'.repeat(d.spice) : t('Not spicy')],
        body: t(d.description),
        extra: (
          <Pressable onPress={() => say(d.orderZh)} style={styles.order} accessibilityRole="button">
            <Text style={styles.orderLabel}>{t('Order like a local')}</Text>
            <Text style={styles.orderZh}>{d.orderZh}</Text>
            <Text style={styles.orderEn}>{t(d.orderEn)}</Text>
          </Pressable>
        ),
      };
    }
    case 'culture':
      return {
        colors: card.item.colors,
        photo: photoFor(card.item.id),
        badge: `🏮 ${card.daily ? t('Culture of the day') : t('Culture')}`,
        emoji: card.item.emoji,
        watermark: card.item.zh.slice(0, 1),
        title: t(card.item.title),
        zh: card.item.zh,
        pinyin: card.item.pinyin,
        chips: [],
        body: t(card.item.body),
        tip: t(card.item.tip),
      };
    case 'festival': {
      const f = card.item;
      const date = f.dates.map((d) => new Date(`${d}T00:00:00`)).find((d) => d.getTime() >= Date.now() - 86_400_000);
      return {
        colors: f.colors,
        photo: photoFor(f.id),
        badge: card.days === 0 ? `🎉 ${t('Today')}` : `📅 ${countdown(t, card.days)}`,
        emoji: f.emoji,
        watermark: f.zh.slice(0, 1),
        title: t(f.name),
        zh: f.zh,
        chips: date ? [date.toLocaleDateString(locale, { day: 'numeric', month: 'long' })] : [],
        body: t(f.body),
        tip: t(f.tip),
      };
    }
    case 'phrase':
      return {
        colors: ['#1F9D7A', '#0B3D2F'],
        badge: `🗣️ ${t('Phrase of the day')} · ${t(card.group)}`,
        emoji: '💬',
        watermark: card.phrase.zh.slice(0, 1),
        title: t(card.phrase.en),
        zh: card.phrase.zh,
        pinyin: card.phrase.pinyin,
        chips: [],
        tip: t('Tap the speaker, then say it out loud a few times.'),
      };
  }
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 } as const;

const styles = StyleSheet.create({
  card: { width: '100%', overflow: 'hidden', justifyContent: 'space-between' },
  scrimTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 180 },
  scrimBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '65%' },
  credit: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600' },
  watermark: { position: 'absolute', right: -30, top: '12%', fontSize: 300, fontWeight: '900', color: 'rgba(255,255,255,0.08)' },
  top: { paddingHorizontal: Spacing.lg, flexDirection: 'row' },
  badge: { backgroundColor: 'rgba(0,0,0,0.22)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.pill, marginTop: 8 },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  emoji: { fontSize: 120, textAlign: 'center' },
  bottom: { paddingLeft: Spacing.lg, paddingRight: 84, paddingBottom: Spacing.xl, gap: 8 },
  title: { color: '#fff', fontSize: 30, fontWeight: '900', lineHeight: 36, ...shadow },
  zhRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  zh: { color: '#fff', fontSize: 20, fontWeight: '800' },
  pinyin: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  body: { color: 'rgba(255,255,255,0.95)', fontSize: 16, lineHeight: 23, fontWeight: '500', ...shadow },
  tip: { backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: Radius.md, padding: 12 },
  tipText: { color: '#fff', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  order: { backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: Radius.md, padding: 12, gap: 2 },
  orderLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  orderZh: { color: '#fff', fontSize: 18, fontWeight: '800' },
  orderEn: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  rail: { position: 'absolute', right: 10, bottom: Spacing.xl + 8, alignItems: 'center', gap: 18 },
  railBtn: { alignItems: 'center', gap: 2, minWidth: 56 },
  railIcon: shadow,
  railLabel: { color: '#fff', fontSize: 11, fontWeight: '700', ...shadow },
  todayWrap: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, justifyContent: 'center', gap: Spacing.xl },
  todayDate: { color: 'rgba(255,255,255,0.85)', fontSize: 16, fontWeight: '700' },
  todayLunar: { color: '#F2B33D', fontSize: 16, fontWeight: '800', marginTop: 2 },
  todayHeadline: { color: '#fff', fontSize: 38, lineHeight: 44, fontWeight: '900', marginTop: 12, ...shadow },
  todayStory: { color: 'rgba(255,255,255,0.92)', fontSize: 17, lineHeight: 24, marginTop: 10 },
  zodiac: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 6, marginTop: 14 },
  zodiacText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  upcoming: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: Radius.lg, padding: Spacing.md, gap: 10 },
  upcomingTitle: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  upRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  upEmoji: { fontSize: 24 },
  upName: { color: '#fff', fontSize: 15, fontWeight: '800' },
  upSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
  upDays: { color: '#F2B33D', fontSize: 13, fontWeight: '800' },
  swipeHint: { alignItems: 'center', paddingBottom: Spacing.lg },
  swipeText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' },
});
