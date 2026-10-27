import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

// The animated start-up screen, shown over the app for ~2 s after the native splash (a still image)
// hides. Its first frame is identical to the native splash (red, the gold 好 mark, 140 pt wide; see
// expo-splash-screen in app.json), so the hand-off is invisible; then an Instagram-style gradient fades in,
// the mark springs, rings pulse out like a call, "hello" floats up in many languages, and it all fades
// into the app. Built with Reanimated (no extra native module); "Reduce motion" gets a short fade.

const RED = '#D7263D';
const GOLD = '#F2B33D';
/** Hao's colours in an Instagram-like sweep: gold → orange → red → magenta. */
const GRADIENT = ['#F7C24A', '#F07A3A', '#D7263D', '#A3175A'] as const;
const LOGO = 140;
const TOTAL_MS = 2100;
const EXIT_MS = 380;

const GREETINGS = [
  { text: '你好', x: 0.18, y: 0.24, delay: 250 },
  { text: 'Hello', x: 0.72, y: 0.2, delay: 380 },
  { text: 'Habari', x: 0.14, y: 0.62, delay: 520 },
  { text: 'Bonjour', x: 0.74, y: 0.8, delay: 450 },
  { text: '안녕하세요', x: 0.52, y: 0.12, delay: 650 },
  { text: 'Hola', x: 0.84, y: 0.44, delay: 580 },
  { text: 'Привет', x: 0.1, y: 0.44, delay: 700 },
  { text: 'مرحبا', x: 0.4, y: 0.82, delay: 800 },
  { text: 'こんにちは', x: 0.28, y: 0.08, delay: 900 },
];

/** `start`: begin the timeline (when the native splash has just hidden). */
export function AnimatedSplash({ start, onDone }: { start: boolean; onDone: () => void }) {
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();

  const gradient = useSharedValue(0);
  const drift = useSharedValue(0);
  const logoScale = useSharedValue(1);
  const logoTurn = useSharedValue(0);
  const words = useSharedValue(0);
  const exit = useSharedValue(0);
  const rings = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];

  useEffect(() => {
    if (!start) return;
    const out = (reduced ? 300 : TOTAL_MS) + EXIT_MS;
    if (reduced) {
      exit.value = withDelay(300, withTiming(1, { duration: EXIT_MS }));
    } else {
      const ease = Easing.out(Easing.cubic);
      gradient.value = withTiming(1, { duration: 500, easing: ease });
      drift.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }), -1, true);
      logoScale.value = withSequence(
        withTiming(0.86, { duration: 160, easing: ease }),
        withSpring(1.08, { damping: 6, stiffness: 160 }),
        withSpring(1, { damping: 12 })
      );
      logoTurn.value = withSequence(withTiming(-8, { duration: 160 }), withSpring(0, { damping: 5, stiffness: 140 }));
      rings.forEach((ring, i) => {
        ring.value = withDelay(250 + i * 300, withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) }));
      });
      words.value = withDelay(350, withTiming(1, { duration: 600, easing: ease }));
      exit.value = withDelay(TOTAL_MS, withTiming(1, { duration: EXIT_MS, easing: Easing.in(Easing.quad) }));
    }
    const timer = setTimeout(onDone, out);
    return () => clearTimeout(timer);
    // Runs once, when started: the timeline is fixed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  const root = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  const gradientStyle = useAnimatedStyle(() => ({
    opacity: gradient.value,
    transform: [{ rotate: `${-12 + drift.value * 18}deg` }],
  }));
  const logo = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value * (1 + exit.value * 0.35) }, { rotate: `${logoTurn.value}deg` }],
  }));
  const title = useAnimatedStyle(() => ({ opacity: words.value, transform: [{ translateY: (1 - words.value) * 18 }] }));
  const tagline = useAnimatedStyle(() => ({ opacity: Math.max(0, words.value * 1.4 - 0.4), transform: [{ translateY: (1 - words.value) * 24 }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, root]} pointerEvents="none" accessible accessibilityLabel="Hao">
      <Animated.View style={[styles.gradientWrap, gradientStyle]}>
        <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>

      {reduced
        ? null
        : start
          ? GREETINGS.map((g) => <Greeting key={g.text} text={g.text} x={g.x * width} y={g.y * height} delay={g.delay} />)
          : null}

      <View style={styles.center}>
        {rings.map((ring, i) => (
          <Ring key={i} progress={ring} />
        ))}
        <Animated.View style={[styles.logo, logo]}>
          <Text style={styles.logoText} allowFontScaling={false}>
            好
          </Text>
        </Animated.View>
        <Animated.Text style={[styles.title, title]} allowFontScaling={false}>
          Hao
        </Animated.Text>
        <Animated.Text style={[styles.tagline, tagline]} allowFontScaling={false}>
          China, made easy · 中国，好简单
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

/** A soft ring growing out of the mark and fading, like an incoming call. */
function Ring({ progress }: { progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: progress.value === 0 ? 0 : 0.55 * (1 - progress.value),
    transform: [{ scale: 1 + progress.value * 1.8 }],
  }));
  return <Animated.View style={[styles.ring, style]} />;
}

/** "Hello" in another language, fading in, floating up and fading out. */
function Greeting({ text, x, y, delay }: { text: string; x: number; y: number; delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }));
  }, [p, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value < 0.3 ? p.value / 0.3 : Math.max(0, 1 - (p.value - 0.3) / 0.7),
    transform: [{ translateY: -p.value * 40 }, { scale: 0.9 + p.value * 0.15 }],
  }));
  return (
    <Animated.Text style={[styles.greeting, { left: x - 60, top: y }, style]} allowFontScaling={false}>
      {text}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: RED, overflow: 'hidden', zIndex: 1000 },
  // Oversized (in %, so it needs no screen size, which the web server render doesn't know) so it can turn
  // without showing its corners.
  gradientWrap: { position: 'absolute', width: '220%', height: '220%', left: '-60%', top: '-60%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: {
    width: LOGO,
    height: LOGO,
    borderRadius: LOGO * 0.23,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5A0A22',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  logoText: { fontSize: 92, fontWeight: '900', color: RED, marginTop: -4 },
  ring: {
    position: 'absolute',
    width: LOGO,
    height: LOGO,
    borderRadius: LOGO * 0.23,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  title: { position: 'absolute', top: '50%', marginTop: LOGO / 2 + 28, fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  tagline: { position: 'absolute', top: '50%', marginTop: LOGO / 2 + 84, fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  greeting: { position: 'absolute', width: 120, textAlign: 'center', fontSize: 18, fontWeight: '800', color: 'rgba(255,255,255,0.75)' },
});
