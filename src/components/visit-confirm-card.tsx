// "Did you go to [place]? Did you like it?" — Hao asks once, in chat. Thumbs up / down and optional tags
// confirm the visit (only confirmed visits count anywhere); Skip drops it.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import { TAGS_FOR, type VisitTag } from '@shared/places/config';

import { ChatColors } from '@/components/chat-ui';
import { PlaceThumb } from '@/components/place-thumb';
import { Colors, Radius, themed } from '@/constants/theme';
import type { VisitCardData } from '@/data/place-cards';
import type { IconName } from '@/data/places';
import { tx, useT } from '@/lib/i18n';
import { confirmVisit, dismissVisit } from '@/lib/visits';

export const VisitTagLabels: Record<VisitTag, { label: string; icon: IconName }> = {
  halal: { label: tx('Halal'), icon: 'moon' },
  cheap: { label: tx('Cheap'), icon: 'cash' },
  like_home: { label: tx('Like home'), icon: 'home' },
  good_for_groups: { label: tx('Good for groups'), icon: 'people' },
  spicy: { label: tx('Spicy'), icon: 'flame' },
  clean: { label: tx('Clean'), icon: 'sparkles' },
  quiet: { label: tx('Quiet'), icon: 'volume-mute' },
  good_location: { label: tx('Great location'), icon: 'location' },
  friendly_staff: { label: tx('Friendly staff'), icon: 'happy' },
  great_view: { label: tx('Great view'), icon: 'image' },
  worth_it: { label: tx('Worth it'), icon: 'checkmark-done' },
};

/** A tag as a toggleable chip (on = filled jade), or as a small read-only label when onPress is left out. */
export function TagChip({ tag, on = false, onPress }: { tag: string; on?: boolean; onPress?: () => void }) {
  const t = useT();
  const meta = VisitTagLabels[tag as VisitTag];
  const content = (
    <>
      {meta ? <Ionicons name={meta.icon} size={13} color={on ? Colors.jade : ChatColors.soft} /> : null}
      <Text style={styles.tagText}>{meta ? t(meta.label) : tag}</Text>
    </>
  );
  if (!onPress) return <View style={[styles.tag, styles.tagStatic]}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tag, on && styles.tagOn, pressed && styles.pressed]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}>
      {content}
    </Pressable>
  );
}

/** The tag chips for a place: food, hotel or anything else. */
export const tagsFor = (category: string) => TAGS_FOR[category === 'food' ? 'food' : category === 'hotel' ? 'hotel' : 'other'];

const SOURCE_LABELS: Record<VisitCardData['source'], string> = {
  navigation: tx('You navigated here'),
  voice_room: tx('You talked to staff here'),
  chat: tx('You told Hao'),
  manual: tx('You added it'),
};

type Phase = 'ask' | 'saving' | 'confirmed' | 'skipped';

/** `onChange` gets the answered card, so the chat can save it and never ask again. */
export function VisitConfirmCard({ data, onChange }: { data: VisitCardData; onChange?: (data: VisitCardData) => void }) {
  const t = useT();
  const [rating, setRating] = useState<number | null>(data.rating === 1 || data.rating === -1 ? data.rating : null);
  const [tags, setTags] = useState<string[]>(data.tags);
  const [phase, setPhase] = useState<Phase>(data.status === 'confirmed' ? 'confirmed' : data.status === 'dismissed' ? 'skipped' : 'ask');
  const [error, setError] = useState<string | null>(null);
  const { place } = data;
  const isHotel = place.category === 'hotel';
  const group = place.category === 'food' ? 'food' : place.category === 'hotel' ? 'hotels' : 'places';

  const save = async () => {
    setPhase('saving');
    setError(null);
    try {
      await confirmVisit(data.visitId, rating, tags);
      setPhase('confirmed');
      onChange?.({ ...data, status: 'confirmed', rating, tags });
    } catch (e) {
      setError((e as Error).message);
      setPhase('ask');
    }
  };

  const skip = async () => {
    setPhase('skipped');
    onChange?.({ ...data, status: 'dismissed' });
    dismissVisit(data.visitId).catch(() => {});
  };

  const toggleTag = (tag: string) => setTags((list) => (list.includes(tag) ? list.filter((x) => x !== tag) : [...list, tag]));

  if (phase === 'confirmed') {
    return (
      <Animated.View entering={FadeIn.duration(200)} style={[styles.card, styles.done]}>
        <View style={styles.doneIcon}>
          <Ionicons name="checkmark" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.doneTitle} numberOfLines={1}>
            {t('Added to My Places')}
          </Text>
          <Text style={styles.doneBody} numberOfLines={1}>
            {place.name}
          </Text>
        </View>
        <Pressable onPress={() => router.navigate({ pathname: '/my-places', params: { filter: group } })} hitSlop={8} style={styles.viewBtn}>
          <Text style={styles.viewText}>{t('View')}</Text>
        </Pressable>
      </Animated.View>
    );
  }

  if (phase === 'skipped') {
    return (
      <View style={[styles.card, styles.done]}>
        <Ionicons name="remove-circle-outline" size={18} color={ChatColors.faint} />
        <Text style={[styles.doneBody, { flex: 1 }]}>{t('Okay, I won’t count {place}.', { place: place.name })}</Text>
      </View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(260)} layout={LinearTransition} style={styles.card}>
      <View style={styles.header}>
        <PlaceThumb place={place} size={56} radius={14} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{t(SOURCE_LABELS[data.source])}</Text>
          <Text style={styles.question}>{isHotel ? t('Did you stay at {place}?', { place: place.name }) : t('Did you go to {place}?', { place: place.name })}</Text>
          {place.nameZh !== place.name ? <Text style={styles.zh}>{place.nameZh}</Text> : null}
        </View>
      </View>

      <Text style={styles.sub}>{t('Did you like it?')}</Text>
      <View style={styles.ratingRow}>
        {[
          { value: 1, icon: 'thumbs-up' as const, label: t('Loved it') },
          { value: -1, icon: 'thumbs-down' as const, label: t('Not for me') },
        ].map((option) => {
          const selected = rating === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setRating(selected ? null : option.value)}
              style={({ pressed }) => [styles.rate, selected && styles.rateOn, pressed && styles.pressed]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}>
              <Ionicons name={option.icon} size={18} color={selected ? '#fff' : option.value === 1 ? Colors.jade : Colors.redDark} />
              <Text style={[styles.rateText, selected && { color: '#fff' }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {rating !== null ? (
        <Animated.View entering={FadeIn.duration(200)} style={styles.tags}>
          {tagsFor(place.category).map((tag) => {
            const on = tags.includes(tag);
            return (
              <TagChip key={tag} tag={tag} on={on} onPress={() => toggleTag(tag)} />
            );
          })}
        </Animated.View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.footer}>
        <Pressable onPress={skip} hitSlop={8} style={({ pressed }) => [styles.skip, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.skipText}>{t('Skip')}</Text>
        </Pressable>
        <Pressable
          onPress={save}
          disabled={phase === 'saving'}
          style={({ pressed }) => [styles.confirm, pressed && styles.pressed]}
          accessibilityRole="button">
          {phase === 'saving' ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmText}>{rating === null ? (isHotel ? t('Yes, I stayed') : t('Yes, I went')) : t('Save')}</Text>}
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = themed(() => StyleSheet.create({
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  card: { borderRadius: 20, borderWidth: 1, borderColor: ChatColors.border, backgroundColor: ChatColors.surface, padding: 14, gap: 10 },
  header: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  eyebrow: { fontSize: 12, fontWeight: '600', color: ChatColors.soft },
  question: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: ChatColors.text, marginTop: 1 },
  zh: { fontSize: 13, color: ChatColors.soft, marginTop: 1 },
  sub: { fontSize: 14, color: ChatColors.soft },
  ratingRow: { flexDirection: 'row', gap: 8 },
  rate: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ChatColors.border,
    backgroundColor: ChatColors.surface,
  },
  rateOn: { backgroundColor: ChatColors.accent, borderColor: ChatColors.accent },
  rateText: { fontSize: 14, fontWeight: '600', color: ChatColors.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.pill, borderWidth: 1, borderColor: ChatColors.border, backgroundColor: ChatColors.surface },
  tagStatic: { paddingHorizontal: 8, paddingVertical: 3, borderColor: ChatColors.userBubble, backgroundColor: ChatColors.userBubble },
  tagOn: { backgroundColor: Colors.jadeSoft, borderColor: Colors.jade },
  tagText: { fontSize: 13, color: ChatColors.text },
  error: { fontSize: 13, color: Colors.redDark },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  skip: { paddingVertical: 8, paddingHorizontal: 4 },
  skipText: { fontSize: 14, fontWeight: '600', color: ChatColors.soft },
  confirm: { minWidth: 120, height: 40, paddingHorizontal: 18, borderRadius: Radius.pill, backgroundColor: Colors.jade, alignItems: 'center', justifyContent: 'center' },
  confirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  done: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  doneIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.jade, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 14, fontWeight: '700', color: ChatColors.text },
  doneBody: { fontSize: 13, color: ChatColors.soft },
  viewBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.pill, backgroundColor: ChatColors.userBubble },
  viewText: { fontSize: 13, fontWeight: '600', color: ChatColors.text },
}));
