import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { NearbyFood, WhereToTry } from '@/components/nearby-food';
import { ScreenHeader } from '@/components/screen-header';
import { SpeakButton } from '@/components/speak-button';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { DietMeta, Dishes, type DietTag } from '@/data/food';
import { useCurrentLocation } from '@/lib/location';
import { tx, useT } from '@/lib/i18n';

const SPICE_LEVELS = [tx('None'), tx('Mild'), tx('Medium'), tx('Hot')] as const;

export default function FoodScreen() {
  const t = useT();
  const [tag, setTag] = useState<DietTag | 'all'>('all');
  const [maxSpice, setMaxSpice] = useState(3);
  const [expanded, setExpanded] = useState<string>();
  const location = useCurrentLocation();

  const dishes = useMemo(
    () => Dishes.filter((d) => (tag === 'all' || d.tags.includes(tag)) && d.spice <= maxSpice),
    [tag, maxSpice]
  );

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xl }}>
        <ScreenHeader eyebrow="美食 · Food" title={t('What to eat')} subtitle={t('Local favourites, and how to order them.')} />

        <View style={styles.chips}>
          <Chip label={t('All dishes')} selected={tag === 'all'} color={Colors.red} onPress={() => setTag('all')} />
          {(Object.keys(DietMeta) as DietTag[]).map((diet) => (
            <Chip
              key={diet}
              label={`${DietMeta[diet].emoji} ${t(DietMeta[diet].label)}`}
              selected={tag === diet}
              color={Colors.red}
              onPress={() => setTag(diet)}
            />
          ))}
        </View>

        <NearbyFood location={location} tag={tag} />

        <Text style={styles.sectionTitle}>{t('Dishes to try')}</Text>

        <View style={styles.spiceCard}>
          <Text style={styles.spiceTitle}>{t('How much spice can you handle?')}</Text>
          <View style={styles.spiceRow}>
            {SPICE_LEVELS.map((label, i) => (
              <Pressable
                key={label}
                onPress={() => setMaxSpice(i)}
                style={[styles.spiceOption, maxSpice === i && styles.spiceOptionActive]}>
                <Text style={styles.spicePeppers}>{i === 0 ? '🙂' : '🌶️'.repeat(i)}</Text>
                <Text style={[styles.spiceLabel, maxSpice === i && { color: '#fff' }]}>{t(label)}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.list}>
          {dishes.length === 0 ? (
            <Text style={styles.empty}>{t('Nothing matches — try a higher spice level.')}</Text>
          ) : null}
          {dishes.map((d) => {
            const open = expanded === d.id;
            return (
              <Animated.View key={d.id} layout={LinearTransition} style={styles.card}>
                <Pressable onPress={() => setExpanded(open ? undefined : d.id)} style={styles.cardTop}>
                  <View style={styles.emojiBox}>
                    <Text style={{ fontSize: 40 }}>{d.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.region}>{t(d.region)}</Text>
                    <Text style={styles.name}>{t(d.name)}</Text>
                    <Text style={styles.zh}>
                      {d.nameZh} · <Text style={styles.pinyin}>{d.pinyin}</Text>
                    </Text>
                    <View style={styles.tagRow}>
                      <Text style={styles.price}>{d.price}</Text>
                      {d.spice > 0 ? <Text style={styles.tag}>{'🌶️'.repeat(d.spice)}</Text> : null}
                      {d.tags
                        .filter((tag) => tag !== 'spicy')
                        .map((tag) => (
                          <Text key={tag} style={styles.tag}>
                            {DietMeta[tag].emoji} {t(DietMeta[tag].label)}
                          </Text>
                        ))}
                    </View>
                  </View>
                  <SpeakButton text={d.nameZh} />
                </Pressable>


                {open ? (
                  <Animated.View entering={FadeIn} style={styles.details}>
                    <Text style={styles.description}>{t(d.description)}</Text>
                    <WhereToTry dish={d} here={location.coords} />
                    <View style={styles.orderBox}>
                      <Text style={styles.orderLabel}>{t('Show this to order')}</Text>
                      <View style={styles.orderRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.orderZh}>{d.orderZh}</Text>
                          <Text style={styles.orderEn}>{t(d.orderEn)}</Text>
                        </View>
                        <SpeakButton text={d.orderZh} tint="#fff" background={Colors.red} />
                      </View>
                    </View>
                  </Animated.View>
                ) : (
                  <Text style={styles.more}>{t('Tap for details & ordering phrase')}</Text>
                )}
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: Colors.ink, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  spiceCard: {
    marginHorizontal: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.goldSoft,
    borderRadius: Radius.lg,
  },
  spiceTitle: { fontSize: 15, fontWeight: '700', color: Colors.ink, marginBottom: Spacing.sm },
  spiceRow: { flexDirection: 'row', gap: Spacing.sm },
  spiceOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
  },
  spiceOptionActive: { backgroundColor: Colors.red },
  spicePeppers: { fontSize: 14, height: 20 },
  spiceLabel: { fontSize: 12, fontWeight: '700', color: Colors.inkSoft, marginTop: 2 },
  list: { padding: Spacing.md, gap: Spacing.md },
  empty: { textAlign: 'center', color: Colors.muted, marginTop: Spacing.lg },
  card: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.md, ...Shadow },
  cardTop: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  emojiBox: {
    width: 72,
    height: 72,
    borderRadius: Radius.md,
    backgroundColor: Colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  region: { fontSize: 11, fontWeight: '700', color: Colors.red, textTransform: 'uppercase', letterSpacing: 1 },
  name: { fontSize: 18, fontWeight: '800', color: Colors.ink },
  zh: { fontSize: 15, fontWeight: '600', color: Colors.ink, marginTop: 2 },
  pinyin: { fontWeight: '400', color: Colors.muted },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.sm },
  price: { fontSize: 12, fontWeight: '700', color: Colors.jade },
  tag: { fontSize: 12, color: Colors.inkSoft },
  more: { fontSize: 12, color: Colors.muted, marginTop: Spacing.sm, textAlign: 'right' },
  details: { marginTop: Spacing.md, gap: Spacing.md },
  description: { fontSize: 14, lineHeight: 21, color: Colors.inkSoft },
  orderBox: { backgroundColor: Colors.paper, borderRadius: Radius.md, padding: Spacing.md },
  orderLabel: { fontSize: 11, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: 6 },
  orderZh: { fontSize: 22, fontWeight: '800', color: Colors.ink },
  orderEn: { fontSize: 13, color: Colors.inkSoft, marginTop: 2 },
});
