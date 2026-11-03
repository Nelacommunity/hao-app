// A picture of a place on a Mapbox map (Static Images API), for Discover's place cards and place stories, in place of
// AMap's photos. The app's coordinates are GCJ-02; Mapbox is GPS (WGS-84), so they're converted first.
// Docs: https://docs.mapbox.com/api/maps/static-images/
import { gcj02ToWgs84 } from '@/lib/china-coords';
import type { Coords } from '@/lib/location';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

/** Mapbox Static Images are at most 1280 px a side (before @2x). */
const MAX = 1280;

/**
 * The map image's URL, or null without a Mapbox token. `width`/`height` are in points; the image is @2x.
 * zoom: 16 shows the street, 13 the neighbourhood, 11 the city.
 */
export function staticMapUrl(at: Coords, o: { width: number; height: number; zoom?: number; dark?: boolean; color?: string }): string | null {
  if (!TOKEN) return null;
  const p = gcj02ToWgs84(at);
  const lng = p.longitude.toFixed(5);
  const lat = p.latitude.toFixed(5);
  const scale = Math.min(1, MAX / Math.max(o.width, o.height));
  const w = Math.round(o.width * scale);
  const h = Math.round(o.height * scale);
  const style = o.dark ? 'dark-v11' : 'streets-v12';
  const pin = `pin-l+${(o.color ?? '#D7263D').replace('#', '').toLowerCase()}(${lng},${lat})`;
  return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${pin}/${lng},${lat},${o.zoom ?? 15},0/${w}x${h}@2x?access_token=${encodeURIComponent(TOKEN)}`;
}
