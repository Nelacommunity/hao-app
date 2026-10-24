// Place and food cards in Hao's replies, in a swipeable row like Meta AI's and Grok's result cards:
// photo, name in both languages, distance, tags and why Hao suggests it, with Navigate, Talk to staff
// and Save right on the card.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';

import { ChatColors } from '@/components/chat-ui';
import { SpeakButton } from '@/components/speak-button';
import { Colors, Radius, themed } from '@/constants/theme';
import type { PlaceCardData, VisitCardData } from '@/data/place-cards';
import { CategoryMeta, type Place } from '@/data/places';
import { useT } from '@/lib/i18n';
import { formatDistance } from '@/lib/location';
import { navigateTo, reasonLine, talkToStaff } from '@/lib/place-actions';
import { setPlaceSaved } from '@/lib/saved-places';

type Variant = 'place' | 'food';

/** How a rating looks everywhere: thumbs up (liked), thumbs down (didn't) or a neutral dash (it was OK). */
export const RatingStyles = themed(
  () =>
    ({
      '1': { icon: 'thumbs-up', color: Colors.jade },
      '0': { icon: 'remove-circle', color: Colors.muted },
      '-1': { icon: 'thumbs-down', color: Colors.redDark },
    }) as const
);

export function RatingIcon({ rating, size = 14 }: { rating: number | null; size?: number }) {
  const style = rating === 1 || rating === 0 || rating === -1 ? RatingStyles[String(rating) as '1' | '0' | '-1'] : null;
  return style ? <Ionicons name={style.icon} size={size} color={style.color} /> : null;
}

export function formatVisitDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

/** A horizontal, snapping row of cards that peeks the next one so it's obvious you can swipe. */
export function CardCarousel({ children, count }: { children: React.ReactNode; count: number }) {
  const { width } = useWindowDimensions();
  const cardWidth = cardWidthFor(width);
  if (count === 1) return <View style={{ width: cardWidth }}>{children}</View>;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={cardWidth + 12}
      snapToAlignment="start"
      // Bleed to the screen edges of the chat feed (it has 20 px padding).
      style={styles.carousel}
      contentContainerStyle={styles.carouselContent}>
      {children}
    </ScrollView>
  );
}

export const cardWidthFor = (screen: number) => Math.min(300, Math.round(screen * 0.74));

/** A recommended place or restaurant. */
export function PlaceCard({ data, variant, index = 0 }: { data: PlaceCardData; variant: Variant; index?: number }) {
  const t = useT();
  const { width } = useWindowDimensions();
  const { place } = data;
  const [saved, setSaved] = useState(data.saved);
  const reason = reasonLine(data.reason, t);

  const toggleSave = () => {
    const next = !saved;
    setSaved(next);
    setPlaceSaved(place.id, next).catch(() => setSaved(!next));
  };

  return (
    <Animated.View entering={FadeInRight.delay(index * 70).duration(260)} style={[styles.card, { width: cardWidthFor(width) }]}>
      <Pressable onPress={() => openPlace(place)} accessibilityRole="button" accessibilityLabel={place.name}>
        <Photo place={place} height={variant === 'food' ? 120 : 138}>
          <Pressable
            onPress={toggleSave}
            hitSlop={8}
            style={({ pressed }) => [styles.saveBtn, saved && styles.saveBtnOn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ selected: saved }}
            accessibilityLabel={saved ? t('Saved to Want to go. Remove') : t('Save to Want to go')}>
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={17} color={saved ? Colors.ink : '#fff'} />
          </Pressable>
        </Photo>

        <View style={styles.body}>
          <View style={styles.nameRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {place.name}
              </Text>
              {place.nameZh !== place.name ? (
                <Text style={styles.nameZh} numberOfLines={1}>
                  {place.nameZh}
                </Text>
              ) : null}
            </View>
            <SpeakButton text={place.nameZh} size={14} tint={ChatColors.soft} background={ChatColors.userBubble} />
          </View>

          <Text style={styles.meta} numberOfLines={1}>
            {metaLine(place, variant, t(CategoryMeta[place.category].short))}
          </Text>

          <View style={[styles.reason, reason.community ? styles.reasonCommunity : data.reason.kind === 'profile' ? styles.reasonProfile : null]}>
            <Ionicons name={reason.icon} size={15} color={reason.community ? Colors.jade : data.reason.kind === 'profile' ? Colors.goldText : ChatColors.soft} />
            <Text style={[styles.reasonText, reason.community && { color: '#0E6B52' }]} numberOfLines={2}>
              {reason.text}
            </Text>
          </View>

          {place.tags.length || data.myRating !== null ? (
            <View style={styles.tags}>
              {data.myRating !== null ? (
                <View style={[styles.tag, styles.tagMine]}>
                  <RatingIcon rating={data.myRating} size={12} />
                  <Text style={styles.tagText}>{t('You')}</Text>
                </View>
              ) : null}
              {place.tags.slice(0, 3).map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText} numberOfLines={1}>
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>

      <CardActions place={place} />
    </Animated.View>
  );
}

export const FoodCard = (props: { data: PlaceCardData; index?: number }) => <PlaceCard {...props} variant="food" />;

/** A place the user has been, from "where have I been?" in chat. */
export function VisitedCard({ data, index = 0 }: { data: VisitCardData; index?: number }) {
  const t = useT();
  const { width } = useWindowDimensions();
  const { place } = data;
  return (
    <Animated.View entering={FadeInRight.delay(index * 70).duration(260)} style={[styles.card, { width: cardWidthFor(width) }]}>
      <Pressable onPress={() => openPlace(place)} accessibilityRole="button" accessibilityLabel={place.name}>
        <Photo place={place} height={96} />
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {place.name}
          </Text>
          {place.nameZh !== place.name ? (
            <Text style={styles.nameZh} numberOfLines={1}>
              {place.nameZh}
            </Text>
          ) : null}
          <View style={[styles.reason, styles.reasonVisited]}>
            {data.rating !== null ? <RatingIcon rating={data.rating} size={15} /> : <Ionicons name="checkmark-circle" size={15} color={Colors.jade} />}
            <Text style={styles.reasonText} numberOfLines={1}>
              {t('Visited {date}', { date: formatVisitDate(data.visitedAt) })}
            </Text>
          </View>
          {data.note ? (
            <Text style={styles.note} numberOfLines={2}>
              “{data.note}”
            </Text>
          ) : null}
        </View>
      </Pressable>
      <CardActions place={place} />
    </Animated.View>
  );
}

function CardActions({ place }: { place: Place }) {
  const t = useT();
  return (
    <View style={styles.actions}>
      <Pressable
        onPress={() => navigateTo(place)}
        style={({ pressed }) => [styles.action, styles.actionPrimary, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={t('Show the way to {place}', { place: place.name })}>
        <Ionicons name="navigate" size={15} color="#fff" />
        <Text style={[styles.actionText, { color: '#fff' }]} numberOfLines={1}>
          {t('Navigate')}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => talkToStaff(place)}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={t('Talk to staff with Hao interpreting')}>
        <Ionicons name="chatbubbles-outline" size={15} color={ChatColors.text} />
        <Text style={styles.actionText} numberOfLines={1}>
          {t('Talk to staff')}
        </Text>
      </Pressable>
    </View>
  );
}

/** The place's AMap photo with a soft gradient for the overlaid badges, or its category on a tint. */
export function Photo({ place, height, children }: { place: Place; height: number; children?: React.ReactNode }) {
  const t = useT();
  const meta = CategoryMeta[place.category];
  const photo = place.photos[0];
  return (
    <View style={[styles.photo, { height, backgroundColor: `${meta.color}1F` }]}>
      {photo ? (
        <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} recyclingKey={place.id} />
      ) : (
        <Ionicons name={meta.icon} size={Math.round(height * 0.36)} color={meta.color} />
      )}
      <LinearGradient colors={['rgba(0,0,0,0.28)', 'transparent', 'rgba(0,0,0,0.45)']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.badgeRow}>
        <View style={styles.badge}>
          <Ionicons name={meta.icon} size={11} color={meta.color} />
          <Text style={styles.badgeText}>{t(meta.short)}</Text>
        </View>
      </View>
      {place.distanceM !== undefined ? (
        <View style={styles.distance}>
          <Ionicons name="walk" size={12} color="#fff" />
          <Text style={styles.distanceText}>{formatDistance(place.distanceM / 1000)}</Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

function metaLine(place: Place, variant: Variant, fallback: string) {
  const type = place.type || place.typeZh || fallback;
  const parts =
    variant === 'food'
      ? [place.cost ? `¥${Math.round(place.cost)} / 人` : null, type, place.rating ? `★ ${place.rating}` : null]
      : [place.rating ? `★ ${place.rating}` : null, type, place.cost ? `¥${Math.round(place.cost)}` : null];
  return parts.filter(Boolean).join(' · ');
}

export const openPlace = (place: Place) => router.push({ pathname: '/place/[id]', params: { id: place.id } });

const styles = themed(() => StyleSheet.create({
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  carousel: { marginHorizontal: -20 },
  carouselContent: { paddingHorizontal: 20, gap: 12, paddingBottom: 4 },
  card: {
    backgroundColor: ChatColors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ChatColors.border,
    overflow: 'hidden',
  },
  photo: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badgeRow: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.overlay, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', color: Colors.ink },
  distance: { position: 'absolute', left: 10, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 3 },
  distanceText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  saveBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnOn: { backgroundColor: Colors.gold },
  body: { padding: 12, paddingBottom: 8, gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '700', color: ChatColors.text },
  nameZh: { fontSize: 13, color: ChatColors.soft, marginTop: 1 },
  meta: { fontSize: 13, color: ChatColors.soft },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: ChatColors.userBubble,
  },
  reasonCommunity: { backgroundColor: Colors.jadeSoft },
  reasonProfile: { backgroundColor: Colors.goldSoft },
  reasonVisited: { backgroundColor: Colors.jadeSoft, alignSelf: 'flex-start' },
  reasonText: { flex: 1, fontSize: 12.5, lineHeight: 17, fontWeight: '600', color: ChatColors.text },
  tags: { flexDirection: 'row', flexWrap: 'nowrap', gap: 5, overflow: 'hidden' },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill, borderWidth: 1, borderColor: ChatColors.border, maxWidth: 110 },
  tagMine: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.jadeSoft, borderColor: Colors.jadeSoft },
  tagText: { fontSize: 11.5, color: ChatColors.soft },
  note: { fontSize: 13, lineHeight: 18, fontStyle: 'italic', color: ChatColors.soft },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4 },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 36,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: ChatColors.border,
    paddingHorizontal: 8,
  },
  actionPrimary: { backgroundColor: ChatColors.accent, borderColor: ChatColors.accent },
  actionText: { fontSize: 13, fontWeight: '600', color: ChatColors.text, flexShrink: 1 },
}));

