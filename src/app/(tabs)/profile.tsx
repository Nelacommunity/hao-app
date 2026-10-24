import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguagePicker } from '@/components/language-picker';
import { PlaceThumb } from '@/components/place-thumb';
import { PreferencesEditor } from '@/components/preferences-editor';
import { ScreenHeader } from '@/components/screen-header';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import type { Place } from '@/data/places';
import { useAuth, useLanguagePreference } from '@/lib/auth';
import { countMemories } from '@/lib/memory';
import { fetchPlacesById } from '@/lib/places';
import { fetchSavedPlaceIds } from '@/lib/saved-places';
import { supabase } from '@/lib/supabase';
import { DefaultPreferences, parsePreferences } from '@shared/ai/preferences';
import type { Preferences } from '@shared/ai/types';
import { useT } from '@/lib/i18n';

export default function ProfileScreen() {
  const t = useT();
  const { session, profile, updateProfile, signOut } = useAuth();
  const [language, setLanguage] = useLanguagePreference();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState<Place[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [memoryCount, setMemoryCount] = useState<number | null>(null);

  const email = session?.user.email ?? '';
  const name = profile?.display_name || email.split('@')[0] || t('Traveller');
  const initials = name.slice(0, 1).toUpperCase();
  const [prefsDraft, setPrefsDraft] = useState<Preferences | null>(null);
  const preferences = prefsDraft ?? parsePreferences(profile?.preferences) ?? DefaultPreferences;

  const savePreferences = (next: Preferences) => {
    setPrefsDraft(next);
    updateProfile({ preferences: next }).catch(() => {});
  };

  useFocusEffect(
    useCallback(() => {
      countMemories().then(setMemoryCount).catch(() => setMemoryCount(null));
      fetchSavedPlaceIds()
        .then(fetchPlacesById)
        .then(setSaved)
        .catch(() => setSaved([]));
    }, [])
  );

  const saveName = async () => {
    const next = nameDraft?.trim();
    setNameDraft(null);
    if (next !== undefined && next !== (profile?.display_name ?? '')) {
      await updateProfile({ display_name: next || null }).catch(() => {});
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      t('Delete account?'),
      t('This permanently deletes your account, profile and saved places. This can’t be undone.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error } = await supabase.rpc('delete_account');
            if (error) {
              setDeleting(false);
              Alert.alert(t('Couldn’t delete account'), error.message);
              return;
            }
            await signOut();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xl }}>
        <ScreenHeader eyebrow="我的 · Me" title={t('Profile')} />

        <View style={styles.card}>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              {nameDraft !== null ? (
                <TextInput
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  onBlur={saveName}
                  onSubmitEditing={saveName}
                  autoFocus
                  maxLength={80}
                  placeholder={t('Your name')}
                  placeholderTextColor={Colors.muted}
                  style={styles.nameInput}
                  returnKeyType="done"
                />
              ) : (
                <Pressable onPress={() => setNameDraft(profile?.display_name ?? '')} style={styles.nameRow} hitSlop={6}>
                  <Text style={styles.name} numberOfLines={1}>
                    {name}
                  </Text>
                  <Ionicons name="pencil" size={14} color={Colors.muted} />
                </Pressable>
              )}
              <Text style={styles.email} numberOfLines={1}>
                {email}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('Preferences')}</Text>
        <View style={styles.card}>
          <Pressable onPress={() => setPickerOpen(true)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
            <View style={[styles.rowIcon, { backgroundColor: Colors.redSoft }]}>
              <Ionicons name="language" size={18} color={Colors.red} />
            </View>
            <Text style={styles.rowLabel}>{t('Language')}</Text>
            <Text style={styles.rowValue} numberOfLines={1}>
              {language.flag} {language.native}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.muted} />
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>{t('Food preferences')}</Text>
        <View style={styles.card}>
          <Text style={styles.prefIntro}>{t('Hao applies these automatically when it orders or asks for you.')}</Text>
          <PreferencesEditor value={preferences} onChange={savePreferences} />
        </View>

        <Text style={styles.sectionTitle}>{t('Hao’s memory')}</Text>
        <View style={styles.card}>
          <Pressable onPress={() => router.push('/memories')} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
            <View style={[styles.rowIcon, { backgroundColor: Colors.goldSoft }]}>
              <Ionicons name="sparkles" size={18} color="#A26A00" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{t('What Hao remembers')}</Text>
              <Text style={styles.rowSub}>
                {profile?.memory_enabled === false
                  ? t('Memory is off')
                  : memoryCount === null
                    ? t('Conversations, places and plans')
                    : memoryCount === 1
                      ? t('1 memory · only you can see them')
                      : t('{count} memories · only you can see them', { count: memoryCount })}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.muted} />
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>{t('Saved places')}</Text>
        <View style={styles.card}>
          {saved === null ? (
            <ActivityIndicator color={Colors.red} style={{ padding: Spacing.md }} />
          ) : saved.length === 0 ? (
            <View style={styles.emptySaved}>
              <Ionicons name="heart-outline" size={22} color={Colors.muted} />
              <Text style={styles.emptyText}>{t('Tap the heart on any place to save it here.')}</Text>
            </View>
          ) : (
            saved.map((p, i) => (
              <Link key={p.id} href={{ pathname: '/place/[id]', params: { id: p.id } }} asChild>
                <Pressable style={[styles.row, i > 0 && styles.rowDivider]}>
                  <PlaceThumb place={p} size={36} radius={10} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {p.nameZh}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.muted} />
                </Pressable>
              </Link>
            ))
          )}
        </View>

        <Text style={styles.sectionTitle}>{t('Account')}</Text>
        <View style={styles.card}>
          <Pressable onPress={signOut} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
            <View style={[styles.rowIcon, { backgroundColor: Colors.paper }]}>
              <Ionicons name="log-out-outline" size={18} color={Colors.ink} />
            </View>
            <Text style={styles.rowLabel}>{t('Sign out')}</Text>
          </Pressable>
          <Pressable
            onPress={confirmDelete}
            disabled={deleting}
            style={({ pressed }) => [styles.row, styles.rowDivider, pressed && { opacity: 0.7 }]}>
            <View style={[styles.rowIcon, { backgroundColor: Colors.redSoft }]}>
              {deleting ? <ActivityIndicator size="small" color={Colors.red} /> : <Ionicons name="trash-outline" size={18} color={Colors.redDark} />}
            </View>
            <Text style={[styles.rowLabel, { color: Colors.redDark }]}>{t('Delete account')}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <LanguagePicker visible={pickerOpen} selected={language} onSelect={setLanguage} onClose={() => setPickerOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  card: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    ...Shadow,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: Colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 24, fontWeight: '900', color: Colors.gold },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 20, fontWeight: '800', color: Colors.ink, flexShrink: 1 },
  nameInput: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.ink,
    borderBottomWidth: 2,
    borderBottomColor: Colors.red,
    paddingVertical: 2,
  },
  email: { fontSize: 14, color: Colors.inkSoft, marginTop: 2 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginHorizontal: Spacing.md + 4,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 14 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: Colors.ink },
  rowSub: { fontSize: 13, color: Colors.muted },
  rowValue: { fontSize: 14, color: Colors.inkSoft, maxWidth: 150 },
  prefIntro: { fontSize: 13, color: Colors.inkSoft, paddingTop: Spacing.md },
  emptySaved: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  emptyText: { flex: 1, fontSize: 14, color: Colors.muted },
});
