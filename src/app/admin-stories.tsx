import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Slide, StorySource, StoryType } from '@shared/stories/schema';

import { StoryTypeMeta } from '@/components/story-view';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type Draft = {
  id: string;
  type: StoryType;
  city: string | null;
  nationality: string | null;
  language: string;
  title: string;
  slides: Slide[];
  sources: StorySource[];
  created_at: string;
  generated_by_model: string;
  attribution: string | null;
};

async function call(method: 'GET' | 'POST', body?: unknown) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/admin/stories', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json;
}

/** Admins review AI-written stories (culture, place, food, community) before they reach the feed. */
export default function AdminStoriesScreen() {
  const t = useT();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    call('GET')
      .then((r) => setDrafts(r.drafts))
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const decide = (id: string, decision: 'approve' | 'reject') => {
    setDrafts((list) => list?.filter((d) => d.id !== id) ?? null);
    call('POST', { id, decision }).catch((e: Error) => {
      setError(e.message);
      load();
    });
  };

  const generate = () => {
    setGenerating(true);
    setNote(null);
    call('POST', { generate: true })
      .then((r) => {
        setNote(t('Created {created}, rejected {rejected}, {calls} model calls', { created: r.created, rejected: r.rejected, calls: r.model_calls }));
        load();
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setGenerating(false));
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel={t('Go back')}>
          <Ionicons name="chevron-back" size={22} color={Colors.ink} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {t('Review stories')}
        </Text>
        <Pressable onPress={generate} disabled={generating} style={styles.back} accessibilityRole="button" accessibilityLabel={t('Generate stories now')}>
          {generating ? <ActivityIndicator color={Colors.red} /> : <Ionicons name="sparkles" size={20} color={Colors.red} />}
        </Pressable>
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={drafts ?? []}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          drafts === null ? <ActivityIndicator color={Colors.red} style={{ marginTop: Spacing.xl }} /> : <Text style={styles.empty}>{t('No drafts waiting.')}</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.meta}>
              {t(StoryTypeMeta[item.type].label)} · {item.city ?? t('All cities')}
              {item.nationality ? ` · ${item.nationality}` : ''} · {item.language} · {item.generated_by_model}
            </Text>
            <Text style={styles.storyTitle}>{item.title}</Text>
            {item.attribution ? <Text style={styles.source}>{item.attribution}</Text> : null}
            {item.slides.map((s, i) => (
              <View key={i} style={styles.slide}>
                <Text style={styles.heading}>
                  {i + 1}. {s.heading}
                  {s.image_kind !== 'none' ? `  [${s.image_kind}${s.image_credit ? `: ${s.image_credit}` : ''}]` : ''}
                </Text>
                <Text style={styles.body}>{s.body}</Text>
              </View>
            ))}
            <Text style={styles.sourcesTitle}>{t('Written from')}</Text>
            {item.sources.map((s, i) => (
              <Text key={i} style={styles.source} numberOfLines={4}>
                [{s.kind}] {s.facts}
              </Text>
            ))}
            <View style={styles.buttons}>
              <Pressable onPress={() => decide(item.id, 'reject')} style={[styles.button, styles.reject]} accessibilityRole="button">
                <Text style={[styles.buttonText, { color: Colors.redDark }]}>{t('Reject')}</Text>
              </Pressable>
              <Pressable onPress={() => decide(item.id, 'approve')} style={[styles.button, styles.approve]} accessibilityRole="button">
                <Text style={[styles.buttonText, { color: '#fff' }]}>{t('Approve')}</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.paper },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: Colors.ink },
  note: { color: Colors.jade, paddingHorizontal: Spacing.md, fontWeight: '600' },
  error: { color: Colors.redDark, paddingHorizontal: Spacing.md },
  list: { padding: Spacing.md, gap: Spacing.md },
  empty: { color: Colors.inkSoft, textAlign: 'center', marginTop: Spacing.xl },
  card: { backgroundColor: Colors.card, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.line },
  meta: { color: Colors.muted, fontSize: 12, fontWeight: '700' },
  storyTitle: { color: Colors.ink, fontSize: 18, fontWeight: '800' },
  slide: { gap: 2 },
  heading: { color: Colors.ink, fontWeight: '700' },
  body: { color: Colors.inkSoft, lineHeight: 20 },
  sourcesTitle: { color: Colors.muted, fontSize: 12, fontWeight: '800', marginTop: Spacing.sm, textTransform: 'uppercase' },
  source: { color: Colors.inkSoft, fontSize: 12, lineHeight: 17 },
  buttons: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  button: { flex: 1, minHeight: 44, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  reject: { backgroundColor: Colors.redSoft },
  approve: { backgroundColor: Colors.jade },
  buttonText: { fontWeight: '800', fontSize: 15 },
}));
