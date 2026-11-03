import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/** Zoom into a painting and move across it: `step` of `of` along its long side. */
export type Pan = { step: number; of: number } | null;

/**
 * A full-screen card picture. AMap's own place photos are small landscape shots (500×281), and
 * cropping one to fill a tall phone screen blows a thin strip of it up ~9×. Landscape pictures are
 * shown whole instead, over a blurred, zoomed copy of themselves; portrait ones still fill the card.
 * With `pan` (paintings), the picture is shown whole, then zoomed into and moved across slide by slide.
 */
export function CardPhoto({ uri, pan = null }: { uri: string; pan?: Pan }) {
  // Remount per picture (key), so the last slide's picture never fades over this one. Slides showing the
  // same painting keep the same view, so moving across it animates.
  return <Photo key={uri} uri={uri} pan={pan} />;
}

function Photo({ uri, pan }: { uri: string; pan: Pan }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const wide = !!size && size.w > size.h;
  const whole = wide || !!pan;

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  useEffect(() => {
    const to = panTransform(pan, size, box);
    const timing = { duration: 900 };
    tx.value = withTiming(to.tx, timing);
    ty.value = withTiming(to.ty, timing);
    scale.value = withTiming(to.scale, timing);
  }, [pan, size, box, tx, ty, scale]);
  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {whole && size ? (
        <>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} cachePolicy="disk" />
          <View style={styles.dim} />
        </>
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, moving]}>
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit={whole ? 'contain' : 'cover'}
          transition={200}
          cachePolicy="disk"
          onLoad={(e) => setSize({ w: e.source.width, h: e.source.height })}
          accessibilityIgnoresInvertColors
        />
      </Animated.View>
    </View>
  );
}

/**
 * Where a painting sits for one slide: the first shows it whole; the rest zoom in (enough to fill the
 * screen's short side, within limits) and move from one end of its long side to the other.
 */
function panTransform(pan: Pan, size: { w: number; h: number } | null, box: { w: number; h: number } | null) {
  const none = { tx: 0, ty: 0, scale: 1 };
  if (!pan || pan.step <= 0 || !size || !box) return none;
  // The picture as `contain` draws it.
  const fit = Math.min(box.w / size.w, box.h / size.h);
  const cw = size.w * fit;
  const ch = size.h * fit;
  const scale = Math.min(2.4, Math.max(1.6, box.w / cw, box.h / ch));
  // 0.15 → 0.85 along the long side over the zoomed slides.
  const zoomed = pan.of - 1;
  const at = zoomed <= 1 ? 0.5 : 0.15 + (0.7 * (pan.step - 1)) / (zoomed - 1);
  const shift = (length: number, screen: number) => {
    const max = Math.max(0, (length * scale - screen) / 2);
    return Math.max(-max, Math.min(max, -(at - 0.5) * length * scale));
  };
  const landscape = size.w / size.h > box.w / box.h;
  return landscape ? { tx: shift(cw, box.w), ty: 0, scale } : { tx: 0, ty: shift(ch, box.h), scale };
}

const styles = StyleSheet.create({
  dim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.25)' },
});
