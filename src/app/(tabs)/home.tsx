import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, router } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlaceThumb, placeMeta } from '@/components/place-thumb';
import { SpeakButton } from '@/components/speak-button';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { Dishes } from '@/data/food';
import { PhraseGroups } from '@/data/phrases';
import { CategoryMeta, Cities } from '@/data/places';
import { tx, useT } from '@/lib/i18n';
import { useCurrentLocation } from '@/lib/location';
import { usePlaces } from '@/lib/places';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const QUICK_ACTIONS: { label: string; icon: IconName; color: string; soft: string; href: '/translate' | '/explore' | '/food' }[] = [
  { label: tx('Translate'), icon: 'mic', color: Colors.red, soft: Colors.redSoft, href: '/translate' },
  { label: tx('Nearby'), icon: 'navigate', color: Colors.jade, soft: Colors.jadeSoft, href: '/explore' },
  { label: tx('Eat'), icon: 'restaurant', color: '#E08A1E', soft: Colors.goldSoft, href: '/food' },
];

const ESSENTIALS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'wallet', title: tx('Pay like a local'), body: tx('Link a foreign card to Alipay or WeChat Pay — cash is rarely used.') },
  { icon: 'wifi', title: tx('Stay connected'), body: tx('Get an eSIM before arrival; some foreign apps need roaming data.') },
  { icon: 'train', title: tx('Ride the metro'), body: tx('Scan the Alipay transport QR code at the gate. Trains are cheap and fast.') },
];

const EMERGENCY = [
  { label: tx('Police'), number: '110' },
  { label: tx('Ambulance'), number: '120' },
  { label: tx('Fire'), number: '119' },
];

export default function HomeScreen() {
  const t = useT();
  // AMap's top sights near the user (when location was already allowed), otherwise in Beijing.
  const here = useCurrentLocation().coords;
  const featured = usePlaces(here ? { near: here, radius: 20_000, category: 'landmark' } : { city: Cities[0].nameZh, category: 'landmark' });
  const featuredPlaces = featured.places.slice(0, 8);
  const phraseOfDay = PhraseGroups[0].phrases[0];

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xl }}>
        <View style={styles.header}>
          <View>
            <Text style={styles.hello}>你好 · Nǐ hǎo 👋</Text>
            <Text style={styles.title}>{t('Where to today?')}</Text>
          </View>
          <Link href="/profile" asChild>
            <Pressable style={styles.avatar}>
              <Text style={styles.avatarText}>好</Text>
            </Pressable>
          </Link>
        </View>

        <View style={styles.quickRow}>
          {QUICK_ACTIONS.map((a) => (
            <Pressable
              key={a.label}
              onPress={() => router.navigate(a.href)}
              style={({ pressed }) => [styles.quick, pressed && { opacity: 0.8 }]}>
              <View style={[styles.quickIcon, { backgroundColor: a.soft }]}>
                <Ionicons name={a.icon} size={24} color={a.color} />
              </View>
              <Text style={styles.quickLabel}>{t(a.label)}</Text>
            </Pressable>
          ))}
        </View>

        <LinearGradient colors={[Colors.red, Colors.redDark]} style={styles.phraseCard}>
          <Text style={styles.phraseEyebrow}>{t('Phrase of the day')}</Text>
          <View style={styles.phraseRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.phraseZh}>{phraseOfDay.zh}</Text>
              <Text style={styles.phrasePinyin}>
                {phraseOfDay.pinyin} — {t(phraseOfDay.en)}
              </Text>
            </View>
            <SpeakButton text={phraseOfDay.zh} size={22} tint={Colors.red} background="#fff" />
          </View>
        </LinearGradient>

        <SectionTitle title={t('Must-see places')} href="/explore" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
          {featured.loading ? <ActivityIndicator color={Colors.red} style={{ margin: Spacing.lg }} /> : null}
          {featuredPlaces.map((p) => (
            <Link key={p.id} href={{ pathname: '/place/[id]', params: { id: p.id } }} asChild>
              <Pressable style={styles.placeCard}>
                <PlaceThumb place={p} size={144} radius={Radius.md} style={styles.placeArt} />
                <Text style={styles.placeName} numberOfLines={1}>
                  {p.name}
                </Text>
                {p.name !== p.nameZh ? (
                  <Text style={styles.placeZh} numberOfLines={1}>
                    {p.nameZh}
                  </Text>
                ) : null}
                <Text style={styles.ticket} numberOfLines={1}>
                  {placeMeta(p, t(CategoryMeta[p.category].label))}
                </Text>
              </Pressable>
            </Link>
          ))}
        </ScrollView>

        <SectionTitle title={t('Taste something new')} href="/food" />
        <View style={styles.foodList}>
          {Dishes.slice(0, 3).map((d) => (
            <View key={d.id} style={styles.foodRow}>
              <Text style={{ fontSize: 32 }}>{d.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.foodName}>
                  {t(d.name)} <Text style={styles.foodZh}>{d.nameZh}</Text>
                </Text>
                <Text style={styles.foodMeta}>
                  {t(d.region)} · {d.price}
                </Text>
              </View>
              <SpeakButton text={d.nameZh} />
            </View>
          ))}
        </View>

        <SectionTitle title={t('Travel essentials')} />
        <View style={styles.essentials}>
          {ESSENTIALS.map((e) => (
            <View key={e.title} style={styles.essential}>
              <Ionicons name={e.icon} size={22} color={Colors.jade} />
              <View style={{ flex: 1 }}>
                <Text style={styles.essentialTitle}>{t(e.title)}</Text>
                <Text style={styles.essentialBody}>{t(e.body)}</Text>
              </View>
            </View>
          ))}
        </View>

        <SectionTitle title={t('Emergency numbers')} />
        <View style={styles.emergencyRow}>
          {EMERGENCY.map((e) => (
            <Pressable
              key={e.number}
              onPress={() => Linking.openURL(`tel:${e.number}`)}
              style={({ pressed }) => [styles.emergency, pressed && { opacity: 0.8 }]}>
              <Text style={styles.emergencyNumber}>{e.number}</Text>
              <Text style={styles.emergencyLabel}>{t(e.label)}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ title, href }: { title: string; href?: '/explore' | '/food' }) {
  const t = useT();
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {href ? (
        <Pressable onPress={() => router.navigate(href)} hitSlop={8}>
          <Text style={styles.seeAll}>{t('See all')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
  },
  hello: { fontSize: 15, fontWeight: '600', color: Colors.inkSoft },
  title: { fontSize: 28, fontWeight: '800', color: Colors.ink, letterSpacing: -0.5 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.gold, fontSize: 22, fontWeight: '900' },
  quickRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.md },
  quick: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    ...Shadow,
  },
  quickIcon: { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  phraseCard: { margin: Spacing.md, padding: Spacing.lg, borderRadius: Radius.lg },
  phraseEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  phraseRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm },
  phraseZh: { fontSize: 36, fontWeight: '800', color: '#fff' },
  phrasePinyin: { fontSize: 15, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: Colors.ink },
  seeAll: { fontSize: 14, fontWeight: '700', color: Colors.red },
  hList: { paddingHorizontal: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.sm },
  placeCard: { width: 160, backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.sm, ...Shadow },
  placeArt: { height: 100, marginBottom: Spacing.sm },
  placeName: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  placeZh: { fontSize: 13, color: Colors.inkSoft, marginTop: 1 },
  ticket: { fontSize: 12, color: Colors.muted, marginTop: 6 },
  foodList: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    ...Shadow,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.line,
  },
  foodName: { fontSize: 16, fontWeight: '700', color: Colors.ink },
  foodZh: { fontWeight: '500', color: Colors.inkSoft },
  foodMeta: { fontSize: 13, color: Colors.muted, marginTop: 2 },
  essentials: { paddingHorizontal: Spacing.md, gap: Spacing.sm },
  essential: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.jadeSoft,
    borderRadius: Radius.md,
  },
  essentialTitle: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  essentialBody: { fontSize: 13, lineHeight: 19, color: Colors.inkSoft, marginTop: 2 },
  emergencyRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.md },
  emergency: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.red,
    backgroundColor: Colors.redSoft,
  },
  emergencyNumber: { fontSize: 22, fontWeight: '800', color: Colors.red },
  emergencyLabel: { fontSize: 12, fontWeight: '600', color: Colors.redDark, marginTop: 2 },
});
