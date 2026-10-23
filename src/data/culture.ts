import { tx } from '@shared/i18n/tx';

// Culture, festivals and the seasonal calendar for the Discover feed. Text is English (translated in-app).

export type CultureItem = {
  id: string;
  emoji: string;
  zh: string;
  pinyin: string;
  title: string;
  body: string;
  tip: string;
  colors: [string, string];
};

export const CultureItems: CultureItem[] = [
  {
    id: 'gongfu-tea', emoji: '🍵', zh: '功夫茶', pinyin: 'gōngfu chá', colors: ['#2F5D50', '#183A31'],
    title: tx('Gongfu tea'),
    body: tx('Tea is brewed in a tiny pot and poured in many short rounds, each one tasting a little different.'),
    tip: tx('Tap two fingers on the table to say thanks when someone refills your cup.'),
  },
  {
    id: 'calligraphy', emoji: '🖌️', zh: '书法', pinyin: 'shūfǎ', colors: ['#3A3335', '#1B1A1F'],
    title: tx('Calligraphy'),
    body: tx('Writing characters with a brush is an art form; in parks, people practise with water on the stone ground.'),
    tip: tx('Ask to try: most water-calligraphy writers in parks are happy to hand you the brush.'),
  },
  {
    id: 'tai-chi', emoji: '🧘', zh: '太极拳', pinyin: 'tàijí quán', colors: ['#3E7C59', '#1F4D36'],
    title: tx('Morning tai chi'),
    body: tx('Slow, flowing martial art practised in parks at sunrise, often to soft music.'),
    tip: tx('Go to a park around 7 am and simply join the back row. Nobody minds.'),
  },
  {
    id: 'square-dance', emoji: '💃', zh: '广场舞', pinyin: 'guǎngchǎng wǔ', colors: ['#C2185B', '#7B1040'],
    title: tx('Square dancing'),
    body: tx('Every evening, groups dance together in public squares with a portable speaker.'),
    tip: tx('Watch for a song or two, then follow the moves at the edge. It’s free exercise.'),
  },
  {
    id: 'mahjong', emoji: '🀄', zh: '麻将', pinyin: 'májiàng', colors: ['#1E6B52', '#0E3B2C'],
    title: tx('Mahjong'),
    body: tx('A four-player tile game heard clacking in tea houses and homes; rules change from city to city.'),
    tip: tx('Chengdu tea houses are the best place to watch a game with a cup of tea.'),
  },
  {
    id: 'peking-opera', emoji: '🎭', zh: '京剧', pinyin: 'jīngjù', colors: ['#B71C1C', '#5D0B0B'],
    title: tx('Peking opera'),
    body: tx('Singing, acrobatics and painted faces; red faces mean loyalty, white faces mean cunning.'),
    tip: tx('Short shows for visitors in Beijing come with English subtitles.'),
  },
  {
    id: 'face-changing', emoji: '👺', zh: '变脸', pinyin: 'biànliǎn', colors: ['#D84315', '#7A2408'],
    title: tx('Sichuan face-changing'),
    body: tx('Performers switch silk masks in a split second; the trick is a closely guarded secret.'),
    tip: tx('Many Chengdu hotpot restaurants include a free face-changing show at dinner.'),
  },
  {
    id: 'paper-cutting', emoji: '✂️', zh: '剪纸', pinyin: 'jiǎnzhǐ', colors: ['#C62828', '#8E0000'],
    title: tx('Paper cutting'),
    body: tx('Red paper cut into flowers, animals and lucky characters decorates windows at festivals.'),
    tip: tx('A light, flat souvenir: find them at markets and old streets.'),
  },
  {
    id: 'hongbao', emoji: '🧧', zh: '红包', pinyin: 'hóngbāo', colors: ['#D7263D', '#8E1020'],
    title: tx('Red envelopes'),
    body: tx('Money in red envelopes is given at New Year and weddings; today most are sent in WeChat.'),
    tip: tx('Give new, even amounts like 66, 88 or 200, never amounts with a 4.'),
  },
  {
    id: 'lucky-numbers', emoji: '8️⃣', zh: '吉利数字', pinyin: 'jílì shùzì', colors: ['#B8860B', '#6B4E07'],
    title: tx('Lucky numbers'),
    body: tx('8 sounds like getting rich and 6 means smooth; 4 sounds like death, so some buildings skip the 4th floor.'),
    tip: tx('Don’t be surprised by prices ending in 8 or phone numbers full of 8s.'),
  },
  {
    id: 'chopsticks', emoji: '🥢', zh: '筷子礼仪', pinyin: 'kuàizi lǐyí', colors: ['#6D4C41', '#3E2723'],
    title: tx('Chopstick manners'),
    body: tx('Never stand chopsticks upright in rice; it looks like incense at a funeral.'),
    tip: tx('Rest them on the bowl or the holder, and use the serving spoon for shared dishes.'),
  },
  {
    id: 'ganbei', emoji: '🥂', zh: '干杯', pinyin: 'gānbēi', colors: ['#AD6800', '#5C3800'],
    title: tx('Toasting'),
    body: tx('“Ganbei” means “dry the glass”. At dinners, toasts go around the table many times.'),
    tip: tx('Hold your glass a little lower than an elder’s when you clink, as a sign of respect.'),
  },
  {
    id: 'hot-water', emoji: '♨️', zh: '热水', pinyin: 'rè shuǐ', colors: ['#0277BD', '#01467A'],
    title: tx('Hot water'),
    body: tx('Warm water is believed to be good for health, so restaurants often serve it instead of cold water.'),
    tip: tx('Ask for 冰水 (bīng shuǐ) if you want ice water; trains have free hot-water taps.'),
  },
  {
    id: 'zodiac', emoji: '🐎', zh: '生肖', pinyin: 'shēngxiào', colors: ['#5E35B1', '#311B92'],
    title: tx('The zodiac'),
    body: tx('Each lunar year has one of twelve animals; people often ask your animal instead of your age.'),
    tip: tx('2026 is the Year of the Horse. Find your animal and you have an easy conversation starter.'),
  },
  {
    id: 'night-markets', emoji: '🏮', zh: '夜市', pinyin: 'yèshì', colors: ['#E65100', '#7A2B00'],
    title: tx('Night markets'),
    body: tx('After dark, streets fill with stalls selling skewers, noodles, fruit and snacks.'),
    tip: tx('Pick the stall with the longest local queue, and pay by scanning the QR code.'),
  },
  {
    id: 'hutongs', emoji: '🏘️', zh: '胡同', pinyin: 'hútòng', colors: ['#795548', '#40281F'],
    title: tx('Hutongs'),
    body: tx('Beijing’s old alleys of courtyard homes, where neighbours still play chess outside.'),
    tip: tx('Rent a bike and get lost on purpose; it’s the best way to see daily life.'),
  },
  {
    id: 'bargaining', emoji: '🤝', zh: '讲价', pinyin: 'jiǎngjià', colors: ['#00897B', '#004D40'],
    title: tx('Bargaining'),
    body: tx('At markets and souvenir stalls prices are a starting point; malls and shops have fixed prices.'),
    tip: tx('Start around a third to a half of the asking price, smile, and be ready to walk away.'),
  },
  {
    id: 'pandas', emoji: '🐼', zh: '大熊猫', pinyin: 'dà xióngmāo', colors: ['#37474F', '#121A1E'],
    title: tx('Giant pandas'),
    body: tx('China’s national treasure lives in the mountains of Sichuan; Chengdu has a famous breeding base.'),
    tip: tx('Arrive at opening time: pandas eat in the morning and sleep in the afternoon heat.'),
  },
  {
    id: 'hanfu', emoji: '👘', zh: '汉服', pinyin: 'hànfú', colors: ['#AD1457', '#5E0A2E'],
    title: tx('Wearing hanfu'),
    body: tx('Young people dress in traditional Han clothing for photos at palaces and old towns.'),
    tip: tx('Rental shops near big sights include makeup and hair; it takes about an hour.'),
  },
  {
    id: 'dumplings', emoji: '🥟', zh: '饺子', pinyin: 'jiǎozi', colors: ['#EF6C00', '#8A3E00'],
    title: tx('Dumplings'),
    body: tx('Families fold dumplings together at New Year; their shape looks like old silver ingots, for wealth.'),
    tip: tx('Order by weight: one liang (两) is about 5–6 dumplings.'),
  },
  {
    id: 'shadow-puppets', emoji: '🎎', zh: '皮影戏', pinyin: 'píyǐng xì', colors: ['#4E342E', '#21130F'],
    title: tx('Shadow puppetry'),
    body: tx('Leather puppets play stories behind a lit screen, an art over 2,000 years old.'),
    tip: tx('Xi’an’s Muslim Quarter and Chengdu’s Kuanzhai Alley have small shows.'),
  },
  {
    id: 'kung-fu', emoji: '🥋', zh: '功夫', pinyin: 'gōngfu', colors: ['#BF360C', '#5F1B06'],
    title: tx('Kung fu'),
    body: tx('Martial arts with many schools; the Shaolin Temple in Henan is its most famous home.'),
    tip: tx('Evening kung fu shows in Beijing are a good choice for a rainy day.'),
  },
  {
    id: 'qr-life', emoji: '📱', zh: '扫码', pinyin: 'sǎo mǎ', colors: ['#1565C0', '#0A3470'],
    title: tx('Scan everything'),
    body: tx('QR codes are used to pay, order food, rent bikes and even read museum labels.'),
    tip: tx('Set up Alipay or WeChat Pay with your foreign card before you arrive.'),
  },
  {
    id: 'tea-houses', emoji: '🪑', zh: '茶馆', pinyin: 'cháguǎn', colors: ['#558B2F', '#2E4D18'],
    title: tx('Tea houses'),
    body: tx('Locals spend hours chatting, playing cards and having their ears cleaned in Chengdu tea houses.'),
    tip: tx('One cup of tea buys you a seat for the whole afternoon, with free hot-water refills.'),
  },
];

export type Festival = {
  id: string;
  emoji: string;
  zh: string;
  name: string;
  body: string;
  tip: string;
  /** Gregorian dates (YYYY-MM-DD). Lunar festivals move every year; update yearly. */
  dates: string[];
  colors: [string, string];
};

export const Festivals: Festival[] = [
  {
    id: 'new-year', emoji: '🎆', zh: '元旦', colors: ['#283593', '#11184F'], dates: ['2026-01-01', '2027-01-01'],
    name: tx('New Year’s Day'),
    body: tx('A public holiday, but the big celebration is Spring Festival a few weeks later.'),
    tip: tx('Shops are open; it’s a normal day out with fewer office workers.'),
  },
  {
    id: 'spring-festival', emoji: '🧧', zh: '春节', colors: ['#D7263D', '#7A0F1C'], dates: ['2026-02-17', '2027-02-06'],
    name: tx('Spring Festival'),
    body: tx('Chinese New Year: families reunite, eat dumplings, set off fireworks and give red envelopes.'),
    tip: tx('Book trains weeks ahead and expect many small shops to close for about a week.'),
  },
  {
    id: 'lantern', emoji: '🏮', zh: '元宵节', colors: ['#E65100', '#7A2B00'], dates: ['2026-03-03', '2027-02-20'],
    name: tx('Lantern Festival'),
    body: tx('The 15th day of the new year closes the holiday with lantern shows, riddles and sweet rice balls.'),
    tip: tx('Try tangyuan (汤圆), sticky rice balls with sesame filling.'),
  },
  {
    id: 'womens-day', emoji: '💐', zh: '妇女节', colors: ['#AD1457', '#5E0A2E'], dates: ['2026-03-08', '2027-03-08'],
    name: tx('Women’s Day'),
    body: tx('Many women get the afternoon off, and shops run big sales.'),
    tip: tx('Flowers for female colleagues or hosts are a kind gesture.'),
  },
  {
    id: 'qingming', emoji: '🌿', zh: '清明节', colors: ['#2E7D32', '#123D16'], dates: ['2026-04-05', '2027-04-05'],
    name: tx('Qingming Festival'),
    body: tx('Tomb-Sweeping Day: families clean ancestors’ graves and enjoy spring outings.'),
    tip: tx('A short holiday, so parks and scenic spots get busy.'),
  },
  {
    id: 'labour-day', emoji: '🛠️', zh: '劳动节', colors: ['#C62828', '#6B0F0F'], dates: ['2026-05-01', '2027-05-01'],
    name: tx('Labour Day holiday'),
    body: tx('A five-day holiday around 1 May when much of the country travels.'),
    tip: tx('Book hotels and tickets early and visit big sights at opening time.'),
  },
  {
    id: 'dragon-boat', emoji: '🐉', zh: '端午节', colors: ['#00695C', '#00332C'], dates: ['2026-06-19', '2027-06-09'],
    name: tx('Dragon Boat Festival'),
    body: tx('Teams race long dragon boats to drums, and everyone eats zongzi, sticky rice in bamboo leaves.'),
    tip: tx('Say “Duānwǔ ānkāng” (端午安康), the usual greeting.'),
  },
  {
    id: 'qixi', emoji: '💞', zh: '七夕', colors: ['#8E24AA', '#4A0F5A'], dates: ['2026-08-19', '2027-08-08'],
    name: tx('Qixi Festival'),
    body: tx('Chinese Valentine’s Day, from the legend of the cowherd and the weaver girl.'),
    tip: tx('Restaurants fill up with couples; book a table if you have a date.'),
  },
  {
    id: 'teachers-day', emoji: '🍎', zh: '教师节', colors: ['#5D4037', '#2C1E1A'], dates: ['2026-09-10', '2027-09-10'],
    name: tx('Teachers’ Day'),
    body: tx('Students thank their teachers with cards and flowers.'),
    tip: tx('Students: a small card for your Chinese teacher is very welcome.'),
  },
  {
    id: 'mid-autumn', emoji: '🥮', zh: '中秋节', colors: ['#F9A825', '#8A5A00'], dates: ['2026-09-25', '2027-09-15'],
    name: tx('Mid-Autumn Festival'),
    body: tx('Families admire the full moon together and share mooncakes.'),
    tip: tx('Mooncakes make good gifts; try a classic lotus-seed one.'),
  },
  {
    id: 'national-day', emoji: '🇨🇳', zh: '国庆节', colors: ['#D7263D', '#7A0F1C'], dates: ['2026-10-01', '2027-10-01'],
    name: tx('National Day Golden Week'),
    body: tx('A week-long holiday from 1 October; the busiest travel week of the year.'),
    tip: tx('Avoid famous sights this week, or go at opening time with tickets booked.'),
  },
  {
    id: 'double-ninth', emoji: '⛰️', zh: '重阳节', colors: ['#6D4C41', '#3E2723'], dates: ['2026-10-18', '2027-10-08'],
    name: tx('Double Ninth Festival'),
    body: tx('A day to honour elders: people climb hills, drink chrysanthemum tea and visit grandparents.'),
    tip: tx('Join locals on a short hike; city hills are busy but cheerful.'),
  },
  {
    id: 'singles-day', emoji: '🛍️', zh: '双十一', colors: ['#E64A19', '#7F2A0E'], dates: ['2026-11-11', '2027-11-11'],
    name: tx('Singles’ Day'),
    body: tx('11.11 is the world’s biggest online shopping day, with sales on Taobao and JD.'),
    tip: tx('Good time to buy electronics or a winter coat online.'),
  },
  {
    id: 'winter-solstice', emoji: '❄️', zh: '冬至', colors: ['#1565C0', '#0A3470'], dates: ['2026-12-22', '2027-12-22'],
    name: tx('Winter Solstice'),
    body: tx('The longest night: the north eats dumplings, the south eats sweet rice balls.'),
    tip: tx('Ask locals which one they eat; it’s a fun north–south debate.'),
  },
];

export type SolarTerm = { month: number; day: number; zh: string; pinyin: string; name: string; custom: string };

/** The 24 solar terms (节气). Dates shift by a day between years, so they're shown as "around". */
export const SolarTerms: SolarTerm[] = [
  { month: 1, day: 5, zh: '小寒', pinyin: 'xiǎohán', name: tx('Minor Cold'), custom: tx('The cold sets in; people eat warming rice dishes.') },
  { month: 1, day: 20, zh: '大寒', pinyin: 'dàhán', name: tx('Major Cold'), custom: tx('The coldest time of year, and preparations for New Year begin.') },
  { month: 2, day: 4, zh: '立春', pinyin: 'lìchūn', name: tx('Start of Spring'), custom: tx('People “bite the spring” by eating fresh spring rolls.') },
  { month: 2, day: 19, zh: '雨水', pinyin: 'yǔshuǐ', name: tx('Rain Water'), custom: tx('Snow turns to rain and farmers prepare the fields.') },
  { month: 3, day: 5, zh: '惊蛰', pinyin: 'jīngzhé', name: tx('Awakening of Insects'), custom: tx('Spring thunder wakes hibernating insects; pears are eaten for health.') },
  { month: 3, day: 20, zh: '春分', pinyin: 'chūnfēn', name: tx('Spring Equinox'), custom: tx('Day and night are equal; people try to balance an egg upright.') },
  { month: 4, day: 5, zh: '清明', pinyin: 'qīngmíng', name: tx('Clear and Bright'), custom: tx('Fresh green weather for spring outings and tomb sweeping.') },
  { month: 4, day: 20, zh: '谷雨', pinyin: 'gǔyǔ', name: tx('Grain Rain'), custom: tx('Spring rain helps crops grow; it’s the season for picking spring tea.') },
  { month: 5, day: 5, zh: '立夏', pinyin: 'lìxià', name: tx('Start of Summer'), custom: tx('Children are weighed for luck, and people eat eggs.') },
  { month: 5, day: 21, zh: '小满', pinyin: 'xiǎomǎn', name: tx('Grain Buds'), custom: tx('Grains begin to fill out but are not yet ripe.') },
  { month: 6, day: 5, zh: '芒种', pinyin: 'mángzhòng', name: tx('Grain in Ear'), custom: tx('The busy season of harvesting wheat and planting rice.') },
  { month: 6, day: 21, zh: '夏至', pinyin: 'xiàzhì', name: tx('Summer Solstice'), custom: tx('The longest day; northerners eat cold noodles.') },
  { month: 7, day: 7, zh: '小暑', pinyin: 'xiǎoshǔ', name: tx('Minor Heat'), custom: tx('Hot days begin; light food and plenty of tea help.') },
  { month: 7, day: 22, zh: '大暑', pinyin: 'dàshǔ', name: tx('Major Heat'), custom: tx('The hottest time of year; sightsee in the early morning.') },
  { month: 8, day: 7, zh: '立秋', pinyin: 'lìqiū', name: tx('Start of Autumn'), custom: tx('People “stick on autumn fat” with a hearty meat dish.') },
  { month: 8, day: 23, zh: '处暑', pinyin: 'chǔshǔ', name: tx('End of Heat'), custom: tx('The summer heat finally starts to fade.') },
  { month: 9, day: 7, zh: '白露', pinyin: 'báilù', name: tx('White Dew'), custom: tx('Cool nights leave dew on the grass; some drink “white dew tea”.') },
  { month: 9, day: 23, zh: '秋分', pinyin: 'qiūfēn', name: tx('Autumn Equinox'), custom: tx('Day and night are equal again; it’s also farmers’ harvest festival.') },
  { month: 10, day: 8, zh: '寒露', pinyin: 'hánlù', name: tx('Cold Dew'), custom: tx('The air turns crisp; perfect weather for hiking and autumn leaves.') },
  { month: 10, day: 23, zh: '霜降', pinyin: 'shuāngjiàng', name: tx('Frost’s Descent'), custom: tx('The first frosts arrive; persimmons are eaten to keep warm.') },
  { month: 11, day: 7, zh: '立冬', pinyin: 'lìdōng', name: tx('Start of Winter'), custom: tx('Northerners eat dumplings so their ears don’t freeze, as the saying goes.') },
  { month: 11, day: 22, zh: '小雪', pinyin: 'xiǎoxuě', name: tx('Minor Snow'), custom: tx('First light snow in the north; families make cured meat in the south.') },
  { month: 12, day: 7, zh: '大雪', pinyin: 'dàxuě', name: tx('Major Snow'), custom: tx('Heavier snow in the north; a good time for hotpot.') },
  { month: 12, day: 22, zh: '冬至', pinyin: 'dōngzhì', name: tx('Winter Solstice'), custom: tx('The longest night, celebrated with dumplings or sweet rice balls.') },
];

/** Zodiac years start at Spring Festival. */
export const ZodiacYears: { from: string; to: string; emoji: string; zh: string; animal: string }[] = [
  { from: '2025-01-29', to: '2026-02-16', emoji: '🐍', zh: '蛇年', animal: tx('Year of the Snake') },
  { from: '2026-02-17', to: '2027-02-05', emoji: '🐎', zh: '马年', animal: tx('Year of the Horse') },
  { from: '2027-02-06', to: '2028-01-25', emoji: '🐐', zh: '羊年', animal: tx('Year of the Goat') },
];
