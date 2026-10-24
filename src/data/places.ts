import type Ionicons from '@expo/vector-icons/Ionicons';

import { tx } from '@shared/i18n/tx';

export type PlaceCategory = 'landmark' | 'nature' | 'culture' | 'market' | 'food' | 'hotel';

/**
 * A point of interest from AMap (高德). Coordinates are GCJ-02, the system AMap's data and map
 * tiles use in mainland China; the user's GPS fix is converted to match (see lib/location).
 */
export type Place = {
  /** AMap POI id, e.g. B000A8UIN8. */
  id: string;
  /** English name from AMap, or the Chinese name when AMap has none. */
  name: string;
  nameZh: string;
  address: string;
  addressZh: string;
  /** City and district in Chinese, e.g. 北京市 · 东城区. */
  cityZh: string;
  districtZh: string;
  category: PlaceCategory;
  /** AMap's most specific type, e.g. 世界遗产 or 四川菜(川菜). */
  typeZh: string;
  /** The same in the traveller's language (missing in places cached before it existed). */
  type?: string;
  latitude: number;
  longitude: number;
  rating?: number;
  /** Typical spend per person in CNY (restaurants, sights, hotels). */
  cost?: number;
  hours?: string;
  tel?: string;
  /** AMap's tags, e.g. signature dishes for restaurants. */
  tags: string[];
  photos: string[];
  /** Metres from the search centre, for nearby searches. */
  distanceM?: number;
};

export type CityId = 'beijing' | 'shanghai' | 'chengdu' | 'xian';

export const Cities: { id: CityId; name: string; nameZh: string; latitude: number; longitude: number }[] = [
  { id: 'beijing', name: tx('Beijing'), nameZh: '北京', latitude: 39.9163, longitude: 116.3972 },
  { id: 'shanghai', name: tx('Shanghai'), nameZh: '上海', latitude: 31.2304, longitude: 121.4737 },
  { id: 'chengdu', name: tx('Chengdu'), nameZh: '成都', latitude: 30.6586, longitude: 104.0648 },
  { id: 'xian', name: tx("Xi'an"), nameZh: '西安', latitude: 34.2658, longitude: 108.9541 },
];

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * `types` are AMap POI type codes (高德POI分类编码 V1.06) searched for each category. `icon` is what
 * the app shows; `emoji` is only for the map markers, which are drawn inside a web page.
 */
export const CategoryMeta: Record<PlaceCategory, { label: string; short: string; color: string; icon: IconName; emoji: string; types: string }> = {
  landmark: { label: tx('Landmarks'), short: tx('Sights'), color: '#D7263D', icon: 'camera', emoji: '🏯', types: '110000|110200|110105' },
  nature: { label: tx('Nature'), short: tx('Nature'), color: '#1F9D7A', icon: 'leaf', emoji: '🌿', types: '110101|110102|110103|110104|110208' },
  culture: { label: tx('Culture'), short: tx('Culture'), color: '#6C4AB6', icon: 'library', emoji: '🏛️', types: '140100|140200|140400|140600|140800|110205|110206|110207' },
  market: { label: tx('Markets'), short: tx('Markets'), color: '#E08A1E', icon: 'bag-handle', emoji: '🛍️', types: '061000|061001|060700|060701|060100|061201' },
  food: { label: tx('Food'), short: tx('Food'), color: '#E4572E', icon: 'restaurant', emoji: '🥢', types: '050100|050200|050400|050600|050800|050900' },
  // 住宿服务: hotels, guesthouses and hostels.
  hotel: { label: tx('Hotels'), short: tx('Hotels'), color: '#2576FF', icon: 'bed', emoji: '🏨', types: '100000|100100|100200' },
};

// Hotels are everywhere in Chinese cities and would crowd out everything else, so "All" leaves them out.
export const AllCategoryTypes = (Object.keys(CategoryMeta) as PlaceCategory[])
  .filter((c) => c !== 'hotel')
  .map((c) => CategoryMeta[c].types)
  .join('|');

/** Which category an AMap typecode belongs to (a POI can list several codes, separated by `|`). */
export function categoryOf(typecode: string): PlaceCategory {
  const code = typecode.split('|')[0] ?? '';
  if (code.startsWith('05')) return 'food';
  if (code.startsWith('06')) return 'market';
  if (code.startsWith('10')) return 'hotel';
  if (code.startsWith('14') || /^11020[5-7]/.test(code)) return 'culture';
  if (code.startsWith('1101') && code !== '110105') return 'nature';
  if (code === '110208') return 'nature';
  return 'landmark';
}

/** AMap POI ids look like B000A8UIN8 (ids saved before the switch to AMap don't). */
export const isPlaceId = (value: string) => /^B[0-9A-Z]{9}$/.test(value);

export const isCategory = (value: unknown): value is PlaceCategory => typeof value === 'string' && value in CategoryMeta;

// ─── Rows of public.places (places memory) ───────────────────────────────────

/** How public.places groups places: food, attraction, shop or service. */
export type PlaceKind = 'food' | 'attraction' | 'shop' | 'service' | 'hotel';

export const kindOf = (category: PlaceCategory): PlaceKind =>
  category === 'food' ? 'food' : category === 'market' ? 'shop' : category === 'hotel' ? 'hotel' : 'attraction';

export type PlaceRow = {
  id: string;
  amap_poi_id: string | null;
  name: string;
  name_zh: string;
  category: string;
  lat: number;
  lng: number;
  address: string;
  tags: string[];
  amap_rating: number | null;
};

/** A stored place as the app's Place (without AMap's photos and hours; fetch the AMap id for those). */
export function placeFromRow(row: PlaceRow): Place {
  const category: PlaceCategory = row.category === 'food' ? 'food' : row.category === 'shop' ? 'market' : row.category === 'hotel' ? 'hotel' : 'landmark';
  return {
    id: row.amap_poi_id ?? row.id,
    name: row.name,
    nameZh: row.name_zh || row.name,
    address: row.address,
    addressZh: row.address,
    cityZh: '',
    districtZh: '',
    category,
    typeZh: '',
    latitude: row.lat,
    longitude: row.lng,
    rating: row.amap_rating ?? undefined,
    tags: row.tags,
    photos: [],
  };
}
