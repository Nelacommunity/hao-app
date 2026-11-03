import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { CategoryMeta, type IconName, type PlaceCategory } from '@/data/places';
import { tx, useT } from '@/lib/i18n';

type Value = PlaceCategory | 'all';

const ITEMS = themed((): { key: Value; label: string; icon: IconName; color: string }[] => [
  { key: 'all', label: tx('All'), icon: 'apps', color: Colors.ink },
  ...(Object.keys(CategoryMeta) as PlaceCategory[]).map((c) => ({
    key: c,
    label: CategoryMeta[c].short,
    icon: CategoryMeta[c].icon,
    color: CategoryMeta[c].color,
  })),
]);

/**
 * Category chips in one swipeable row: full-size labels that never shrink, running to the screen edge
 * so the next chip peeks in and shows there's more. Give it no horizontal padding from the parent.
 */
export function CategoryTiles({ value, onChange }: { value: Value; onChange: (next: Value) => void }) {
  const t = useT();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="radiogroup"
      keyboardShouldPersistTaps="handled">
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
              styles.chip,
              selected && { backgroundColor: item.color, borderColor: item.color },
              pressed && { opacity: 0.8 },
            ]}>
            <Ionicons name={item.icon} size={15} color={selected ? '#fff' : item.color} />
            <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
              {t(item.label)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  row: { gap: 8, paddingHorizontal: Spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  label: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  labelSelected: { color: '#fff' },
}));
