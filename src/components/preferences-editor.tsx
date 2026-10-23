import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import {
  AutonomyLabels,
  BudgetLabels,
  CommonAllergies,
  DefaultPreferences,
  DietLabels,
  SpiceLabels,
} from '@shared/ai/preferences';
import type { AutonomyKey, Budget, DietTag, Preferences, SpiceLevel } from '@shared/ai/types';
import { useT } from '@/lib/i18n';

type Props = { value: Preferences; onChange: (next: Preferences) => void };

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

export function PreferencesEditor({ value, onChange }: Props) {
  const t = useT();
  return (
    <View style={styles.wrap}>
      <Group title={t('Diet')}>
        {(Object.keys(DietLabels) as DietTag[]).map((d) => (
          <Pill
            key={d}
            label={t(DietLabels[d].en)}
            selected={value.diet.includes(d)}
            onPress={() => onChange({ ...value, diet: toggle(value.diet, d) })}
          />
        ))}
      </Group>

      <Group title={t('Allergies')}>
        {CommonAllergies.map((a) => (
          <Pill
            key={a}
            label={a.charAt(0).toUpperCase() + a.slice(1)}
            selected={value.allergies.includes(a)}
            onPress={() => onChange({ ...value, allergies: toggle(value.allergies, a) })}
          />
        ))}
      </Group>

      <Group title={t('Spice')}>
        <Segmented
          options={(Object.keys(SpiceLabels) as SpiceLevel[]).map((s) => ({ key: s, label: t(SpiceLabels[s].en) }))}
          selected={value.spice}
          onSelect={(spice) => onChange({ ...value, spice })}
        />
      </Group>

      <Group title={t('Budget')}>
        <Segmented
          options={(Object.keys(BudgetLabels) as Budget[]).map((b) => ({ key: b, label: t(BudgetLabels[b].en) }))}
          selected={value.budget}
          onSelect={(budget) => onChange({ ...value, budget })}
        />
        <Text style={styles.hint}>{t(BudgetLabels[value.budget].range)}</Text>
      </Group>

      <Group title={t('Hao may decide for me')}>
        {(Object.keys(AutonomyLabels) as AutonomyKey[]).map((a) => {
          const autonomy = value.autonomy ?? DefaultPreferences.autonomy ?? [];
          return (
            <Pill
              key={a}
              label={t(AutonomyLabels[a])}
              selected={autonomy.includes(a)}
              onPress={() => onChange({ ...value, autonomy: toggle(autonomy, a) })}
            />
          );
        })}
        <Text style={styles.hint}>{t('Allergies, payments and anything over budget always come back to you.')}</Text>
      </Group>
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.pills}>{children}</View>
    </View>
  );
}

function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [styles.pill, selected && styles.pillSelected, pressed && { opacity: 0.7 }]}>
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function Segmented<K extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { key: K; label: string }[];
  selected: K;
  onSelect: (key: K) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.key === selected;
        return (
          <Pressable
            key={o.key}
            onPress={() => onSelect(o.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentActive]}>
            <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: Spacing.sm, gap: Spacing.md },
  group: { gap: Spacing.sm },
  groupTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.paper,
  },
  pillSelected: { backgroundColor: Colors.red, borderColor: Colors.red },
  pillText: { fontSize: 13, fontWeight: '600', color: Colors.inkSoft },
  pillTextSelected: { color: '#fff' },
  segmented: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.paper,
    borderRadius: Radius.sm,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentActive: { backgroundColor: Colors.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  segmentText: { fontSize: 13, fontWeight: '600', color: Colors.muted },
  segmentTextActive: { color: Colors.ink },
  hint: { width: '100%', fontSize: 12, color: Colors.muted },
});
