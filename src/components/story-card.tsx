import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StoryTypeMeta, StoryView } from '@/components/story-view';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { runStoryAction } from '@/lib/story-actions';
import { logStoryEvent, type Story } from '@/lib/stories';

/** A Discover story inside a chat reply. Tapping it opens the story full screen. */
export function StoryCard({ story }: { story: Story }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const meta = StoryTypeMeta[story.type];
  const image = story.slides.find((s) => s.image_url)?.image_url;

  const show = () => {
    setOpen(true);
    logStoryEvent(story.id, 'view', { slide: 0 });
  };

  return (
    <>
      <Pressable
        onPress={show}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel={`${t(meta.label)}: ${story.title}. ${t('Made by Hao AI')}. ${t('Open story')}`}>
        <View style={[styles.thumb, { backgroundColor: meta.color }]}>
          {image ? <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name={meta.icon} size={28} color="#fff" />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.kind}>{t(meta.label)}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {story.title}
          </Text>
          <Text style={styles.label}>
            <Ionicons name="sparkles" size={11} color={Colors.muted} /> {t('Made by Hao AI')}
          </Text>
        </View>
        <Ionicons name="play-circle" size={28} color={Colors.red} />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <StoryView
            story={story}
            height={height}
            topInset={insets.top + Spacing.sm}
            active={open}
            onNextStory={() => setOpen(false)}
            onPrevStory={() => {}}
            onSlideChange={(slide) => {
              if (slide === story.slides.length - 1) logStoryEvent(story.id, 'complete', { slide });
            }}
            onAction={(action) => {
              if (action.kind !== 'save_place') setOpen(false);
              runStoryAction(story, action, t).catch(() => {});
            }}
            onMenu={() => setOpen(false)}
          />
          <Pressable
            onPress={() => setOpen(false)}
            style={[styles.close, { top: insets.top + 44 }]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('Close')}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = themed(() => StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    marginTop: Spacing.sm,
  },
  thumb: { width: 56, height: 72, borderRadius: Radius.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  kind: { fontSize: 12, fontWeight: '800', color: Colors.red, textTransform: 'uppercase', letterSpacing: 0.4 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  label: { fontSize: 12, color: Colors.muted },
  close: { position: 'absolute', right: Spacing.md, padding: 6, borderRadius: Radius.pill, backgroundColor: 'rgba(0,0,0,0.6)' },
}));
