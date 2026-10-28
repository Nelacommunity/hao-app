// Places mode: ask Hao for food and places like you'd ask a friend who lives here. Replies come with
// swipeable place cards ranked by what people from your country liked, and Hao remembers where you
// went ("Did you go to …?") to build My Places and My Food.
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { parsePreferences } from '@shared/ai/preferences';

import { AssistantMessage, ChatColors, ChatError, HaoMark, QuickReplies, Thinking, UserMessage } from '@/components/chat-ui';
import { MapListCard } from '@/components/map-list-card';
import { MenuCard } from '@/components/menu-card';
import { CardCarousel, PlaceCard, VisitedCard } from '@/components/place-card';
import { VisitConfirmCard } from '@/components/visit-confirm-card';
import { Colors, pick, Radius, Spacing, themed } from '@/constants/theme';
import type { ChatCard, VisitCardData } from '@/data/place-cards';
import { Cities, type IconName } from '@/data/places';
import { useAuth } from '@/lib/auth';
import { chatTitle, useChatAutosave, type OpenChat } from '@/lib/chats';
import { wgs84ToGcj02 } from '@/lib/china-coords';
import { stripMarkdown } from '@/lib/guide-state';
import { tx, useT } from '@/lib/i18n';
import type { Language } from '@/lib/languages';
import { distanceKm, useCurrentLocation } from '@/lib/location';
import { countryName } from '@/lib/place-actions';
import { askPlaces, type PlacesChatData, type PlacesMessage } from '@/lib/places-chat';
import { fetchUnaskedVisits, markAsked } from '@/lib/visits';

export { EMPTY_PLACES_CHAT, type PlacesChatData } from '@/lib/places-chat';

type Props = {
  /** The chat to show; give the component `key={chat.id}` so opening another chat starts fresh. */
  chat: OpenChat<PlacesChatData>;
  language: Language;
  onBusyChange: (busy: boolean) => void;
};

export type PlacesChatHandle = { send: (text: string) => void; scan: () => void };

type Starter = { icon: IconName; color: string; title: string; subtitle: string; prompt: string; tint: 'orangeSoft' | 'redSoft' | 'goldSoft' | 'blueSoft' | 'jadeSoft' };

const STARTERS = themed((): Starter[] => [
  { icon: 'restaurant', color: '#E4572E', title: tx('Food near me'), subtitle: tx('Picked for your taste'), prompt: tx('Find me good food near me'), tint: 'orangeSoft' },
  { icon: 'camera', color: Colors.red, title: tx('Must-see sights'), subtitle: tx('Worth the trip'), prompt: tx('What sights should I see around here?'), tint: 'redSoft' },
  { icon: 'map', color: '#E08A1E', title: tx('Plan my day'), subtitle: tx('Sights and meals on a map'), prompt: tx('Plan my day around here'), tint: 'goldSoft' },
  { icon: 'phone-portrait', color: '#2576FF', title: tx('Daily errands'), subtitle: tx('SIM, bank, pharmacy'), prompt: tx('Where is the nearest phone shop to get a SIM card?'), tint: 'blueSoft' },
]);

const HALAL_STARTER = themed((): Starter => ({ icon: 'moon', color: Colors.jade, title: tx('Halal food'), subtitle: tx('Close to you'), prompt: tx('Halal food near me'), tint: 'jadeSoft' }));
const VEG_STARTER = themed((): Starter => ({ icon: 'leaf', color: Colors.jade, title: tx('Vegetarian food'), subtitle: tx('Close to you'), prompt: tx('Vegetarian food near me'), tint: 'jadeSoft' }));

function greeting(t: ReturnType<typeof useT>, name: string | null) {
  const hour = new Date().getHours();
  const part = hour < 5 ? t('Good night') : hour < 12 ? t('Good morning') : hour < 18 ? t('Good afternoon') : t('Good evening');
  return name ? `${part}, ${name}` : part;
}

export const PlacesChat = forwardRef<PlacesChatHandle, Props>(function PlacesChat({ chat, language, onBusyChange }, ref) {
  const t = useT();
  const { profile, session, refreshProfile } = useAuth();
  const location = useCurrentLocation();
  const [messages, setMessages] = useState<PlacesMessage[]>(chat.data.messages);
  const firstAsked = messages.find((m) => m.role === 'user')?.text;
  const saved = useMemo(() => ({ id: chat.id, title: chatTitle(firstAsked), data: { messages } }), [chat.id, firstAsked, messages]);
  useChatAutosave('places', saved, messages.length > 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedText, setFailedText] = useState<string | null>(null);
  const [fresh, setFresh] = useState<PlacesMessage | null>(null);
  const [questions, setQuestions] = useState<VisitCardData[]>([]);
  const scrollRef = useRef<ScrollViewInstance>(null);

  const here = location.coords;
  const nearest = here ? [...Cities].sort((a, b) => distanceKm(here, a) - distanceKm(here, b))[0] : null;
  const city = nearest && here && distanceKm(here, nearest) < 150 ? nearest.name : (profile?.city ?? null);
  const prefs = parsePreferences(profile?.preferences);
  const starters = [
    ...(prefs?.diet.includes('halal') ? [HALAL_STARTER] : prefs?.diet.some((d) => d === 'vegetarian' || d === 'vegan') ? [VEG_STARTER] : []),
    ...STARTERS,
  ].slice(0, 4);
  const name = profile?.display_name || session?.user.email?.split('@')[0] || null;

  // "Did you go?" questions Hao hasn't asked yet (after Navigate, a Voice Room, …). Asked once.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchUnaskedVisits()
        .then((list) => {
          if (cancelled || !list.length) return;
          setQuestions((shown) => [...shown, ...list.filter((v) => !shown.some((s) => s.visitId === v.visitId))]);
          markAsked(list.map((v) => v.visitId)).catch(() => {});
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [])
  );

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, busy, questions.length]);

  const send = async (raw: string, coords = here, image?: { data: string; mimeType: string }) => {
    const text = raw.trim();
    if ((!text && !image) || busy) return;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setFailedText(null);
    const before = messages;
    setMessages((m) => [...m, { role: 'user', text: text || t('Read this for me'), photo: !!image }]);
    try {
      const result = await askPlaces({ language: { code: language.code, name: language.name }, text, messages: before, location: coords, city, image });
      // Something was saved to the Hao DNA: show it in Me straight away.
      if (result.tools?.some((tool) => tool.tool === 'dna')) refreshProfile().catch(() => {});
      const reply: PlacesMessage = {
        role: 'hao',
        text: stripMarkdown(result.text),
        cards: result.cards,
        quickReplies: result.quick_replies,
        tools: result.tools,
        needsLocation: result.needs_location,
      };
      setFresh(reply);
      setMessages((m) => [...m, reply]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong'));
      // A photo isn't kept, so it can't be retried with one tap.
      setFailedText(image ? null : text);
      setMessages(before);
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  /** Menu and sign scanner: take a photo (or pick one) and let Hao read it. */
  const scan = async () => {
    if (busy) return;
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 0.4, base64: true };
    // On a phone the camera first (a menu is in front of you); the library when the camera isn't allowed or there's none.
    const camera = await ImagePicker.requestCameraPermissionsAsync().catch(() => null);
    const result = camera?.granted ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.base64) return;
    send('', here, { data: asset.base64, mimeType: asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg' });
  };

  useImperativeHandle(ref, () => ({ send: (text: string) => send(text), scan }));

  /** After the user shares their location, ask the same thing again. */
  const shareLocationAndRetry = async (index: number) => {
    if (!(await location.request())) return;
    const asked = [...messages.slice(0, index)].reverse().find((m) => m.role === 'user')?.text;
    // The hook's coords update on the next render, so read a fix here for this request.
    const fix = (await Location.getLastKnownPositionAsync().catch(() => null)) ?? (await Location.getCurrentPositionAsync().catch(() => null));
    if (asked && fix) send(asked, wgs84ToGcj02({ latitude: fix.coords.latitude, longitude: fix.coords.longitude }));
  };

  /** Keep answered visit questions answered when the chat is reopened. */
  const updateVisitCard = (messageIndex: number, visit: VisitCardData) =>
    setMessages((list) =>
      list.map((m, i) =>
        i !== messageIndex
          ? m
          : { ...m, cards: m.cards?.map((c) => (c.type === 'visit_confirm' && c.data.visitId === visit.visitId ? { ...c, data: visit } : c)) }
      )
    );

  const lastHao = [...messages].reverse().find((m) => m.role === 'hao');
  const empty = messages.length === 0;

  return (
    <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.feed} keyboardShouldPersistTaps="handled">
      {empty ? (
        <View style={styles.welcome}>
          <HaoMark />
          <Animated.Text entering={FadeInDown.duration(300)} style={styles.hello}>
            {greeting(t, name)}
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(60).duration(300)} style={styles.title}>
            {t('Where to next?')}
          </Animated.Text>

          <Pressable
            onPress={() => (here ? null : location.request())}
            style={({ pressed }) => [styles.locationChip, pressed && !here && styles.pressed]}
            accessibilityRole={here ? 'text' : 'button'}>
            <Ionicons name={here ? 'location' : 'location-outline'} size={14} color={here ? Colors.jade : ChatColors.soft} />
            <Text style={styles.locationText}>
              {here ? (city ? t('Near you · {city}', { city }) : t('Using your location')) : t('Turn on location for picks near you')}
            </Text>
          </Pressable>

          <View style={styles.starters}>
            {starters.map((s, i) => (
              <Animated.View key={s.title} entering={FadeInDown.delay(100 + i * 50).duration(300)} style={styles.starterCell}>
                <Pressable
                  onPress={() => send(t(s.prompt))}
                  style={({ pressed }) => [styles.starter, { backgroundColor: Colors[s.tint] }, pressed && styles.pressed]}
                  accessibilityRole="button">
                  <View style={styles.starterIcon}>
                    <Ionicons name={s.icon} size={20} color={s.color} />
                  </View>
                  <Text style={styles.starterTitle} numberOfLines={1}>
                    {t(s.title)}
                  </Text>
                  <Text style={styles.starterSub} numberOfLines={1}>
                    {t(s.subtitle)}
                  </Text>
                </Pressable>
              </Animated.View>
            ))}
          </View>

          <View style={styles.memoryRow}>
            <MemoryPill icon="bookmark" label={t('My Places')} onPress={() => router.navigate('/my-places')} />
            <MemoryPill icon="bed" label={t('My Hotels')} onPress={() => router.navigate({ pathname: '/my-places', params: { filter: 'hotels' } })} />
            <MemoryPill icon="journal-outline" label={t('Trip journal')} onPress={() => send(t('Make my trip journal for this month'))} />
            <MemoryPill icon="scan-outline" label={t('Scan a menu')} onPress={scan} />
          </View>

          <CommunityNudge nationality={profile?.nationality ?? null} sharing={!!profile?.share_visits} />
        </View>
      ) : null}

      {messages.map((m, i) =>
        m.role === 'user' ? (
          <UserMessage key={i} text={m.photo ? `📷 ${m.text}` : m.text} />
        ) : (
          <AssistantMessage key={i} text={m.text} animate={m === fresh} speech={language.speech} tools={m.tools}>
            {m.cards?.length ? <Cards cards={m.cards} onVisitChange={(v) => updateVisitCard(i, v)} /> : null}
            {m.needsLocation && !here ? (
              <Pressable onPress={() => shareLocationAndRetry(i)} style={({ pressed }) => [styles.shareLocation, pressed && styles.pressed]}>
                <Ionicons name="location" size={16} color="#fff" />
                <Text style={styles.shareLocationText}>{t('Share my location')}</Text>
              </Pressable>
            ) : null}
            {m === lastHao && m.quickReplies?.length ? <QuickReplies replies={m.quickReplies} onPress={(q) => send(q)} /> : null}
          </AssistantMessage>
        )
      )}

      {questions.length ? (
        <View style={styles.questions}>
          <View style={styles.questionsHeader}>
            <HaoMark />
            <Text style={styles.questionsTitle}>{questions.length === 1 ? t('Quick question') : t('A few quick questions')}</Text>
          </View>
          {questions.map((v) => (
            <VisitConfirmCard key={v.visitId} data={v} />
          ))}
        </View>
      ) : null}

      {busy ? <Thinking label={messages[messages.length - 1]?.photo ? t('Reading your photo…') : t('Finding places for you…')} /> : null}
      {error ? <ChatError message={error} onRetry={failedText ? () => send(failedText) : undefined} /> : null}
    </ScrollView>
  );
});

function Cards({ cards, onVisitChange }: { cards: ChatCard[]; onVisitChange: (visit: VisitCardData) => void }) {
  const visits = cards.filter((c) => c.type === 'visit_confirm');
  const carousel = cards.filter((c) => c.type === 'place' || c.type === 'food' || c.type === 'visited');
  return (
    <View style={{ gap: 12 }}>
      {cards.map((c, i) =>
        c.type === 'day_plan' || c.type === 'journal' ? (
          <MapListCard key={i} data={c.data} kind={c.type} />
        ) : c.type === 'menu' ? (
          <MenuCard key={i} data={c.data} />
        ) : null
      )}
      {visits.map((c) => (
        <VisitConfirmCard key={c.data.visitId} data={c.data} onChange={onVisitChange} />
      ))}
      {carousel.length ? (
        <CardCarousel count={carousel.length}>
          {carousel.map((c, i) =>
            c.type === 'visited' ? (
              <VisitedCard key={c.data.visitId} data={c.data} index={i} />
            ) : c.type === 'food' || c.type === 'place' ? (
              <PlaceCard key={c.data.place.id} data={c.data} variant={c.type} index={i} />
            ) : null
          )}
        </CardCarousel>
      ) : null}
    </View>
  );
}

function MemoryPill({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.memoryPill, pressed && styles.pressed]} accessibilityRole="button">
      <Ionicons name={icon} size={14} color={ChatColors.text} />
      <Text style={styles.memoryPillText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Explains the community ranking and invites the user to add their country or share visits. */
function CommunityNudge({ nationality, sharing }: { nationality: string | null; sharing: boolean }) {
  const t = useT();
  if (nationality && sharing) {
    return (
      <View style={[styles.nudge, styles.nudgeOn]}>
        <View style={[styles.nudgeIcon, { backgroundColor: Colors.card }]}>
          <Ionicons name="people" size={18} color={Colors.jade} />
        </View>
        <Text style={styles.nudgeText}>{t('Picks are ranked by what people from {country} liked. Thanks for sharing yours.', { country: countryName(nationality) })}</Text>
      </View>
    );
  }
  return (
    <Pressable onPress={() => router.push('/profile')} style={({ pressed }) => [styles.nudge, pressed && styles.pressed]} accessibilityRole="button">
      <View style={styles.nudgeIcon}>
        <Ionicons name={nationality ? 'people' : 'earth'} size={18} color={Colors.jade} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.nudgeTitle}>
          {nationality ? t('Help people from {country}', { country: countryName(nationality) }) : t('Where are you from?')}
        </Text>
        <Text style={styles.nudgeText}>
          {nationality
            ? t('Share your visits anonymously so others from home find places they’ll love.')
            : t('Hao can rank places by what people from your country loved.')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={ChatColors.faint} />
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  feed: { paddingHorizontal: 20, paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: 22, flexGrow: 1 },
  welcome: { flexGrow: 1, justifyContent: 'center', gap: 10, paddingVertical: Spacing.md },
  hello: { fontSize: 15, fontWeight: '600', color: ChatColors.soft, marginTop: 6 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800', color: ChatColors.text, letterSpacing: -0.5 },
  locationChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: ChatColors.userBubble,
  },
  locationText: { fontSize: 13, fontWeight: '500', color: ChatColors.text },
  starters: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginTop: 8 },
  starterCell: { width: '48.5%' },
  starter: { borderRadius: 18, padding: 14, gap: 2, minHeight: 104, justifyContent: 'flex-end' },
  starterIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: pick('rgba(255,255,255,0.75)', 'rgba(0,0,0,0.25)'), alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  starterTitle: { fontSize: 15, fontWeight: '700', color: ChatColors.text },
  starterSub: { fontSize: 12.5, color: ChatColors.soft },
  memoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  memoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: ChatColors.border,
    backgroundColor: ChatColors.surface,
  },
  memoryPillText: { fontSize: 13, fontWeight: '500', color: ChatColors.text },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginTop: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ChatColors.border,
    backgroundColor: ChatColors.surface,
  },
  nudgeOn: { backgroundColor: Colors.jadeSoft, borderColor: Colors.jadeSoft },
  nudgeIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.jadeSoft, alignItems: 'center', justifyContent: 'center' },
  nudgeTitle: { fontSize: 14, fontWeight: '700', color: ChatColors.text },
  nudgeText: { flex: 1, fontSize: 13, lineHeight: 18, color: ChatColors.soft },
  shareLocation: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: Radius.pill,
    backgroundColor: Colors.jade,
  },
  shareLocationText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  questions: { gap: 12 },
  questionsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  questionsTitle: { fontSize: 14, fontWeight: '600', color: ChatColors.soft },
}));
