import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatModes, type ChatMode } from '@/components/chat-composer';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { tx, useT } from '@/lib/i18n';

const DESCRIPTIONS: Record<ChatMode, string> = {
  interpret: tx('Hao speaks Chinese to a local person for you and tells you what they said.'),
  guide: tx('Step-by-step help with WeChat, payments, transport, SIM cards and more.'),
  memory: tx('Your second brain: ask what people told you, where you went, or tell Hao to remember something.'),
};

type Props = {
  visible: boolean;
  mode: ChatMode;
  onSelect: (mode: ChatMode) => void;
  onBrowseTopics?: () => void;
  onClose: () => void;
};

/** The "+" menu: pick how Hao should help. */
export function ModeSheet({ visible, mode, onSelect, onBrowseTopics, onClose }: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('Close menu')} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.md }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>{t('How can Hao help?')}</Text>
        {(Object.keys(ChatModes) as ChatMode[]).map((m) => {
          const selected = m === mode;
          return (
            <Pressable
              key={m}
              onPress={() => {
                onSelect(m);
                onClose();
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && { opacity: 0.8 }]}>
              <View style={[styles.icon, selected && { backgroundColor: Colors.red }]}>
                <Ionicons name={ChatModes[m].icon} size={20} color={selected ? '#fff' : Colors.red} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t(ChatModes[m].label)}</Text>
                <Text style={styles.rowBody}>{t(DESCRIPTIONS[m])}</Text>
              </View>
              {selected ? <Ionicons name="checkmark-circle" size={22} color={Colors.red} /> : null}
            </Pressable>
          );
        })}
        {mode === 'guide' && onBrowseTopics ? (
          <Pressable
            onPress={() => {
              onBrowseTopics();
              onClose();
            }}
            style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}>
            <Ionicons name="grid-outline" size={18} color={Colors.ink} />
            <Text style={styles.linkText}>{t('Browse guide topics')}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.muted} />
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(27,26,31,0.35)' },
  sheet: {
    backgroundColor: Colors.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.line, marginBottom: Spacing.sm },
  title: { fontSize: 18, fontWeight: '800', color: Colors.ink, marginBottom: 4, paddingHorizontal: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.line,
  },
  rowSelected: { borderColor: Colors.red },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '800', color: Colors.ink },
  rowBody: { fontSize: 13, lineHeight: 18, color: Colors.inkSoft, marginTop: 2 },
  link: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 14, paddingHorizontal: 6 },
  linkText: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.ink },
});
