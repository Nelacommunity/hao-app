import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import type { GuideState } from '@/lib/discover';
import { useT } from '@/lib/i18n';

/** Width the rail takes on the right; item panels leave this much room for it. */
export const RAIL_WIDTH = 64;

type RailProps = {
  /** Hao is explaining this item (loading or speaking). */
  guide: 'idle' | 'loading' | 'speaking';
  liked: boolean;
  likes: number;
  /** Omit to hide the save button (e.g. phrases). */
  saved?: boolean;
  onGuide: () => void;
  onLike: () => void;
  onSave?: () => void;
  onShare: () => void;
};

const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** The buttons down the right of every Discover item: Hao explains it aloud, like, save, share. */
export function DiscoverRail({ guide, liked, likes, saved, onGuide, onLike, onSave, onShare }: RailProps) {
  const t = useT();
  return (
    <View style={styles.rail} pointerEvents="box-none">
      <Pressable
        onPress={onGuide}
        style={({ pressed }) => [styles.guide, guide !== 'idle' && styles.guideOn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={guide === 'idle' ? t('Hao explains this aloud') : t('Stop Hao')}>
        {guide === 'loading' ? <ActivityIndicator color="#fff" /> : guide === 'speaking' ? <Ionicons name="stop" size={20} color="#fff" /> : <Text style={styles.guideMark}>好</Text>}
      </Pressable>
      <Text style={styles.label}>{guide === 'idle' ? t('Listen') : guide === 'loading' ? t('…') : t('Stop')}</Text>

      <Pressable onPress={onLike} style={({ pressed }) => [styles.btn, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ selected: liked }} accessibilityLabel={liked ? t('Unlike') : t('Like')}>
        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={28} color={liked ? '#FF4D5E' : '#fff'} />
      </Pressable>
      <Text style={styles.label}>{likes ? compact(likes) : t('Like')}</Text>

      {onSave ? (
        <>
          <Pressable onPress={onSave} style={({ pressed }) => [styles.btn, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ selected: !!saved }} accessibilityLabel={saved ? t('Unsave') : t('Save')}>
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={26} color={saved ? Colors.gold : '#fff'} />
          </Pressable>
          <Text style={styles.label}>{saved ? t('Saved') : t('Save')}</Text>
        </>
      ) : null}

      <Pressable onPress={onShare} style={({ pressed }) => [styles.btn, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={t('Share')}>
        <Ionicons name="arrow-redo" size={26} color="#fff" />
      </Pressable>
      <Text style={styles.label}>{t('Share')}</Text>
    </View>
  );
}

/** What Hao is saying about the item on screen, under the header, with replay, stop and "Ask Hao more". */
export function GuideCaption({ state, top, onStop, onReplay, onAsk }: { state: GuideState; top: number; onStop: () => void; onReplay: () => void; onAsk: () => void }) {
  const t = useT();
  if (!state) return null;
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={[styles.caption, { top }]}>
      <View style={styles.captionHead}>
        <View style={styles.mark}>
          <Text style={styles.markText}>好</Text>
        </View>
        <Text style={styles.captionTitle}>
          {state.status === 'loading' ? t('Hao is getting ready…') : state.status === 'error' ? t('Hao couldn’t explain this') : state.status === 'speaking' ? t('Hao is explaining') : t('Hao explained')}
        </Text>
        <Pressable onPress={onStop} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('Close')}>
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.8)" />
        </Pressable>
      </View>
      {state.status === 'error' ? (
        <Text style={styles.captionText}>{state.error}</Text>
      ) : state.text ? (
        <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
          <Text style={styles.captionText} selectable>
            {state.text}
          </Text>
        </ScrollView>
      ) : null}
      {state.text ? (
        <View style={styles.captionActions}>
          <Pressable onPress={state.status === 'speaking' ? onStop : onReplay} style={({ pressed }) => [styles.captionBtn, pressed && styles.pressed]} accessibilityRole="button">
            <Ionicons name={state.status === 'speaking' ? 'pause' : 'play'} size={15} color="#fff" />
            <Text style={styles.captionBtnText}>{state.status === 'speaking' ? t('Stop') : t('Play again')}</Text>
          </Pressable>
          <Pressable onPress={onAsk} style={({ pressed }) => [styles.captionBtn, pressed && styles.pressed]} accessibilityRole="button">
            <Ionicons name="chatbubbles" size={15} color="#fff" />
            <Text style={styles.captionBtnText}>{t('Ask Hao more')}</Text>
          </Pressable>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = themed(() => StyleSheet.create({
  rail: { position: 'absolute', right: Spacing.sm, bottom: Spacing.lg, width: RAIL_WIDTH - Spacing.sm, alignItems: 'center', gap: 2 },
  guide: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: Colors.red,
    borderWidth: 2,
    borderColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  guideOn: { backgroundColor: Colors.redDark, borderColor: '#fff' },
  guideMark: { color: Colors.gold, fontSize: 24, fontWeight: '900' },
  btn: { width: 50, height: 46, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
  label: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },
  caption: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(12,10,14,0.9)',
    gap: Spacing.sm,
  },
  captionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  mark: { width: 24, height: 24, borderRadius: 7, backgroundColor: Colors.red, alignItems: 'center', justifyContent: 'center' },
  markText: { color: Colors.gold, fontWeight: '900', fontSize: 13 },
  captionTitle: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '800' },
  captionText: { color: '#fff', fontSize: 16, lineHeight: 24 },
  captionActions: { flexDirection: 'row', gap: Spacing.sm },
  captionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  captionBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
}));
