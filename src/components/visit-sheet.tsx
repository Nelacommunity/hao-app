// One visited place in My Places / My Food: when you went, your rating, tags and note (all editable),
// with Navigate, Talk to staff, Share and Delete.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatColors } from '@/components/chat-ui';
import { formatVisitDate, openPlace, Photo, RatingIcon, RatingStyles } from '@/components/place-card';
import { SpeakButton } from '@/components/speak-button';
import { TagChip, tagsFor } from '@/components/visit-confirm-card';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import type { VisitCardData } from '@/data/place-cards';
import { isPlaceId } from '@/data/places';
import { useT } from '@/lib/i18n';
import { navigateTo, sharePlace, talkToStaff } from '@/lib/place-actions';
import { deleteVisit, updateVisit } from '@/lib/visits';

type Props = {
  visit: VisitCardData | null;
  onClose: () => void;
  onChange: (visit: VisitCardData) => void;
  onDeleted: (visitId: string) => void;
};

export function VisitSheet({ visit, onClose, onChange, onDeleted }: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  // The screen gives the sheet key={visitId}, so the draft starts from each visit's note.
  const [note, setNote] = useState(visit?.note ?? '');

  if (!visit) return null;
  const { place } = visit;

  const save = (changes: Partial<Pick<VisitCardData, 'rating' | 'tags' | 'note'>>) => {
    onChange({ ...visit, ...changes });
    updateVisit(visit.visitId, changes).catch(() => onChange(visit));
  };

  const confirmDelete = () => {
    const run = () => {
      onDeleted(visit.visitId);
      deleteVisit(visit.visitId).catch(() => {});
    };
    if (Platform.OS === 'web') {
      run();
      return;
    }
    Alert.alert(t('Delete this visit?'), t('{place} will be removed from your list and from community stats.', { place: place.name }), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Delete'), style: 'destructive', onPress: run },
    ]);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('Close')} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.md }]}>
        <ScrollView contentContainerStyle={{ gap: Spacing.md }} keyboardShouldPersistTaps="handled">
          <View style={styles.photoWrap}>
            <Photo place={place} height={170} />
            <Pressable onPress={onClose} style={styles.close} accessibilityLabel={t('Close')}>
              <Ionicons name="close" size={18} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{place.name}</Text>
              {place.nameZh !== place.name ? <Text style={styles.zh}>{place.nameZh}</Text> : null}
              <Text style={styles.date}>
                {place.category === 'hotel' ? t('Stayed {date}', { date: formatVisitDate(visit.visitedAt) }) : t('Visited {date}', { date: formatVisitDate(visit.visitedAt) })}
              </Text>
            </View>
            <SpeakButton text={place.nameZh} tint={ChatColors.text} background={ChatColors.userBubble} />
          </View>

          <View style={styles.actions}>
            <Action icon="navigate" label={t('Navigate')} primary onPress={() => { onClose(); navigateTo(place); }} />
            <Action icon="chatbubbles-outline" label={t('Talk to staff')} onPress={() => { onClose(); talkToStaff(place); }} />
            <Action icon="share-outline" label={t('Share')} onPress={() => sharePlace(place)} />
          </View>

          <Text style={styles.label}>{t('My rating')}</Text>
          <View style={styles.ratingRow}>
            {[
              { value: 1, label: t('Loved it') },
              { value: 0, label: t('It was OK') },
              { value: -1, label: t('Not for me') },
            ].map((o) => {
              const on = visit.rating === o.value;
              return (
                <Pressable key={o.value} onPress={() => save({ rating: on ? null : o.value })} style={[styles.rate, on && styles.rateOn]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  {on ? (
                    <Ionicons name={RatingStyles[String(o.value) as '1' | '0' | '-1'].icon} size={18} color="#fff" />
                  ) : (
                    <RatingIcon rating={o.value} size={18} />
                  )}
                  <Text style={[styles.rateText, on && { color: '#fff' }]} numberOfLines={1}>
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>{t('Tags')}</Text>
          <View style={styles.tags}>
            {tagsFor(place.category).map((tag) => {
              const on = visit.tags.includes(tag);
              return (
                <TagChip key={tag} tag={tag} on={on} onPress={() => save({ tags: on ? visit.tags.filter((x) => x !== tag) : [...visit.tags, tag] })} />
              );
            })}
          </View>

          <Text style={styles.label}>{t('My review')}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            onBlur={() => note.trim() !== (visit.note ?? '') && save({ note: note.trim() || null })}
            placeholder={place.category === 'hotel' ? t('How was the room, the bed, breakfast, the area?') : place.category === 'food' ? t('What did you order? Would you go back?') : t('What did you like? Any tips for next time?')}
            placeholderTextColor={ChatColors.faint}
            multiline
            maxLength={1000}
            style={styles.note}
          />

          <View style={styles.footer}>
            {isPlaceId(place.id) ? (
              <Pressable onPress={() => { onClose(); openPlace(place); }} style={styles.link}>
                <Ionicons name="information-circle-outline" size={16} color={ChatColors.text} />
                <Text style={styles.linkText}>{t('Place details')}</Text>
              </Pressable>
            ) : <View />}
            <Pressable onPress={confirmDelete} style={styles.link} accessibilityRole="button">
              <Ionicons name="trash-outline" size={16} color={Colors.redDark} />
              <Text style={[styles.linkText, { color: Colors.redDark }]}>{t('Delete')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Action({ icon, label, primary, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; primary?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, primary && styles.actionPrimary, pressed && { opacity: 0.8 }]} accessibilityRole="button">
      <Ionicons name={icon} size={16} color={primary ? '#fff' : ChatColors.text} />
      <Text style={[styles.actionText, primary && { color: '#fff' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '88%', backgroundColor: Colors.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: Spacing.md },
  photoWrap: { borderRadius: 20, overflow: 'hidden' },
  close: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  name: { fontSize: 22, fontWeight: '800', color: Colors.ink },
  zh: { fontSize: 15, color: Colors.inkSoft, marginTop: 2 },
  date: { fontSize: 13, color: Colors.muted, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: ChatColors.border,
    backgroundColor: ChatColors.surface,
    paddingHorizontal: 8,
  },
  actionPrimary: { backgroundColor: ChatColors.accent, borderColor: ChatColors.accent },
  actionText: { fontSize: 13, fontWeight: '600', color: ChatColors.text, flexShrink: 1 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.inkSoft, marginBottom: -6 },
  ratingRow: { flexDirection: 'row', gap: 8 },
  rate: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: ChatColors.border, backgroundColor: ChatColors.surface },
  rateOn: { backgroundColor: ChatColors.accent, borderColor: ChatColors.accent },
  rateText: { fontSize: 12, fontWeight: '600', color: ChatColors.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  note: {
    minHeight: 80,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ChatColors.border,
    backgroundColor: ChatColors.surface,
    padding: 12,
    fontSize: 15,
    color: Colors.ink,
    textAlignVertical: 'top',
  },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  linkText: { fontSize: 14, fontWeight: '600', color: ChatColors.text },
}));
