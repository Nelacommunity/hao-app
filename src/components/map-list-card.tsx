// A day plan or trip journal in Hao's reply: the places on one Mapbox map (with the walk between stops for a
// plan), then the stops in order. Tap a stop for the place page; a journal can be shared as text.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { ChatColors } from '@/components/chat-ui';
import { openPlace, RatingIcon } from '@/components/place-card';
import { PlaceMap } from '@/components/place-map';
import { Colors, Radius, themed } from '@/constants/theme';
import type { MapListData } from '@/data/place-cards';
import { CategoryMeta } from '@/data/places';
import { tx, useT } from '@/lib/i18n';
import { formatDistance } from '@/lib/location';
import { cachePlace } from '@/lib/places';

// The server sends these keys for the parts of the day (lib/server/day-plan).
const DAY_PARTS: Record<string, string> = {
  Morning: tx('Morning'),
  'Late morning': tx('Late morning'),
  Lunch: tx('Lunch'),
  Afternoon: tx('Afternoon'),
  Dinner: tx('Dinner'),
};

export function MapListCard({ data, kind }: { data: MapListData; kind: 'day_plan' | 'journal' }) {
  const t = useT();
  const [selectedId, setSelectedId] = useState<string>();
  const places = useMemo(() => data.stops.map((s) => s.place), [data.stops]);
  const route = useMemo(
    () => (data.route && data.route.coords.length > 1 ? { coords: data.route.coords.map(([latitude, longitude]) => ({ latitude, longitude })), approximate: data.route.approximate } : null),
    [data.route]
  );
  // Centre and span that fit every stop.
  const view = useMemo(() => {
    const lats = places.map((p) => p.latitude);
    const lngs = places.map((p) => p.longitude);
    const span = Math.max(0.01, Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs));
    return { center: { latitude: (Math.max(...lats) + Math.min(...lats)) / 2, longitude: (Math.max(...lngs) + Math.min(...lngs)) / 2 }, delta: span * 1.6 };
  }, [places]);

  const open = (index: number) => {
    const place = data.stops[index].place;
    cachePlace(place);
    openPlace(place);
  };

  const share = () => {
    const lines = data.stops.map((s) => `${s.label} · ${s.place.name}${s.place.nameZh && s.place.nameZh !== s.place.name ? ` (${s.place.nameZh})` : ''}${s.note ? ` — ${s.note}` : ''}`);
    Share.share({ message: `${t('My trip in China')} · ${t(data.title)}\n\n${lines.join('\n')}\n\n${t('Made with Hao')}` }).catch(() => {});
  };

  const label = (s: MapListData['stops'][number]) => (kind === 'day_plan' ? t(DAY_PARTS[s.label] ?? s.label) : formatDay(s.label));

  return (
    <View style={styles.card}>
      <View style={styles.map} pointerEvents="box-none">
        <PlaceMap
          places={places}
          center={view.center}
          delta={view.delta}
          route={route}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            const i = data.stops.findIndex((s) => s.place.id === id);
            if (i >= 0 && id === selectedId) open(i);
          }}
        />
      </View>

      <View style={styles.header}>
        <Ionicons name={kind === 'day_plan' ? 'map' : 'journal'} size={18} color={Colors.red} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {kind === 'day_plan' ? (data.title ? t('Your day in {city}', { city: data.title }) : t('Your day')) : t(data.title)}
          </Text>
          <Text style={styles.subtitle}>
            {kind === 'day_plan'
              ? [t('{count} stops', { count: data.stops.length }), data.distanceM ? formatDistance(data.distanceM / 1000) : null, data.route?.approximate ? t('some legs are straight lines') : null]
                  .filter(Boolean)
                  .join(' · ')
              : data.stops.length === 1
                ? t('1 place')
                : t('{count} places', { count: data.stops.length })}
          </Text>
        </View>
        {kind === 'journal' ? (
          <Pressable onPress={share} style={({ pressed }) => [styles.share, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={t('Share')}>
            <Ionicons name="share-outline" size={18} color={ChatColors.text} />
          </Pressable>
        ) : null}
      </View>

      {data.stops.map((s, i) => (
        <Pressable
          key={`${s.place.id}-${i}`}
          onPress={() => open(i)}
          style={({ pressed }) => [styles.stop, s.place.id === selectedId && styles.stopSelected, pressed && styles.pressed]}
          accessibilityRole="button">
          <View style={[styles.number, { backgroundColor: CategoryMeta[s.place.category].color }]}>
            <Text style={styles.numberText}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stopLabel}>{label(s)}</Text>
            <Text style={styles.stopName} numberOfLines={1}>
              {s.place.name}
            </Text>
            {s.place.nameZh && s.place.nameZh !== s.place.name ? (
              <Text style={styles.stopZh} numberOfLines={1}>
                {s.place.nameZh}
              </Text>
            ) : null}
            {s.note ? (
              <Text style={styles.note} numberOfLines={2}>
                {s.note}
              </Text>
            ) : null}
          </View>
          {kind === 'journal' ? <RatingIcon rating={s.rating ?? null} size={16} /> : null}
          <Ionicons name="chevron-forward" size={16} color={ChatColors.faint} />
        </Pressable>
      ))}
    </View>
  );
}

function formatDay(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

const styles = themed(() =>
  StyleSheet.create({
    pressed: { opacity: 0.8 },
    card: { backgroundColor: ChatColors.surface, borderRadius: 20, borderWidth: 1, borderColor: ChatColors.border, overflow: 'hidden' },
    map: { height: 210, backgroundColor: ChatColors.userBubble },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
    title: { fontSize: 16, fontWeight: '700', color: ChatColors.text },
    subtitle: { fontSize: 12.5, color: ChatColors.soft, marginTop: 1 },
    share: { width: 36, height: 36, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: ChatColors.userBubble },
    stop: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ChatColors.border },
    stopSelected: { backgroundColor: Colors.redSoft },
    number: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    numberText: { fontSize: 13, fontWeight: '800', color: '#fff' },
    stopLabel: { fontSize: 11.5, fontWeight: '700', color: ChatColors.soft, textTransform: 'uppercase', letterSpacing: 0.4 },
    stopName: { fontSize: 15, fontWeight: '600', color: ChatColors.text },
    stopZh: { fontSize: 13, color: ChatColors.soft },
    note: { fontSize: 13, color: ChatColors.soft, fontStyle: 'italic', marginTop: 2 },
  })
);
