// SOS: one sheet with everything for an emergency in China, no chat needed. Tap to call 110 / 120 / 119 / 122,
// your location in Chinese to read (or play) to the operator, your embassy, and help phrases to show people.
// Works offline: only the area name needs the network, and the last one found is kept.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SpeakButton } from '@/components/speak-button';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useCurrentLocation } from '@/lib/location';
import { dialable, embassyFor, EMERGENCY_NUMBERS, HELP_PHRASES, whereabouts, type Whereabouts } from '@/lib/sos';

/** Mount it only while open: it asks for the location when it opens. */
export function SosSheet({ onClose }: { onClose: () => void }) {
  const visible = true;
  const t = useT();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const location = useCurrentLocation({ askOnMount: true, precise: true });
  const [where, setWhere] = useState<Whereabouts | null>(null);
  const embassy = embassyFor(profile?.nationality);

  const lat = location.coords?.latitude;
  const lng = location.coords?.longitude;
  useEffect(() => {
    if (!visible || lat === undefined || lng === undefined) return;
    let cancelled = false;
    whereabouts({ latitude: lat, longitude: lng }).then((w) => !cancelled && setWhere(w), () => {});
    return () => {
      cancelled = true;
    };
  }, [visible, lat, lng]);

  const call = (number: string) => Linking.openURL(`tel:${number}`).catch(() => {});

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('Close')} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.md }]}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('Emergency')}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('Close')}>
            <Ionicons name="close" size={24} color={Colors.inkSoft} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: Spacing.md }} showsVerticalScrollIndicator={false}>
          <View style={styles.numbers}>
            {EMERGENCY_NUMBERS.map((n) => (
              <Pressable
                key={n.number}
                onPress={() => call(n.number)}
                style={({ pressed }) => [styles.number, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={t('Call {number}: {service}', { number: n.number, service: t(n.label) })}>
                <Ionicons name={n.icon} size={20} color="#fff" />
                <Text style={styles.numberText}>{n.number}</Text>
                <Text style={styles.numberLabel} numberOfLines={1}>
                  {t(n.label)} · {n.zh}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>{t('Operators may not speak English. Read or play your location below.')}</Text>

          <View style={styles.box}>
            <View style={styles.boxHeader}>
              <Ionicons name="location" size={18} color={Colors.red} />
              <Text style={styles.boxTitle}>{t('Where I am (in Chinese)')}</Text>
              {where ? <SpeakButton text={where.sentence} /> : null}
            </View>
            {where ? (
              <Text style={styles.zhBig} selectable>
                {where.sentence}
              </Text>
            ) : location.status === 'loading' || location.coords ? (
              <ActivityIndicator color={Colors.red} style={{ alignSelf: 'flex-start' }} />
            ) : (
              <Pressable onPress={() => location.request()} accessibilityRole="button">
                <Text style={styles.link}>
                  {location.status === 'unavailable' ? t('Turn on location services to show where you are') : t('Allow location to show where you are')}
                </Text>
              </Pressable>
            )}
          </View>

          <View style={styles.box}>
            <View style={styles.boxHeader}>
              <Ionicons name="flag" size={18} color={Colors.red} />
              <Text style={styles.boxTitle}>{embassy ? t('{country} embassy in Beijing', { country: embassy.country }) : t('Your embassy')}</Text>
            </View>
            {embassy ? (
              <>
                <Text style={styles.body}>{embassy.address}</Text>
                <Pressable onPress={() => call(dialable(embassy.phone))} style={({ pressed }) => [styles.callRow, pressed && styles.pressed]} accessibilityRole="button">
                  <Ionicons name="call" size={16} color={Colors.red} />
                  <Text style={styles.callText}>{embassy.phone}</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.body}>{t('Add your nationality in Me and Hao will show your embassy here.')}</Text>
            )}
          </View>

          <View style={styles.box}>
            <View style={styles.boxHeader}>
              <Ionicons name="chatbox-ellipses" size={18} color={Colors.red} />
              <Text style={styles.boxTitle}>{t('Show or play to people nearby')}</Text>
            </View>
            {HELP_PHRASES.map((p) => (
              <View key={p.zh} style={styles.phrase}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.zh}>{p.zh}</Text>
                  <Text style={styles.pinyin}>
                    {p.pinyin} · {t(p.en)}
                  </Text>
                </View>
                <SpeakButton text={p.zh} />
              </View>
            ))}
          </View>
          <Text style={styles.hint}>{t('DiDi and Alipay also have SOS buttons linked to emergency services.')}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: { maxHeight: '88%', backgroundColor: Colors.paper, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.sm },
    handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.line },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: 22, fontWeight: '800', color: Colors.red },
    numbers: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
    number: { width: '48.5%', borderRadius: 16, padding: 12, gap: 2, backgroundColor: Colors.red },
    numberText: { fontSize: 26, fontWeight: '800', color: '#fff' },
    numberLabel: { fontSize: 13, fontWeight: '600', color: '#fff' },
    hint: { fontSize: 13, color: Colors.inkSoft },
    box: { borderRadius: 16, padding: 14, gap: 8, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.line },
    boxHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    boxTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.ink },
    zhBig: { fontSize: 18, lineHeight: 27, fontWeight: '600', color: Colors.ink },
    body: { fontSize: 14, lineHeight: 20, color: Colors.ink },
    link: { fontSize: 14, fontWeight: '600', color: Colors.red },
    callRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.pill, backgroundColor: Colors.redSoft },
    callText: { fontSize: 15, fontWeight: '700', color: Colors.red },
    phrase: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
    zh: { fontSize: 17, fontWeight: '700', color: Colors.ink },
    pinyin: { fontSize: 13, color: Colors.inkSoft },
  })
);
