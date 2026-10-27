// AMap (高德) Web Service calls the story generator needs: places with photos and the weather forecast.
// Same API and field handling as src/lib/server/amap.ts (which can't be imported here: it's Node-side).
import type { PlaceFact, WeatherDay } from '../../../shared/stories/facts.ts';

const BASE = 'https://restapi.amap.com';

type Text = string | string[] | undefined;
const text = (v: Text) => (typeof v === 'string' ? v.trim() : '');

type AmapPoi = {
  id: string;
  name: string;
  type: Text;
  typecode: Text;
  address: Text;
  location: string;
  business?: { rating?: Text; cost?: Text; opentime_today?: Text; opentime_week?: Text; tag?: Text; keytag?: Text; rectag?: Text };
  photos?: { url?: Text }[];
};

export type Amap = {
  places: (o: { cityZh: string; types: string; page: number }) => Promise<Omit<PlaceFact, 'placeId'>[]>;
  placesById: (ids: string[]) => Promise<Omit<PlaceFact, 'placeId'>[]>;
  weather: (adcode: string) => Promise<WeatherDay[]>;
};

/** The app's place category for an AMap type code (see categoryOf in src/data/places.ts). */
function categoryOf(typecode: string) {
  if (typecode.startsWith('05')) return 'food';
  if (typecode.startsWith('10')) return 'hotel';
  if (typecode.startsWith('06')) return 'market';
  if (typecode.startsWith('14')) return 'culture';
  if (/^1102|^1103/.test(typecode)) return 'nature';
  return 'landmark';
}

export function amapClient(key: string): Amap {
  async function call<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('key', key);
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const json = (await res.json()) as T & { status?: string; info?: string; infocode?: string };
    if (json.status !== '1') throw new Error(`AMap error: ${json.info ?? res.status} (${json.infocode ?? '?'})`);
    return json;
  }

  function toFact(poi: AmapPoi, en?: AmapPoi): Omit<PlaceFact, 'placeId'> {
    const [lng, lat] = poi.location.split(',').map(Number);
    const b = poi.business ?? {};
    const lastType = (p: AmapPoi) => text(p.type).split('|')[0].split(';').pop() ?? '';
    return {
      amapId: poi.id,
      name: (en && text(en.name)) || poi.name,
      nameZh: poi.name,
      address: (en && text(en.address)) || text(poi.address),
      addressZh: text(poi.address),
      category: categoryOf(text(poi.typecode)),
      typeZh: lastType(poi),
      lat,
      lng,
      rating: Number(text(b.rating)) > 0 ? Number(text(b.rating)) : undefined,
      cost: Number(text(b.cost)) > 0 ? Number(text(b.cost)) : undefined,
      hours: text(b.opentime_today) || text(b.opentime_week) || undefined,
      tags: [text(b.tag), text(b.rectag), text(b.keytag)]
        .flatMap((s) => s.split(/[,;，、]/))
        .map((s) => s.trim())
        .filter((s, i, all) => s && all.indexOf(s) === i)
        .slice(0, 8),
      // Real photos only, and only over https (iOS release builds won't load http).
      photos: (poi.photos ?? [])
        .map((p) => text(p.url).replace(/^http:\/\//, 'https://'))
        .filter((u) => u.startsWith('https://'))
        .slice(0, 4),
    };
  }

  async function query(path: string, params: Record<string, string>) {
    const [zh, en] = await Promise.all([
      call<{ pois?: AmapPoi[] }>(path, { ...params, show_fields: 'business,photos' }),
      call<{ pois?: AmapPoi[] }>(path, { ...params, language: 'en' }).catch(() => null),
    ]);
    const english = new Map((en?.pois ?? []).map((p) => [p.id, p]));
    return (zh.pois ?? []).filter((p) => p.location && /^B[0-9A-Z]{9}$/.test(p.id)).map((p) => toFact(p, english.get(p.id)));
  }

  return {
    places: (o) => query('/v5/place/text', { region: o.cityZh, city_limit: 'true', types: o.types, page_size: '25', page_num: String(o.page) }),
    placesById: (ids) => (ids.length ? query('/v5/place/detail', { id: ids.slice(0, 10).join('|') }) : Promise.resolve([])),
    async weather(adcode) {
      type Cast = { date: string; dayweather: string; nightweather: string; daytemp: string; nighttemp: string; daywind: string };
      const data = await call<{ forecasts?: { casts?: Cast[] }[] }>('/v3/weather/weatherInfo', { city: adcode, extensions: 'all' });
      return (data.forecasts?.[0]?.casts ?? []).map((c) => ({
        date: c.date,
        dayWeather: c.dayweather,
        nightWeather: c.nightweather,
        dayTemp: Number(c.daytemp),
        nightTemp: Number(c.nighttemp),
        wind: c.daywind,
      }));
    },
  };
}

/** Placeholder AMap for local runs without a key (STORIES_MOCK=true). */
export function mockAmap(): Amap {
  const place = (n: number): Omit<PlaceFact, 'placeId'> => ({
    amapId: `B000MOCK0${n}`,
    name: `[PLACE NAME ${n}]`,
    nameZh: `[地点 ${n}]`,
    address: '[ADDRESS]',
    addressZh: '[地址]',
    category: n % 2 ? 'landmark' : 'food',
    typeZh: n % 2 ? '风景名胜' : '中餐厅',
    lat: 39.9 + n / 1000,
    lng: 116.4 + n / 1000,
    tags: [],
    photos: [],
  });
  return {
    places: async () => [1, 2, 3, 4].map(place),
    placesById: async (ids) => ids.map((id, i) => ({ ...place(i + 1), amapId: id })),
    weather: async () => [{ date: new Date().toISOString().slice(0, 10), dayWeather: '晴', nightWeather: '多云', dayTemp: 18, nightTemp: 8, wind: '北' }],
  };
}
