// Hao's mascot, alive in the chat the way Dot's orb or Muse's character is: it floats and breathes while idle,
// changes pose with what Hao is doing (hello, translating, finding places, thinking, done), pops a speech bubble,
// and hops and cheers when tapped. Poses are stills (assets/images/buddy); all motion is Reanimated, so no
// extra native module. "Reduce motion" keeps it still.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, type ImageRef } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Colors, themed } from '@/constants/theme';

export type BuddyMood = 'hello' | 'translate' | 'map' | 'thinking' | 'success';

const POSES = {
  // The waving pose is the cheering one, waved side to side.
  hello: require('../../assets/images/buddy/success.png'),
  translate: require('../../assets/images/buddy/translate.png'),
  map: require('../../assets/images/buddy/map.png'),
  thinking: require('../../assets/images/buddy/thinking.png'),
  success: require('../../assets/images/buddy/success.png'),
} as const;

// Decoded poses, loaded into memory when the app starts (this module loads with the chat), so Hao appears on the
// same frame as the text around it instead of a beat later while the PNG is read and decoded.
const decoded: Partial<Record<BuddyMood, ImageRef>> = {};
for (const mood of Object.keys(POSES) as BuddyMood[]) {
  Image.loadAsync(POSES[mood])
    .then((ref) => (decoded[mood] = ref))
    .catch(() => {});
}

/** What the bubble shows for each mood when the caller passes no `say`. */
const BUBBLES: Record<BuddyMood, ReactNode> = {
  hello: <Text style={{ fontSize: 15, fontWeight: '800', color: '#1B1B1F' }}>你好!</Text>,
  translate: <Text style={{ fontSize: 15, fontWeight: '800', color: '#1B1B1F' }}>文A</Text>,
  map: <Ionicons name="location" size={18} color={Colors.red} />,
  thinking: <Dots />,
  success: <Ionicons name="checkmark" size={20} color="#1B1B1F" />,
};

const ease = Easing.inOut(Easing.sin);

export function HaoBuddy({
  mood = 'hello',
  size = 120,
  bubble = true,
  say,
}: {
  mood?: BuddyMood;
  size?: number;
  /** Show the speech bubble (off for small sizes like the thinking row). */
  bubble?: boolean;
  /** Text for the bubble instead of the mood's symbol. */
  say?: string;
}) {
  const reduce = useReducedMotion();
  const [cheer, setCheer] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const shown: BuddyMood = cheer ? 'success' : mood;
  // The pose Hao first appears in shows at once; later poses crossfade in.
  const [initial] = useState(shown);

  const float = useSharedValue(0);
  const tilt = useSharedValue(0);
  const pop = useSharedValue(1);
  const hop = useSharedValue(0);
  const bubbleIn = useSharedValue(0);

  // Idle: a slow float and breath; thinking bobs faster and rocks its head.
  useEffect(() => {
    if (reduce) return;
    const period = shown === 'thinking' ? 520 : 1500;
    float.value = 0;
    float.value = withRepeat(withTiming(1, { duration: period, easing: ease }), -1, true);
    if (shown === 'thinking') {
      tilt.value = withRepeat(withSequence(withTiming(-4, { duration: 700, easing: ease }), withTiming(4, { duration: 700, easing: ease })), -1, true);
    } else if (shown === 'hello') {
      // Two waves, then settle.
      tilt.value = withSequence(
        ...[0, 1].flatMap(() => [withTiming(-7, { duration: 220, easing: ease }), withTiming(7, { duration: 220, easing: ease })]),
        withSpring(0, { damping: 8 })
      );
    } else {
      tilt.value = withSpring(0);
    }
    return () => {
      cancelAnimation(float);
      cancelAnimation(tilt);
    };
  }, [shown, reduce, float, tilt]);

  // A squash-and-pop whenever the pose changes, and the bubble pops in after it.
  useEffect(() => {
    if (reduce) {
      bubbleIn.value = 1;
      return;
    }
    pop.value = withSequence(withTiming(0.86, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 220 }));
    bubbleIn.value = 0;
    bubbleIn.value = withDelay(120, withSpring(1, { damping: 9, stiffness: 180 }));
  }, [shown, say, reduce, pop, bubbleIn]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onPress = () => {
    if (!reduce) hop.value = withSequence(withTiming(-size * 0.16, { duration: 160, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 6, stiffness: 260 }));
    setCheer(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCheer(false), 1400);
  };

  const lift = size * 0.05;
  const body = useAnimatedStyle(() => ({
    transform: [
      { translateY: -float.value * lift + hop.value },
      { rotate: `${tilt.value}deg` },
      { scaleX: pop.value * (1 + float.value * 0.012) },
      { scaleY: pop.value * (1 + float.value * 0.025) },
    ],
  }));
  const shadow = useAnimatedStyle(() => {
    const up = float.value + -hop.value / (size * 0.16);
    return { opacity: 0.1 - up * 0.04, transform: [{ scaleX: 1 - up * 0.16 }] };
  });
  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, bubbleIn.value * 1.5),
    transform: [{ translateY: (1 - bubbleIn.value) * 8 - float.value * lift * 0.6 }, { scale: 0.4 + bubbleIn.value * 0.6 }],
  }));

  const side = size * 0.44;
  return (
    <Pressable onPress={onPress} accessibilityRole="image" accessibilityLabel="Hao" style={{ width: size * 1.3, height: size * 1.12, alignItems: 'center', justifyContent: 'flex-end' }}>
      <Animated.View style={[styles.shadow, { width: size * 0.5, height: size * 0.05, borderRadius: size, bottom: size * 0.02 }, shadow]} />
      <Animated.View style={[{ width: size, height: size, position: 'absolute', bottom: size * 0.04, transformOrigin: 'bottom' }, body]}>
        <Image source={decoded[shown] ?? POSES[shown]} style={{ width: size, height: size }} contentFit="contain" transition={shown === initial ? null : 140} priority="high" />
      </Animated.View>
      {bubble ? (
        <Animated.View style={[styles.bubble, { minWidth: side, height: side * 0.78, right: 0, top: 0, transformOrigin: 'bottom left' }, bubbleStyle]}>
          {say ? (
            <Text style={styles.say} numberOfLines={1}>
              {say}
            </Text>
          ) : (
            BUBBLES[shown]
          )}
          <View style={styles.tail} />
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

/** Three dots bouncing in turn, for the thinking bubble. */
function Dots() {
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} delay={i * 140} />
      ))}
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const reduce = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    y.value = withDelay(delay, withRepeat(withSequence(withTiming(-4, { duration: 260, easing: ease }), withTiming(0, { duration: 260, easing: ease }), withTiming(0, { duration: 260 })), -1));
    return () => cancelAnimation(y);
  }, [delay, reduce, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#1B1B1F' }, style]} />;
}

const styles = themed(() =>
  StyleSheet.create({
    shadow: { position: 'absolute', backgroundColor: '#000' },
    bubble: {
      position: 'absolute',
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    // A small rotated square under the bubble's left edge, pointing at Hao.
    tail: { position: 'absolute', bottom: -4, left: 12, width: 10, height: 10, backgroundColor: '#FFFFFF', transform: [{ rotate: '45deg' }] },
    say: { fontSize: 14, fontWeight: '700', color: '#1B1B1F', maxWidth: 160 },
  })
);
