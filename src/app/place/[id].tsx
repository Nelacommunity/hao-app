import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SpeakButton } from '@/components/speak-button';
import { Colors, Radius, Shadow, Spacing, themed } from '@/constants/theme';
import { CategoryMeta } from '@/data/places';
import { usePlace } from '@/lib/places';
import { isPlaceSaved, setPlaceSaved } from '@/lib/saved-places';
import { useT } from '@/lib/i18n';

export default function PlaceScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { place, loading, error } = usePlace(id);
  const [driverMode, setDriverMode] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    isPlaceSaved(id).then(setSaved).catch(() => {});
  }, [id]);

  const toggleSaved = async () => {
    const next = !saved;
    setSaved(next); // optimistic
    try {
      await setPlaceSaved(id, next);
    } catch {
      setSaved(!next);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={Colors.red} />
      </SafeAreaView>
    );
  }

  if (!place) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.missing}>{error ?? t('Place not found')}</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>{t('Go back')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (driverMode) {
    return (
      <Pressable style={styles.driver} onPress={() => setDriverMode(false)}>
        <Text style={styles.driverLabel}>师傅，请带我去这里：</Text>
        <Text style={styles.driverName}>{place.nameZh}</Text>
        <Text style={styles.driverAddress}>{place.addressZh}</Text>
        <Text style={styles.driverHint}>{t('Driver, please take me here · Tap to close')}</Text>
      </Pressable>
    );
  }

  const meta = CategoryMeta[place.category];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
        <View style={[styles.hero, { backgroundColor: meta.color + '22' }]}>
          {place.photos[0] ? (
            <Image source={{ uri: place.photos[0] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
          ) : (
            <Ionicons name={meta.icon} size={64} color={meta.color} />
          )}
          <Pressable onPress={() => router.back()} style={styles.close} accessibilityLabel={t('Close')}>
            <Ionicons name="close" size={22} color={Colors.ink} />
          </Pressable>
          <Pressable
            onPress={toggleSaved}
            style={[styles.close, styles.save]}
            accessibilityRole="button"
            accessibilityState={{ selected: saved }}
            accessibilityLabel={saved ? t('Remove from saved places') : t('Save place')}>
            <Ionicons name={saved ? 'heart' : 'heart-outline'} size={22} color={saved ? Colors.red : Colors.ink} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text style={[styles.category, { color: meta.color }]}>
            {t(meta.label)}
            {place.type || place.typeZh ? ` · ${place.type || place.typeZh}` : ''}
          </Text>
          <Text style={styles.name}>{place.name}</Text>
          <View style={styles.zhRow}>
            <Text style={styles.zh}>{place.nameZh}</Text>
            <SpeakButton text={place.nameZh} />
          </View>

          {place.rating || place.cost || place.hours ? (
            <View style={styles.facts}>
              {place.rating ? <Fact icon="star" label={t('Rating')} value={String(place.rating)} /> : null}
              {place.cost ? (
                <Fact icon={place.category === 'food' ? 'wallet' : 'ticket'} label={t('Per person')} value={`¥${Math.round(place.cost)}`} />
              ) : null}
              {place.hours ? <Fact icon="time" label={t('Hours')} value={place.hours} /> : null}
            </View>
          ) : null}

          {place.tags.length ? (
            <View style={styles.tags}>
              {place.tags.map((tag) => (
                <Text key={tag} style={styles.tagChip}>
                  {tag}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.addressCard}>
            <Text style={styles.addressLabel}>{t('Address')}</Text>
            <Text style={styles.address}>{place.addressZh}</Text>
            {place.address && place.address !== place.addressZh ? <Text style={styles.addressEn}>{place.address}</Text> : null}
          </View>

          {place.tel ? (
            <Pressable
              onPress={() => Linking.openURL(`tel:${place.tel!.replace(/[^\d+]/g, '')}`).catch(() => {})}
              style={({ pressed }) => [styles.addressCard, styles.telRow, pressed && { opacity: 0.85 }]}
              accessibilityRole="button">
              <Ionicons name="call" size={18} color={Colors.red} />
              <Text style={styles.tel}>{place.tel}</Text>
            </Pressable>
          ) : null}

          {place.photos.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
              {place.photos.slice(1).map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.photo} contentFit="cover" transition={200} />
              ))}
            </ScrollView>
          ) : null}
          <Text style={styles.source}>{t('Place details from AMap 高德地图')}</Text>

          <Pressable
            onPress={() => router.dismissTo({ pathname: '/explore', params: { route: place.id } })}
            style={({ pressed }) => [styles.cta, styles.directions, pressed && { opacity: 0.85 }]}
            accessibilityRole="button">
            <Ionicons name="navigate" size={20} color="#fff" />
            <Text style={styles.ctaText}>{t('Directions from my location')}</Text>
          </Pressable>
          <Pressable
            onPress={() => setDriverMode(true)}
            style={({ pressed }) => [styles.cta, styles.taxi, pressed && { opacity: 0.85 }]}
            accessibilityRole="button">
            <Ionicons name="car" size={20} color={Colors.red} />
            <Text style={[styles.ctaText, { color: Colors.red }]}>{t('Show to taxi driver')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Fact({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={18} color={Colors.red} />
      <Text style={styles.factValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  missing: { fontSize: 18, fontWeight: '700', color: Colors.ink },
  link: { color: Colors.red, fontWeight: '700' },
  hero: { height: 240, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  close: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow,
  },
  save: { right: undefined, left: Spacing.md },
  body: { padding: Spacing.lg, gap: Spacing.sm },
  category: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  name: { fontSize: 30, fontWeight: '800', color: Colors.ink, letterSpacing: -0.5 },
  zhRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  zh: { fontSize: 20, fontWeight: '600', color: Colors.inkSoft },
  facts: { flexDirection: 'row', gap: Spacing.sm, marginVertical: Spacing.sm },
  fact: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    gap: 2,
    ...Shadow,
  },
  factValue: { fontSize: 15, fontWeight: '800', color: Colors.ink },
  factLabel: { fontSize: 11, color: Colors.muted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: {
    fontSize: 13,
    color: Colors.inkSoft,
    backgroundColor: Colors.card,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  addressCard: { padding: Spacing.md, backgroundColor: Colors.card, borderRadius: Radius.md, ...Shadow },
  addressLabel: { fontSize: 11, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  address: { fontSize: 17, fontWeight: '600', color: Colors.ink, marginTop: 4 },
  addressEn: { fontSize: 14, color: Colors.inkSoft, marginTop: 4 },
  telRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  tel: { fontSize: 16, fontWeight: '700', color: Colors.ink },
  photos: { gap: Spacing.sm },
  photo: { width: 160, height: 110, borderRadius: Radius.md, backgroundColor: Colors.card },
  source: { fontSize: 11, color: Colors.muted, textAlign: 'center' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    backgroundColor: Colors.red,
    paddingVertical: 16,
    borderRadius: Radius.pill,
  },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  directions: { backgroundColor: '#2576FF' },
  taxi: { marginTop: 0, backgroundColor: Colors.redSoft },
  driver: {
    flex: 1,
    backgroundColor: Colors.strong,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  driverLabel: { fontSize: 22, color: Colors.gold, fontWeight: '700' },
  driverName: { fontSize: 48, color: '#fff', fontWeight: '900', marginTop: Spacing.md },
  driverAddress: { fontSize: 26, color: '#fff', fontWeight: '600', marginTop: Spacing.md, lineHeight: 36 },
  driverHint: { fontSize: 14, color: Colors.muted, marginTop: Spacing.xl },
}));
