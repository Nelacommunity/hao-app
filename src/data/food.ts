import { tx } from '@shared/i18n/tx';
export type DietTag = 'vegetarian' | 'halal' | 'spicy' | 'street';

export type Dish = {
  id: string;
  name: string;
  nameZh: string;
  pinyin: string;
  emoji: string;
  region: string;
  spice: 0 | 1 | 2 | 3;
  price: string;
  tags: DietTag[];
  description: string;
  orderZh: string;
  orderEn: string;
};

export const DietMeta: Record<DietTag, { label: string; emoji: string }> = {
  vegetarian: { label: tx('Vegetarian'), emoji: '🥬' },
  halal: { label: tx('Halal'), emoji: '☪️' },
  spicy: { label: tx('Spicy'), emoji: '🌶️' },
  street: { label: tx('Street food'), emoji: '🛺' },
};

export const Dishes: Dish[] = [
  {
    id: 'peking-duck',
    name: tx('Peking Duck'),
    nameZh: '北京烤鸭',
    pinyin: 'Běijīng kǎoyā',
    emoji: '🦆',
    region: tx('Beijing'),
    spice: 0,
    price: '¥150–300',
    tags: [],
    description: tx('Crispy roast duck sliced at the table, wrapped in thin pancakes with scallion and sweet bean sauce.'),
    orderZh: '请给我一只烤鸭。',
    orderEn: tx('One roast duck, please.'),
  },
  {
    id: 'xiaolongbao',
    name: tx('Soup Dumplings'),
    nameZh: '小笼包',
    pinyin: 'xiǎolóngbāo',
    emoji: '🥟',
    region: tx('Shanghai'),
    spice: 0,
    price: '¥20–40',
    tags: ['street'],
    description: tx('Delicate steamed dumplings filled with pork and hot broth. Nibble, sip, then eat.'),
    orderZh: '请给我一笼小笼包。',
    orderEn: tx('One basket of soup dumplings, please.'),
  },
  {
    id: 'mapo-tofu',
    name: tx('Mapo Tofu'),
    nameZh: '麻婆豆腐',
    pinyin: 'mápó dòufu',
    emoji: '🌶️',
    region: tx('Sichuan'),
    spice: 3,
    price: '¥25–45',
    tags: ['spicy'],
    description: tx('Silky tofu in a fiery, numbing sauce of chili bean paste and Sichuan peppercorn.'),
    orderZh: '请给我一份麻婆豆腐，微辣。',
    orderEn: tx('One mapo tofu, mildly spicy please.'),
  },
  {
    id: 'hotpot',
    name: tx('Sichuan Hotpot'),
    nameZh: '四川火锅',
    pinyin: 'Sìchuān huǒguō',
    emoji: '🍲',
    region: tx('Chengdu'),
    spice: 3,
    price: '¥100–180 pp',
    tags: ['spicy'],
    description: tx('A bubbling pot of chili broth where you cook meats and vegetables at the table.'),
    orderZh: '我们要鸳鸯锅，一半不辣。',
    orderEn: tx('We’d like a split pot, half not spicy.'),
  },
  {
    id: 'roujiamo',
    name: tx('Chinese Burger'),
    nameZh: '腊汁肉夹馍',
    pinyin: 'làzhī ròujiāmó',
    emoji: '🥙',
    region: tx("Xi'an"),
    spice: 1,
    price: '¥12–20',
    tags: ['street', 'halal'],
    description: tx('Slow-braised meat stuffed into a crisp flatbread. Halal versions use beef or lamb.'),
    orderZh: '一个牛肉夹馍，谢谢。',
    orderEn: tx('One beef roujiamo, thanks.'),
  },
  {
    id: 'biangbiang',
    name: tx('Biangbiang Noodles'),
    nameZh: 'biángbiáng面',
    pinyin: 'biángbiáng miàn',
    emoji: '🍜',
    region: tx("Xi'an"),
    spice: 2,
    price: '¥18–30',
    tags: ['vegetarian', 'spicy'],
    description: tx('Belt-wide hand-pulled noodles topped with chili flakes sizzled in hot oil.'),
    orderZh: '一碗油泼面，不要肉。',
    orderEn: tx('One bowl of oil-splashed noodles, no meat.'),
  },
  {
    id: 'dim-sum',
    name: tx('Buddha’s Delight'),
    nameZh: '罗汉斋',
    pinyin: 'luóhàn zhāi',
    emoji: '🥢',
    region: tx('Nationwide'),
    spice: 0,
    price: '¥30–50',
    tags: ['vegetarian'],
    description: tx('Braised vegetables, mushrooms and tofu — a classic Buddhist vegetarian dish.'),
    orderZh: '我吃素，请不要放肉和鱼。',
    orderEn: tx('I’m vegetarian, no meat or fish please.'),
  },
  {
    id: 'jianbing',
    name: tx('Jianbing Crepe'),
    nameZh: '煎饼果子',
    pinyin: 'jiānbing guǒzi',
    emoji: '🌯',
    region: tx('Tianjin & Beijing'),
    spice: 1,
    price: '¥8–15',
    tags: ['street', 'vegetarian'],
    description: tx('The breakfast of champions: egg crepe with crispy cracker, herbs and chili sauce.'),
    orderZh: '一个煎饼，加个蛋。',
    orderEn: tx('One jianbing, with an extra egg.'),
  },
];
