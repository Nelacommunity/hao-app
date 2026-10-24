// The facts Discover stories are written from. Everything a model is told comes from these shapes;
// it is never asked to know anything itself.

/** Bundled facts (shared/stories/facts.generated.ts, `npm run stories:facts`). */
export type FactBundle = {
  culture: { id: string; zh: string; pinyin: string; title: string; body: string; tip: string; etiquette: boolean }[];
  festivals: { id: string; zh: string; name: string; body: string; tip: string }[];
  dishes: {
    id: string;
    name: string;
    nameZh: string;
    pinyin: string;
    region: string;
    /** 0 (none) to 3 (very hot). */
    spice: number;
    price: string;
    tags: string[];
    description: string;
    orderZh: string;
    orderEn: string;
  }[];
  phrases: { group: string; groupTitle: string; en: string; zh: string; pinyin: string }[];
  knowledge: { id: string; title: string; body: string }[];
  /** Hands-on skills Hao teaches step by step (src/data/crafts.ts). */
  crafts: {
    id: string;
    title: string;
    zh: string;
    pinyin: string;
    about: string;
    materials: string[];
    steps: string[];
    tips: string[];
    whereToTry?: string;
  }[];
};

/** A Wikipedia article the generator fetched for a topic (text CC BY-SA; image only with a free licence). */
export type WikiFact = {
  topicId: string;
  title: string;
  url: string;
  /** Plain text from the start of the article. */
  extract: string;
  /** The article's lead photo, copied to the story-images bucket (Wikimedia is blocked in mainland China). */
  image?: { url: string; credit: string };
};

/** A row of public.holidays. */
export type HolidayFact = {
  id: string;
  starts_on: string;
  ends_on: string;
  name: string;
  name_zh: string;
  kind: 'public_holiday' | 'festival' | 'observance';
  about: string;
  closures: string;
  crowds: string;
};

/** One day of the AMap weather forecast (text in Chinese, as AMap sends it). */
export type WeatherDay = { date: string; dayWeather: string; nightWeather: string; dayTemp: number; nightTemp: number; wind: string };

/** A real place from AMap, already stored in public.places (placeId). */
export type PlaceFact = {
  placeId: string;
  amapId: string;
  name: string;
  nameZh: string;
  address: string;
  addressZh: string;
  /** The app's category (landmark, culture, nature, market, food, hotel). */
  category: string;
  typeZh: string;
  lat: number;
  lng: number;
  rating?: number;
  cost?: number;
  hours?: string;
  tags: string[];
  /** https URLs from AMap. */
  photos: string[];
};

/** A place popular with one nationality (place_country_stats, groups of MIN_GROUP_SIZE or more only). */
export type LovedFact = PlaceFact & { nationality: string; country: string; visitors: number; likes: number };

/** A row of public.story_topics. */
export type TopicRow = { id: string; category: string; label: string; enabled: boolean; wikipedia?: string | null };
