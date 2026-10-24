import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Countries } from '@shared/places/countries';

import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { countryName } from '@/lib/place-actions';

type Props = {
  visible: boolean;
  selected: string | null;
  onSelect: (code: string | null) => void;
  onClose: () => void;
};

/** Pick a nationality (ISO code), searchable in English and the user's language. */
export function CountryPicker({ visible, selected, onSelect, onClose }: Props) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const all = useMemo(
    () =>
      Object.keys(Countries)
        .map((code) => ({ code, name: countryName(code), english: Countries[code] }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    // Names depend on the language, which can change while the app runs; recompute when opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible]
  );
  const q = query.trim().toLowerCase();
  const list = q ? all.filter((c) => c.name.toLowerCase().includes(q) || c.english.toLowerCase().includes(q) || c.code.toLowerCase() === q) : all;

  const choose = (code: string | null) => {
    onSelect(code);
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('Where are you from?')}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t('Close')}>
            <Ionicons name="close" size={24} color={Colors.ink} />
          </Pressable>
        </View>
        <Text style={styles.body}>{t('Hao uses this to suggest places people from your country loved.')}</Text>
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={Colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('Search countries')}
            placeholderTextColor={Colors.muted}
            style={styles.input}
            autoCorrect={false}
          />
        </View>
        <FlatList
          data={list}
          keyExtractor={(c) => c.code}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            selected ? (
              <Pressable onPress={() => choose(null)} style={styles.row}>
                <Ionicons name="remove-circle-outline" size={20} color={Colors.inkSoft} />
                <Text style={[styles.name, { color: Colors.inkSoft }]}>{t('Prefer not to say')}</Text>
              </Pressable>
            ) : undefined
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => choose(item.code)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.line }]}>
              <Text style={styles.name}>{item.name}</Text>
              {item.code === selected ? <Ionicons name="checkmark-circle" size={20} color={Colors.red} /> : null}
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper, paddingTop: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md },
  title: { fontSize: 22, fontWeight: '800', color: Colors.ink },
  body: { fontSize: 14, color: Colors.inkSoft, paddingHorizontal: Spacing.md, marginTop: 4 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: Spacing.md,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  input: { flex: 1, fontSize: 16, color: Colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.md, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line },
  name: { flex: 1, fontSize: 16, color: Colors.ink },
}));
