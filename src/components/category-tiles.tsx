import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius } from '@/constants/theme';
import { CategoryMeta, type PlaceCategory } from '@/data/places';
import { tx, useT } from '@/lib/i18n';

type Value = PlaceCategory | 'all';

const ITEMS: { key: Value; label: string; color: string }[] = [
  { key: 'all', label: tx('All'), color: Colors.ink },
  ...(Object.keys(CategoryMeta) as PlaceCategory[]).map((c) => ({
    key: c,
    label: CategoryMeta[c].short,
    color: CategoryMeta[c].color,
  })),
];

/** Every category visible at once, so no label is ever cut off at the screen edge. */
export function CategoryTiles({ value, onChange }: { value: Value; onChange: (next: Value) => void }) {
  const t = useT();
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {ITEMS.map((item) => {
        const selected = item.key === value;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={item.key === 'all' ? t('All places') : t(CategoryMeta[item.key].label)}
            style={({ pressed }) => [
              styles.tile,
              selected && { backgroundColor: item.color, borderColor: item.color },
              pressed && { opacity: 0.8 },
            ]}>
            <Text
              style={[styles.label, selected && styles.labelSelected]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}>
              {t(item.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 2,
    borderRadius: Radius.pill,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  label: { fontSize: 13, fontWeight: '700', color: Colors.inkSoft },
  labelSelected: { color: '#fff' },
});
