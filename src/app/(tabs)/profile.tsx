import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguagePicker } from '@/components/language-picker';
import { PlaceThumb } from '@/components/place-thumb';
import { ScreenHeader } from '@/components/screen-header';
import { Colors, Radius, setThemePreference, Shadow, Spacing, themed, type ThemePreference, useThemePreference } from '@/constants/theme';
import type { Place } from '@/data/places';
import { useAuth, useLanguagePreference } from '@/lib/auth';
import { countMemories } from '@/lib/memory';
import { fetchPlacesById } from '@/lib/places';
import { fetchSavedPlaceIds } from '@/lib/saved-places';
import { supabase } from '@/lib/supabase';
import { twinDna, twinFromRow } from '@shared/ai/twin';
import { tx, useT } from '@/lib/i18n';
import { countryName } from '@/lib/place-actions';
import { countVisits, deleteVisitHistory } from '@/lib/visits';

const APPEARANCES: { value: ThemePreference; label: string; icon: 'phone-portrait-outline' | 'sunny' | 'moon' }[] = [
  { value: 'system', label: tx('Same as phone'), icon: 'phone-portrait-outline' },
  { value: 'light', label: tx('Light'), icon: 'sunny' },
  { value: 'dark', label: tx('Dark'), icon: 'moon' },
];

export default function ProfileScreen() {
  const t = useT();
  const { session, profile, updateProfile, signOut } = useAuth();
  const [language, setLanguage] = useLanguagePreference();
  const appearance = useThemePreference();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState<Place[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [memoryCount, setMemoryCount] = useState<number | null>(null);
  const [visitCount, setVisitCount] = useState<number | null>(null);

  const email = session?.user.email ?? '';
  const name = profile?.display_name || email.split('@')[0] || t('Traveller');
  const initials = name.slice(0, 1).toUpperCase();
  // The digital twin as plain text: everything Hao uses to pick food and places for this user.
  const dna = profile
    ? twinDna(twinFromRow(profile), { countryName })
    : '';

  useFocusEffect(
    useCallback(() => {
      countMemories().then(setMemoryCount).catch(() => setMemoryCount(null));
      countVisits().then(setVisitCount).catch(() => setVisitCount(null));
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

  const confirmDeleteVisits = () => {
    Alert.alert(t('Delete my visit history?'), t('Every place Hao remembers you visited, with your ratings, notes and photos, is deleted and removed from community stats.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Delete'),
        style: 'destructive',
        onPress: () =>
          deleteVisitHistory()
            .then(() => setVisitCount(0))
            .catch((e: Error) => Alert.alert(t('Something went wrong'), e.message)),
      },
    ]);
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
          <View style={[styles.row, styles.rowDivider]}>
            <View style={[styles.rowIcon, { backgroundColor: Colors.paper }]}>
              <Ionicons name="contrast" size={18} color={Colors.ink} />
            </View>
            <Text style={styles.rowLabel}>{t('Appearance')}</Text>
            <View style={styles.appearance} accessibilityRole="radiogroup">
              {APPEARANCES.map((a) => {
                const on = appearance === a.value;
                return (
                  <Pressable
                    key={a.value}
                    onPress={() => setThemePreference(a.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={t(a.label)}
                    style={[styles.appearanceOption, on && styles.appearanceOn]}>
                    <Ionicons name={a.icon} size={15} color={on ? '#fff' : Colors.inkSoft} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('Contact details')}</Text>
        <View style={styles.card}>
          <Text style={styles.prefIntro}>
            {t('For when someone in a conversation asks for your number or email. Hao asks you first, every time, and never shares them on its own.')}
          </Text>
          <ContactField
            icon="call-outline"
            label={t('Phone')}
            value={profile?.contact_phone ?? ''}
            placeholder="+86 138 0000 0000"
            keyboardType="phone-pad"
            onSave={(v) => updateProfile({ contact_phone: v || null })}
          />
          <ContactField
            icon="mail-outline"
            label={t('Email')}
            value={profile?.contact_email ?? ''}
            placeholder={email}
            keyboardType="email-address"
            onSave={(v) => updateProfile({ contact_email: v || null })}
            divider
          />
        </View>

        {profile?.is_admin ? (
          <>
            <Text style={styles.sectionTitle}>{t('Hao team')}</Text>
            <View style={styles.card}>
              <Pressable onPress={() => router.push('/admin-stories')} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
                <View style={[styles.rowIcon, { backgroundColor: Colors.goldSoft }]}>
                  <Ionicons name="checkmark-done" size={18} color={Colors.goldText} />
                </View>
                <Text style={styles.rowLabel}>{t('Review Discover stories')}</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.muted} />
              </Pressable>
            </View>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>{t('Your Hao DNA')}</Text>
        <View style={styles.card}>
          <Text style={styles.prefIntro}>
            {t('What Hao knows about you. Your city follows your location; everything else you tell Hao in chat.')}
          </Text>
          <Text style={styles.dna} selectable accessibilityLabel={dna.replace(/\n/g, '. ')}>
            {dna}
          </Text>
          <Pressable onPress={() => router.push('/twin')} style={({ pressed }) => [styles.row, styles.rowDivider, pressed && { opacity: 0.7 }]} accessibilityRole="button">
            <View style={[styles.rowIcon, { backgroundColor: Colors.redSoft }]}>
              <Ionicons name="chatbubbles" size={18} color={Colors.red} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{t('Talk to Hao to change it')}</Text>
              <Text style={styles.rowSub}>{t('e.g. “I’m vegetarian now” or “I love night markets”')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.muted} />
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>{t('Hao’s memory')}</Text>
        <View style={styles.card}>
          <Pressable onPress={() => router.push('/memories')} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
            <View style={[styles.rowIcon, { backgroundColor: Colors.goldSoft }]}>
              <Ionicons name="sparkles" size={18} color={Colors.goldText} />
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

        <Text style={styles.sectionTitle}>{t('Places memory')}</Text>
        <View style={styles.card}>
          <Pressable onPress={() => router.navigate('/my-places')} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
            <View style={[styles.rowIcon, { backgroundColor: Colors.jadeSoft }]}>
              <Ionicons name="footsteps" size={18} color={Colors.jade} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{t('My Places')}</Text>
              <Text style={styles.rowSub}>
                {visitCount ? t('{count} places visited · only you can see them', { count: visitCount }) : t('Built automatically as you go')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.muted} />
          </Pressable>

          <View style={[styles.row, styles.rowDivider, { alignItems: 'flex-start' }]}>
            <View style={[styles.rowIcon, { backgroundColor: Colors.goldSoft }]}>
              <Ionicons name="people" size={18} color={Colors.goldText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{t('Share my visits anonymously to help people from my country')}</Text>
              <Text style={styles.rowSub}>
                {t('Only totals are shown, and only when at least 5 people from a country went. Never your name or history.')}
              </Text>
            </View>
            <Switch
              value={!!profile?.share_visits}
              onValueChange={(share_visits) => updateProfile({ share_visits }).catch(() => {})}
              trackColor={{ true: Colors.jade, false: Colors.line }}
              accessibilityLabel={t('Share my visits anonymously')}
            />
          </View>

          <Pressable onPress={confirmDeleteVisits} style={({ pressed }) => [styles.row, styles.rowDivider, pressed && { opacity: 0.7 }]}>
            <View style={[styles.rowIcon, { backgroundColor: Colors.redSoft }]}>
              <Ionicons name="trash-outline" size={18} color={Colors.redDark} />
            </View>
            <Text style={[styles.rowLabel, { color: Colors.redDark }]}>{t('Delete my visit history')}</Text>
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

/** One contact detail, edited in place and saved when the field loses focus. */
function ContactField({ icon, label, value, placeholder, keyboardType, onSave, divider }: {
  icon: 'call-outline' | 'mail-outline';
  label: string;
  value: string;
  placeholder: string;
  keyboardType: 'phone-pad' | 'email-address';
  onSave: (value: string) => Promise<void>;
  divider?: boolean;
}) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    const next = draft?.trim();
    setDraft(null);
    if (next !== undefined && next !== value) onSave(next).catch((e: Error) => Alert.alert(t('Something went wrong'), e.message));
  };
  return (
    <View style={[styles.row, divider && styles.rowDivider]}>
      <View style={[styles.rowIcon, { backgroundColor: Colors.paper }]}>
        <Ionicons name={icon} size={18} color={Colors.ink} />
      </View>
      <Text style={styles.contactLabel}>{label}</Text>
      <TextInput
        value={draft ?? value}
        onChangeText={setDraft}
        onFocus={() => setDraft(value)}
        onBlur={save}
        onSubmitEditing={save}
        placeholder={placeholder}
        placeholderTextColor={Colors.muted}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={keyboardType === 'phone-pad' ? 32 : 254}
        returnKeyType="done"
        accessibilityLabel={label}
        style={styles.contactInput}
      />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
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
  appearance: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: Radius.pill, backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.line },
  appearanceOption: { width: 36, height: 30, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  appearanceOn: { backgroundColor: Colors.strong },
  dna: {
    fontSize: 14,
    lineHeight: 21,
    color: Colors.ink,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    paddingVertical: Spacing.sm,
  },
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
  contactLabel: { fontSize: 16, fontWeight: '600', color: Colors.ink },
  contactInput: { flex: 1, fontSize: 15, color: Colors.ink, textAlign: 'right', paddingVertical: 4 },
  prefIntro: { fontSize: 13, color: Colors.inkSoft, paddingTop: Spacing.md },
  emptySaved: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  emptyText: { flex: 1, fontSize: 14, color: Colors.muted },
}));
