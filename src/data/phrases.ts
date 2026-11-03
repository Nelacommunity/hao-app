import { tx } from '@shared/i18n/tx';
export type Phrase = {
  en: string;
  zh: string;
  pinyin: string;
};

export type PhraseGroup = {
  id: string;
  title: string;
  emoji: string;
  phrases: Phrase[];
};

export const PhraseGroups: PhraseGroup[] = [
  {
    id: 'basics',
    title: tx('Basics'),
    emoji: '👋',
    phrases: [
      { en: tx('Hello'), zh: '你好', pinyin: 'nǐ hǎo' },
      { en: tx('Thank you'), zh: '谢谢', pinyin: 'xièxie' },
      { en: tx('Sorry'), zh: '对不起', pinyin: 'duìbuqǐ' },
      { en: tx('I don’t understand'), zh: '我听不懂', pinyin: 'wǒ tīng bu dǒng' },
    ],
  },
  {
    id: 'getting-around',
    title: tx('Getting around'),
    emoji: '🚕',
    phrases: [
      { en: tx('Where is the subway?'), zh: '地铁站在哪里？', pinyin: 'dìtiě zhàn zài nǎlǐ?' },
      { en: tx('Please take me here'), zh: '请带我去这里', pinyin: 'qǐng dài wǒ qù zhèlǐ' },
      { en: tx('Where is the toilet?'), zh: '洗手间在哪里？', pinyin: 'xǐshǒujiān zài nǎlǐ?' },
    ],
  },
  {
    id: 'eating',
    title: tx('Eating out'),
    emoji: '🍜',
    phrases: [
      { en: tx('Not spicy, please'), zh: '请不要辣', pinyin: 'qǐng bú yào là' },
      { en: tx('The bill, please'), zh: '请买单', pinyin: 'qǐng mǎidān' },
      { en: tx('I’m allergic to peanuts'), zh: '我对花生过敏', pinyin: 'wǒ duì huāshēng guòmǐn' },
    ],
  },
  {
    id: 'shopping',
    title: tx('Shopping'),
    emoji: '🛍️',
    phrases: [
      { en: tx('How much is this?'), zh: '这个多少钱？', pinyin: 'zhège duōshao qián?' },
      { en: tx('Too expensive'), zh: '太贵了', pinyin: 'tài guì le' },
      { en: tx('Can I pay by card?'), zh: '可以刷卡吗？', pinyin: 'kěyǐ shuākǎ ma?' },
    ],
  },
  {
    id: 'emergency',
    title: tx('Emergency'),
    emoji: '🆘',
    phrases: [
      { en: tx('Help!'), zh: '救命！', pinyin: 'jiùmìng!' },
      { en: tx('Call the police'), zh: '请报警', pinyin: 'qǐng bàojǐng' },
      { en: tx('I need a doctor'), zh: '我需要医生', pinyin: 'wǒ xūyào yīshēng' },
    ],
  },
];

