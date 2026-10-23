export type Language = {
  code: string;
  name: string;
  native: string;
  flag: string;
  /** BCP 47 tag used for text-to-speech. */
  speech: string;
  aliases?: string[];
};

const l = (code: string, name: string, native: string, flag: string, speech: string, aliases?: string[]): Language => ({
  code,
  name,
  native,
  flag,
  speech,
  aliases,
});

export const Languages: Language[] = [
  l('af', 'Afrikaans', 'Afrikaans', '🇿🇦', 'af-ZA'),
  l('sq', 'Albanian', 'Shqip', '🇦🇱', 'sq-AL'),
  l('am', 'Amharic', 'አማርኛ', '🇪🇹', 'am-ET'),
  l('ar', 'Arabic', 'العربية', '🇸🇦', 'ar-SA'),
  l('hy', 'Armenian', 'Հայերեն', '🇦🇲', 'hy-AM'),
  l('as', 'Assamese', 'অসমীয়া', '🇮🇳', 'as-IN'),
  l('az', 'Azerbaijani', 'Azərbaycan', '🇦🇿', 'az-AZ', ['Azeri']),
  l('eu', 'Basque', 'Euskara', '🇪🇸', 'eu-ES'),
  l('be', 'Belarusian', 'Беларуская', '🇧🇾', 'be-BY'),
  l('bn', 'Bengali', 'বাংলা', '🇧🇩', 'bn-BD', ['Bangla']),
  l('bs', 'Bosnian', 'Bosanski', '🇧🇦', 'bs-BA'),
  l('bg', 'Bulgarian', 'Български', '🇧🇬', 'bg-BG'),
  l('my', 'Burmese', 'မြန်မာ', '🇲🇲', 'my-MM', ['Myanmar']),
  l('yue', 'Cantonese', '粵語', '🇭🇰', 'zh-HK', ['Hong Kong']),
  l('ca', 'Catalan', 'Català', '🇪🇸', 'ca-ES'),
  l('ceb', 'Cebuano', 'Cebuano', '🇵🇭', 'fil-PH', ['Bisaya']),
  l('ny', 'Chichewa', 'Chichewa', '🇲🇼', 'ny-MW', ['Nyanja']),
  l('zh-TW', 'Chinese (Traditional)', '繁體中文', '🇹🇼', 'zh-TW', ['Taiwanese', 'Mandarin']),
  l('hr', 'Croatian', 'Hrvatski', '🇭🇷', 'hr-HR'),
  l('cs', 'Czech', 'Čeština', '🇨🇿', 'cs-CZ'),
  l('da', 'Danish', 'Dansk', '🇩🇰', 'da-DK'),
  l('nl', 'Dutch', 'Nederlands', '🇳🇱', 'nl-NL', ['Flemish']),
  l('en', 'English', 'English', '🇬🇧', 'en-US'),
  l('eo', 'Esperanto', 'Esperanto', '🌍', 'eo'),
  l('et', 'Estonian', 'Eesti', '🇪🇪', 'et-EE'),
  l('fil', 'Filipino', 'Filipino', '🇵🇭', 'fil-PH', ['Tagalog']),
  l('fi', 'Finnish', 'Suomi', '🇫🇮', 'fi-FI'),
  l('fr', 'French', 'Français', '🇫🇷', 'fr-FR'),
  l('gl', 'Galician', 'Galego', '🇪🇸', 'gl-ES'),
  l('ka', 'Georgian', 'ქართული', '🇬🇪', 'ka-GE'),
  l('de', 'German', 'Deutsch', '🇩🇪', 'de-DE'),
  l('el', 'Greek', 'Ελληνικά', '🇬🇷', 'el-GR'),
  l('gu', 'Gujarati', 'ગુજરાતી', '🇮🇳', 'gu-IN'),
  l('ht', 'Haitian Creole', 'Kreyòl ayisyen', '🇭🇹', 'ht-HT'),
  l('ha', 'Hausa', 'Hausa', '🇳🇬', 'ha-NG'),
  l('haw', 'Hawaiian', 'ʻŌlelo Hawaiʻi', '🇺🇸', 'haw-US'),
  l('he', 'Hebrew', 'עברית', '🇮🇱', 'he-IL'),
  l('hi', 'Hindi', 'हिन्दी', '🇮🇳', 'hi-IN'),
  l('hu', 'Hungarian', 'Magyar', '🇭🇺', 'hu-HU'),
  l('is', 'Icelandic', 'Íslenska', '🇮🇸', 'is-IS'),
  l('ig', 'Igbo', 'Igbo', '🇳🇬', 'ig-NG'),
  l('id', 'Indonesian', 'Bahasa Indonesia', '🇮🇩', 'id-ID'),
  l('ga', 'Irish', 'Gaeilge', '🇮🇪', 'ga-IE', ['Gaelic']),
  l('it', 'Italian', 'Italiano', '🇮🇹', 'it-IT'),
  l('ja', 'Japanese', '日本語', '🇯🇵', 'ja-JP'),
  l('jv', 'Javanese', 'Basa Jawa', '🇮🇩', 'jv-ID'),
  l('kn', 'Kannada', 'ಕನ್ನಡ', '🇮🇳', 'kn-IN'),
  l('kk', 'Kazakh', 'Қазақ тілі', '🇰🇿', 'kk-KZ'),
  l('km', 'Khmer', 'ខ្មែរ', '🇰🇭', 'km-KH', ['Cambodian']),
  l('rw', 'Kinyarwanda', 'Kinyarwanda', '🇷🇼', 'rw-RW'),
  l('ko', 'Korean', '한국어', '🇰🇷', 'ko-KR'),
  l('ku', 'Kurdish', 'Kurdî', '🇮🇶', 'ku'),
  l('ky', 'Kyrgyz', 'Кыргызча', '🇰🇬', 'ky-KG'),
  l('lo', 'Lao', 'ລາວ', '🇱🇦', 'lo-LA', ['Laotian']),
  l('la', 'Latin', 'Latina', '🇻🇦', 'la'),
  l('lv', 'Latvian', 'Latviešu', '🇱🇻', 'lv-LV'),
  l('lt', 'Lithuanian', 'Lietuvių', '🇱🇹', 'lt-LT'),
  l('lb', 'Luxembourgish', 'Lëtzebuergesch', '🇱🇺', 'lb-LU'),
  l('mk', 'Macedonian', 'Македонски', '🇲🇰', 'mk-MK'),
  l('mg', 'Malagasy', 'Malagasy', '🇲🇬', 'mg-MG'),
  l('ms', 'Malay', 'Bahasa Melayu', '🇲🇾', 'ms-MY', ['Malaysian']),
  l('ml', 'Malayalam', 'മലയാളം', '🇮🇳', 'ml-IN'),
  l('mt', 'Maltese', 'Malti', '🇲🇹', 'mt-MT'),
  l('mi', 'Māori', 'Te Reo Māori', '🇳🇿', 'mi-NZ', ['Maori']),
  l('mr', 'Marathi', 'मराठी', '🇮🇳', 'mr-IN'),
  l('mn', 'Mongolian', 'Монгол', '🇲🇳', 'mn-MN'),
  l('ne', 'Nepali', 'नेपाली', '🇳🇵', 'ne-NP'),
  l('no', 'Norwegian', 'Norsk', '🇳🇴', 'nb-NO', ['Bokmål']),
  l('or', 'Odia', 'ଓଡ଼ିଆ', '🇮🇳', 'or-IN', ['Oriya']),
  l('ps', 'Pashto', 'پښتو', '🇦🇫', 'ps-AF'),
  l('fa', 'Persian', 'فارسی', '🇮🇷', 'fa-IR', ['Farsi', 'Dari']),
  l('pl', 'Polish', 'Polski', '🇵🇱', 'pl-PL'),
  l('pt-BR', 'Portuguese (Brazil)', 'Português (Brasil)', '🇧🇷', 'pt-BR', ['Brazilian']),
  l('pt', 'Portuguese (Portugal)', 'Português', '🇵🇹', 'pt-PT'),
  l('pa', 'Punjabi', 'ਪੰਜਾਬੀ', '🇮🇳', 'pa-IN'),
  l('qu', 'Quechua', 'Runa Simi', '🇵🇪', 'qu-PE'),
  l('ro', 'Romanian', 'Română', '🇷🇴', 'ro-RO', ['Moldovan']),
  l('ru', 'Russian', 'Русский', '🇷🇺', 'ru-RU'),
  l('sm', 'Samoan', 'Gagana Samoa', '🇼🇸', 'sm-WS'),
  l('gd', 'Scottish Gaelic', 'Gàidhlig', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'gd-GB'),
  l('sr', 'Serbian', 'Српски', '🇷🇸', 'sr-RS'),
  l('st', 'Sesotho', 'Sesotho', '🇱🇸', 'st-LS'),
  l('sn', 'Shona', 'chiShona', '🇿🇼', 'sn-ZW'),
  l('sd', 'Sindhi', 'سنڌي', '🇵🇰', 'sd-PK'),
  l('si', 'Sinhala', 'සිංහල', '🇱🇰', 'si-LK', ['Sinhalese']),
  l('sk', 'Slovak', 'Slovenčina', '🇸🇰', 'sk-SK'),
  l('sl', 'Slovenian', 'Slovenščina', '🇸🇮', 'sl-SI'),
  l('so', 'Somali', 'Soomaali', '🇸🇴', 'so-SO'),
  l('es', 'Spanish (Spain)', 'Español', '🇪🇸', 'es-ES', ['Castilian']),
  l('es-419', 'Spanish (Latin America)', 'Español (Latinoamérica)', '🇲🇽', 'es-MX', ['Mexican']),
  l('su', 'Sundanese', 'Basa Sunda', '🇮🇩', 'su-ID'),
  l('sw', 'Swahili', 'Kiswahili', '🇰🇪', 'sw-KE'),
  l('sv', 'Swedish', 'Svenska', '🇸🇪', 'sv-SE'),
  l('tg', 'Tajik', 'Тоҷикӣ', '🇹🇯', 'tg-TJ'),
  l('ta', 'Tamil', 'தமிழ்', '🇮🇳', 'ta-IN'),
  l('tt', 'Tatar', 'Татар', '🇷🇺', 'tt-RU'),
  l('te', 'Telugu', 'తెలుగు', '🇮🇳', 'te-IN'),
  l('th', 'Thai', 'ไทย', '🇹🇭', 'th-TH'),
  l('bo', 'Tibetan', 'བོད་ཡིག', '🏔️', 'bo-CN'),
  l('ti', 'Tigrinya', 'ትግርኛ', '🇪🇷', 'ti-ER'),
  l('tr', 'Turkish', 'Türkçe', '🇹🇷', 'tr-TR'),
  l('tk', 'Turkmen', 'Türkmen', '🇹🇲', 'tk-TM'),
  l('uk', 'Ukrainian', 'Українська', '🇺🇦', 'uk-UA'),
  l('ur', 'Urdu', 'اردو', '🇵🇰', 'ur-PK'),
  l('ug', 'Uyghur', 'ئۇيغۇرچە', '🌙', 'ug-CN', ['Uighur']),
  l('uz', 'Uzbek', 'Oʻzbek', '🇺🇿', 'uz-UZ'),
  l('vi', 'Vietnamese', 'Tiếng Việt', '🇻🇳', 'vi-VN'),
  l('cy', 'Welsh', 'Cymraeg', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'cy-GB'),
  l('xh', 'Xhosa', 'isiXhosa', '🇿🇦', 'xh-ZA'),
  l('yi', 'Yiddish', 'ייִדיש', '🕎', 'yi'),
  l('yo', 'Yoruba', 'Yorùbá', '🇳🇬', 'yo-NG'),
  l('zu', 'Zulu', 'isiZulu', '🇿🇦', 'zu-ZA'),
];

export const PopularLanguageCodes = ['en', 'es', 'fr', 'de', 'ja', 'ko', 'ru', 'ar', 'pt-BR', 'hi', 'it', 'vi', 'th', 'id'];

export const DefaultLanguage = Languages.find((x) => x.code === 'en')!;

export const PopularLanguages = PopularLanguageCodes.map((c) => Languages.find((x) => x.code === c)!);

// Lowercase and strip accents so "espanol" finds "Español".
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export function searchLanguages(query: string): Language[] {
  const q = fold(query);
  if (!q) return Languages;
  return Languages.filter((x) =>
    [x.name, x.native, x.code, ...(x.aliases ?? [])].some((field) => fold(field).includes(q))
  ).sort((a, b) => Number(!fold(a.name).startsWith(q)) - Number(!fold(b.name).startsWith(q)));
}

/** Any language Gemini understands works, even if it isn't in the list. */
export function customLanguage(name: string): Language {
  const clean = name.trim().replace(/\s+/g, ' ');
  const title = clean.charAt(0).toUpperCase() + clean.slice(1);
  return { code: `custom:${fold(clean)}`, name: title, native: title, flag: '🌐', speech: 'en-US' };
}
