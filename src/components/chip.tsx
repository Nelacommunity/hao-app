import { Pressable, StyleSheet, Text } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

type Props = {
  label: string;
  selected?: boolean;
  color?: string;
  onPress?: () => void;
};

export function Chip({ label, selected, color = Colors.ink, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected ? { backgroundColor: color, borderColor: color } : null,
        pressed && { opacity: 0.75 },
      ]}>
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.inkSoft,
  },
  labelSelected: {
    color: '#fff',
  },
});
