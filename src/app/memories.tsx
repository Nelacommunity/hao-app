import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { deleteMemory, forgetEverything, formatWhen, listMemories, MemoryKindMeta, type MemoryItem } from '@/lib/memory';
import { useT } from '@/lib/i18n';

export default function MemoriesScreen() {
  const t = useT();
  const { profile, updateProfile } = useAuth();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MemoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enabled = profile?.memory_enabled ?? true;

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      listMemories(query)
        .then((list) => !cancelled && setItems(list))
        .catch((e: Error) => !cancelled && setError(e.message));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query]);

  const remove = async (id: string) => {
    setItems((list) => list?.filter((m) => m.id !== id) ?? null);
    await deleteMemory(id).catch((e: Error) => setError(e.message));
  };

  const confirmForget = () => {
    const run = async () => {
      await forgetEverything().catch((e: Error) => setError(e.message));
      setItems([]);
    };
    if (Platform.OS === 'web') return void run();
    Alert.alert(t('Forget everything?'), t('Hao will permanently delete everything it remembers about you.'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Forget'), style: 'destructive', onPress: run },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel={t('Go back')}>
          <Ionicons name="chevron-back" size={22} color={Colors.ink} />
        </Pressable>
        <Text style={styles.title}>{t('Hao’s memory')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.toggle}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>{t('Remember my conversations')}</Text>
          <Text style={styles.toggleBody}>{t('What locals tell you, your places and plans. Only you can see this, and you can delete it any time.')}</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={(value) => updateProfile({ memory_enabled: value }).catch(() => {})}
          trackColor={{ true: Colors.red, false: Colors.line }}
          thumbColor="#fff"
        />
      </View>

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={Colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('Search memories…')}
          placeholderTextColor={Colors.muted}
          style={styles.searchInput}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={items ?? []}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          items === null ? (
            <ActivityIndicator color={Colors.red} style={{ marginTop: Spacing.xl }} />
          ) : (
            <Text style={styles.empty}>
              {query ? t('No memories match.') : t('Nothing yet. Hao will remember things as you use Interpret and Guide.')}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.itemIcon}>
              <Ionicons name={MemoryKindMeta[item.kind].icon} size={16} color={Colors.red} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemText}>{item.content}</Text>
              <Text style={styles.itemMeta}>
                {t(MemoryKindMeta[item.kind].label)} · {formatWhen(item.happened_at)}
              </Text>
            </View>
            <Pressable onPress={() => remove(item.id)} hitSlop={10} accessibilityLabel={t('Delete this memory')}>
              <Ionicons name="trash-outline" size={18} color={Colors.muted} />
            </Pressable>
          </View>
        )}
        ListFooterComponent={
          items && items.length > 0 && !query ? (
            <Pressable onPress={confirmForget} style={({ pressed }) => [styles.forget, pressed && { opacity: 0.8 }]}>
              <Ionicons name="trash" size={16} color={Colors.redDark} />
              <Text style={styles.forgetText}>{t('Forget everything')}</Text>
            </Pressable>
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, height: 56 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  title: { fontSize: 17, fontWeight: '800', color: Colors.ink },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  toggleTitle: { fontSize: 15, fontWeight: '800', color: Colors.ink },
  toggleBody: { fontSize: 13, lineHeight: 18, color: Colors.inkSoft, marginTop: 2 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    margin: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    height: 46,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  searchInput: { flex: 1, height: '100%', fontSize: 15, color: Colors.ink },
  error: { color: Colors.redDark, textAlign: 'center', marginBottom: Spacing.sm },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl, gap: Spacing.sm },
  empty: { textAlign: 'center', color: Colors.muted, marginTop: Spacing.xl, paddingHorizontal: Spacing.lg, lineHeight: 20 },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
  },
  itemIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.redSoft, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 14, lineHeight: 20, color: Colors.ink },
  itemMeta: { fontSize: 12, color: Colors.muted, marginTop: 3 },
  forget: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.lg, paddingVertical: 12 },
  forgetText: { fontSize: 14, fontWeight: '800', color: Colors.redDark },
});
