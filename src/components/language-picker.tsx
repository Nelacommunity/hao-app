import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { customLanguage, Languages, PopularLanguages, searchLanguages, type Language } from '@/lib/languages';
import { useT } from '@/lib/i18n';

type Props = {
  visible: boolean;
  selected: Language;
  onSelect: (language: Language) => void;
  onClose: () => void;
};

export function LanguagePicker({ visible, selected, onSelect, onClose }: Props) {
  const t = useT();
  const [query, setQuery] = useState('');
  const trimmed = query.trim();

  const sections = useMemo(() => {
    if (!trimmed) {
      return [
        { title: t('Popular'), data: PopularLanguages },
        { title: t('All languages · {count}', { count: Languages.length }), data: Languages },
      ];
    }
    const results = searchLanguages(trimmed);
    return [{ title: results.length ? t('{count} results', { count: results.length }) : t('No matches'), data: results }];
  }, [t, trimmed]);

  const exactMatch = searchLanguages(trimmed).some((x) => x.name.toLowerCase() === trimmed.toLowerCase());

  const choose = (language: Language) => {
    onSelect(language);
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{t('Your language')}</Text>
            <Text style={styles.subtitle}>{t('Hao will talk to you in this language')}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel={t('Close')}>
            <Ionicons name="close" size={20} color={Colors.ink} />
          </Pressable>
        </View>

        <View style={styles.search}>
          <Ionicons name="search" size={18} color={Colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('Search any language…')}
            placeholderTextColor={Colors.muted}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            returnKeyType="search"
            accessibilityLabel={t('Search languages')}
          />
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${item.code}-${index}`}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
          renderItem={({ item }) => <Row language={item} selected={item.code === selected.code} onPress={() => choose(item)} />}
          ListFooterComponent={
            trimmed && !exactMatch ? (
              <Pressable onPress={() => choose(customLanguage(trimmed))} style={({ pressed }) => [styles.custom, pressed && { opacity: 0.7 }]}>
                <View style={styles.customIcon}>
                  <Ionicons name="sparkles" size={18} color={Colors.red} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customTitle}>{t('Use “{trimmed}”', { trimmed: trimmed })}</Text>
                  <Text style={styles.customSub}>{t('Hao’s AI understands many more languages and dialects')}</Text>
                </View>
                <Ionicons name="arrow-forward" size={18} color={Colors.red} />
              </Pressable>
            ) : null
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

function Row({ language, selected, onPress }: { language: Language; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && { opacity: 0.7 }]}>
      <Text style={styles.flag}>{language.flag}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.native, selected && { color: Colors.red }]}>{language.native}</Text>
        {language.native !== language.name ? <Text style={styles.english}>{language.name}</Text> : null}
      </View>
      {selected ? <Ionicons name="checkmark-circle" size={22} color={Colors.red} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.ink },
  subtitle: { fontSize: 14, color: Colors.inkSoft, marginTop: 2 },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    height: 48,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  searchInput: { flex: 1, fontSize: 16, color: Colors.ink, height: '100%' },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 12,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
  },
  rowSelected: { backgroundColor: Colors.redSoft },
  flag: { fontSize: 26 },
  native: { fontSize: 16, fontWeight: '700', color: Colors.ink },
  english: { fontSize: 13, color: Colors.muted, marginTop: 1 },
  custom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.redSoft,
  },
  customIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customTitle: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  customSub: { fontSize: 12, color: Colors.muted, marginTop: 2 },
});
