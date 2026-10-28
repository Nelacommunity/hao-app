// The "⋯" menu in the Ask Hao header: everything that isn't the chat itself, in one tidy dropdown, so the
// header stays the brand, New chat and this button. Emergency is first and red.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing, themed } from '@/constants/theme';

export type HeaderMenuItem = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  /** Shown on the right, e.g. the current language. */
  detail?: string;
  danger?: boolean;
  onPress: () => void;
};

export function HeaderMenu({ visible, items, onClose }: { visible: boolean; items: HeaderMenuItem[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
      <View style={[styles.menu, { top: insets.top + 56 }]}>
        {items.map((item, i) => (
          <Pressable
            key={item.label}
            onPress={() => {
              onClose();
              item.onPress();
            }}
            style={({ pressed }) => [styles.row, i > 0 && styles.divider, item.danger && styles.dangerRow, pressed && styles.pressed]}
            accessibilityRole="menuitem">
            <Ionicons name={item.icon} size={19} color={item.danger ? Colors.red : Colors.ink} />
            <Text style={[styles.label, item.danger && styles.dangerText]} numberOfLines={1}>
              {item.label}
            </Text>
            {item.detail ? (
              <Text style={styles.detail} numberOfLines={1}>
                {item.detail}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    menu: {
      position: 'absolute',
      right: Spacing.md,
      minWidth: 230,
      maxWidth: 300,
      borderRadius: Radius.md,
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.line,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 50 },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
    dangerRow: { backgroundColor: Colors.redSoft },
    pressed: { opacity: 0.7 },
    label: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.ink },
    dangerText: { color: Colors.red, fontWeight: '800' },
    detail: { fontSize: 14, color: Colors.inkSoft, maxWidth: 110 },
  })
);
