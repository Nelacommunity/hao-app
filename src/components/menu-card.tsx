// A photo Hao read (menu and sign scanner). Menus list each dish in the traveller's language with its price and
// spice, Hao's picks first, and a red warning on anything that clashes with their Hao DNA. Signs show the
// translation. Tap a dish to hear its Chinese name, to point at or say when ordering.
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { ChatColors } from '@/components/chat-ui';
import { SpeakButton } from '@/components/speak-button';
import { Colors, Radius, themed } from '@/constants/theme';
import type { MenuCardData, MenuItem } from '@/data/place-cards';
import { tx, useT } from '@/lib/i18n';

// What the server's own diet check found (conflictOf), when the model gave no warning of its own.
const CLASHES: Record<string, string> = {
  halal: tx('May not be halal'),
  no_pork: tx('May contain pork'),
  vegetarian: tx('May contain meat'),
  no_beef: tx('May contain beef'),
  no_seafood: tx('May contain seafood'),
};

function warningOf(t: ReturnType<typeof useT>, item: MenuItem) {
  if (item.warning) return item.warning;
  if (!item.clash) return '';
  if (item.clash.startsWith('allergy:')) return t('Ask about {allergy}: you’re allergic', { allergy: item.clash.slice(8) });
  return t(CLASHES[item.clash] ?? 'Check before ordering');
}

export function MenuCard({ data }: { data: MenuCardData }) {
  const t = useT();
  const picks = new Set(data.picks);
  // Picks first, then the rest in menu order; dishes to avoid stay where they are, marked.
  const items = [...data.items.filter((i) => picks.has(i.name)), ...data.items.filter((i) => !picks.has(i.name))];
  const flagged = data.items.filter((i) => warningOf(t, i)).length;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Ionicons name={data.kind === 'menu' ? 'restaurant' : 'document-text'} size={18} color={Colors.red} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>
            {data.title || (data.kind === 'menu' ? t('Menu') : t('Translation'))}
          </Text>
          {data.kind === 'menu' ? (
            <Text style={[styles.subtitle, flagged ? { color: Colors.redDark } : null]}>
              {flagged ? t('{count} may not suit your diet', { count: flagged }) : t('Nothing clashes with your Hao DNA')}
            </Text>
          ) : null}
        </View>
      </View>

      {data.kind !== 'menu' || !items.length ? <Text style={styles.summary}>{data.summary}</Text> : null}

      {items.map((item, i) => {
        const warning = warningOf(t, item);
        return (
          <View key={`${item.zh}-${i}`} style={[styles.dish, warning ? styles.dishWarn : null]}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.nameRow}>
                {picks.has(item.name) && !warning ? <Ionicons name="star" size={13} color={Colors.gold} /> : null}
                <Text style={styles.name} numberOfLines={2}>
                  {item.name}
                </Text>
              </View>
              <Text style={styles.zh}>
                {item.zh}
                {item.spicy ? `  ${'🌶️'.repeat(item.spicy)}` : ''}
              </Text>
              {item.contains.length ? (
                <Text style={styles.contains} numberOfLines={1}>
                  {item.contains.join(' · ')}
                </Text>
              ) : null}
              {warning ? (
                <View style={styles.warning}>
                  <Ionicons name="warning" size={13} color={Colors.redDark} />
                  <Text style={styles.warningText}>{warning}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.side}>
              {item.price ? <Text style={styles.price}>{item.price}</Text> : null}
              <SpeakButton text={item.zh} size={16} />
            </View>
          </View>
        );
      })}

      {data.kind === 'menu' ? (
        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('Tap the speaker to hear a dish in Chinese, or point at it on the menu.')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: { backgroundColor: ChatColors.surface, borderRadius: 20, borderWidth: 1, borderColor: ChatColors.border, overflow: 'hidden' },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
    icon: { width: 36, height: 36, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.redSoft },
    title: { fontSize: 16, fontWeight: '700', color: ChatColors.text },
    subtitle: { fontSize: 12.5, color: ChatColors.soft, marginTop: 1 },
    summary: { fontSize: 15, lineHeight: 21, color: ChatColors.text, paddingHorizontal: 14, paddingBottom: 14 },
    dish: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ChatColors.border },
    dishWarn: { backgroundColor: Colors.redSoft },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    name: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: ChatColors.text },
    zh: { fontSize: 14, color: ChatColors.soft },
    contains: { fontSize: 12.5, color: ChatColors.faint },
    warning: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    warningText: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: Colors.redDark },
    side: { alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 },
    price: { fontSize: 15, fontWeight: '700', color: ChatColors.text },
    footer: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ChatColors.border },
    footerText: { fontSize: 12.5, color: ChatColors.faint },
  })
);
