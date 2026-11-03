// Hands-on Chinese crafts and skills Hao teaches in "learn how" Discover stories, step by step.
// These are the only facts the generator gets for them (scripts/build-story-facts.mjs), so keep steps
// accurate and short. The team reviews every learn_how story before it goes live.

export type Craft = {
  /** Matches story_topics id craft:<id>. */
  id: string;
  title: string;
  zh: string;
  pinyin: string;
  about: string;
  materials: string[];
  steps: string[];
  tips: string[];
  /** Where to try it with others, if anywhere is typical. */
  whereToTry?: string;
};

export const Crafts: Craft[] = [
  {
    id: 'paper-cutting',
    title: 'Paper cutting',
    zh: '剪纸',
    pinyin: 'jiǎnzhǐ',
    about: 'A folk art of cutting patterns from red paper. The cut-outs decorate windows and doors, especially at Spring Festival and weddings.',
    materials: ['A square of thin red paper', 'Small sharp scissors', 'A pencil'],
    steps: [
      'Fold the square in half, then in half again, so the pattern repeats when you open it.',
      'Draw half of a simple shape, such as a flower or heart, against the folded edge.',
      'Cut along your lines, and cut small triangles or slits into the folded edges for a lace pattern.',
      'Unfold slowly, press it flat under a book, and stick it on a window.',
    ],
    tips: ['Start with a simple flower before trying characters.', 'Thin paper cuts more cleanly than card.', 'Red stands for luck and happiness.'],
    whereToTry: 'Folk art museums and Spring Festival temple fairs often have paper-cutting stalls.',
  },
  {
    id: 'dumpling-folding',
    title: 'Folding dumplings',
    zh: '包饺子',
    pinyin: 'bāo jiǎozi',
    about: 'Families in the north make jiaozi together, especially on New Year’s Eve. Folding them is a social activity as much as cooking.',
    materials: ['Round dumpling wrappers (sold in supermarkets)', 'Filling, such as minced vegetables or meat', 'A small bowl of water', 'A spoon'],
    steps: [
      'Hold a wrapper flat on your palm and put a small spoonful of filling in the middle.',
      'Wet half of the wrapper’s edge with a fingertip of water.',
      'Fold it in half into a half moon and press the middle of the edge shut.',
      'Pinch small pleats along one side towards the middle, pressing each one so the dumpling is sealed.',
    ],
    tips: ['Too much filling makes the dumpling burst.', 'Boil them until they float, then a little longer.', 'Dip in vinegar with a little chili oil if you like.'],
    whereToTry: 'Many hostels, universities and cooking schools run dumpling-making evenings.',
  },
  {
    id: 'gongfu-tea',
    title: 'Brewing gongfu tea',
    zh: '功夫茶',
    pinyin: 'gōngfu chá',
    about: 'A way of brewing tea in a small pot or lidded bowl with many short steeps, so you can taste how the tea changes.',
    materials: ['A small teapot or lidded bowl (gaiwan)', 'Small cups', 'Loose-leaf tea such as oolong', 'Hot water'],
    steps: [
      'Warm the pot and cups by rinsing them with hot water.',
      'Fill the pot about a quarter full with tea leaves.',
      'Pour hot water over the leaves and pour it away at once to rinse them.',
      'Steep again for a few seconds, pour into the cups, and repeat with slightly longer steeps each round.',
    ],
    tips: ['Pour evenly between cups so everyone gets the same strength.', 'Tap two fingers on the table to thank someone who refills your cup.'],
    whereToTry: 'Tea houses and tea markets often let you taste teas brewed this way.',
  },
  {
    id: 'brush-fu',
    title: 'Writing 福 with a brush',
    zh: '写福字',
    pinyin: 'xiě fú zì',
    about: '福 (fú) means good fortune. At Spring Festival people write it on red paper and hang it on doors, sometimes upside down, because “fortune upside down” sounds like “fortune arrives”.',
    materials: ['A calligraphy brush', 'Black ink', 'Red paper (or practice paper)', 'A weight to hold the paper flat'],
    steps: [
      'Hold the brush upright, between your thumb and first two fingers, near the middle of the handle.',
      'Dip only the tip in ink and wipe off the extra on the edge of the dish.',
      'Write the left part 礻 first: a dot, a turning stroke, a short vertical, then a short dot.',
      'Write the right part 畐 from top to bottom: a short horizontal, the small box 口, then the larger box 田.',
    ],
    tips: ['Press down to make strokes thicker and lift to make them thinner.', 'Water calligraphy cloths let you practise without ink.'],
    whereToTry: 'In parks, people practise with water on the ground and are often happy to lend the brush.',
  },
  {
    id: 'tangram',
    title: 'Playing tangram',
    zh: '七巧板',
    pinyin: 'qīqiǎobǎn',
    about: 'A Chinese puzzle of seven flat pieces that together make a square. You rearrange them into animals, people and objects.',
    materials: ['A tangram set, or seven pieces cut from a paper square'],
    steps: [
      'Know your pieces: two large triangles, one medium triangle, two small triangles, one square and one parallelogram.',
      'Pick a shape to copy, such as a cat, a house or a boat.',
      'Place the two large triangles first; they decide the main outline.',
      'Fit the other pieces in. Every shape uses all seven pieces, with no overlaps.',
    ],
    tips: ['The parallelogram can be flipped over.', 'Try making the square again at the end; it’s harder than it looks.'],
  },
  {
    id: 'chinese-knot',
    title: 'Tying a simple Chinese knot',
    zh: '中国结',
    pinyin: 'zhōngguó jié',
    about: 'Decorative knots tied from one cord, usually red. They hang in homes and cars as a wish for luck.',
    materials: ['About 1 metre of soft red cord', 'A few pins and a cushion or piece of card to hold the loops'],
    steps: [
      'Start with the button knot (纽扣结), one of the simplest: make a loop near the middle of the cord.',
      'Make a second loop with the other end, lying over the first, and pin both down.',
      'Weave the free end over and under through both loops so they lock together.',
      'Pull both ends gently and evenly until the knot tightens into a small round ball.',
    ],
    tips: ['Tighten slowly; pulling one end hard makes it lopsided.', 'A short video helps for the weaving step: ask Hao to go slower if you get stuck.'],
    whereToTry: 'Craft shops and some museums sell kits with the cord.',
  },
];
