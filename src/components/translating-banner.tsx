import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radius, themed } from '@/constants/theme';
import { useUiTranslationStatus } from '@/lib/i18n';
import { useTravellerLanguage } from '@/lib/language-store';

/** Shown the first time anyone picks a language, while Hao translates its screens (later it's instant). */
export function TranslatingBanner() {
  const status = useUiTranslationStatus();
  const language = useTravellerLanguage();
  const insets = useSafeAreaInsets();
  if (status !== 'loading') return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <View style={styles.pill}>
        <ActivityIndicator size="small" color="#fff" />
        <Text style={styles.text}>
          {language.flag} Translating Hao into {language.native}…
        </Text>
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.strong,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
  },
  text: { color: '#fff', fontSize: 13, fontWeight: '700' },
}));
