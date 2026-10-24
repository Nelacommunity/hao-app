import { Image } from 'expo-image';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { CategoryMeta, type Place } from '@/data/places';

/** AMap's first photo of the place, or its category emoji on a tinted square. */
export function PlaceThumb({ place, size, radius = 14, style }: { place: Place; size: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const meta = CategoryMeta[place.category];
  const photo = place.photos[0];
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: radius, backgroundColor: `${meta.color}1A` }, style]}>
      {photo ? (
        <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} recyclingKey={place.id} />
      ) : (
        <Text style={{ fontSize: Math.round(size * 0.5) }}>{meta.emoji}</Text>
      )}
    </View>
  );
}

/** "★ 4.8 · ¥60 · 世界遗产": whatever AMap knows about the place. */
export function placeMeta(place: Place, fallback: string) {
  return [place.rating ? `★ ${place.rating}` : null, place.cost ? `¥${Math.round(place.cost)}` : null, place.typeZh || fallback]
    .filter(Boolean)
    .join(' · ');
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
