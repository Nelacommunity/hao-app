// Prompts for writing one Discover story from given facts. The model only writes the words: every fact,
// image, place and button target comes from code (see generate.ts).
import { MAX_BODY_WORDS, MAX_CHOICE_WORDS, MAX_HEADING_WORDS, MAX_QUESTION_WORDS, MAX_WHY_WORDS, type StoryType } from './schema.ts';

export function storySystemPrompt(language: string) {
  return `You write short Discover stories for Hao, an app that helps international students and tourists feel at home in China.
Each story is a few swipeable slides that promote Chinese culture and places in a warm, friendly way.

Rules:
1. Use ONLY the facts listed under FACTS. Never add names, dates, prices, numbers, opening hours, history, legends or claims that are not there. If a fact you would like to use is missing, leave it out.
2. Write exactly the number of slides asked for. Each heading has at most ${MAX_HEADING_WORDS} words; each body has at most ${MAX_BODY_WORDS} words.
3. Write in simple, friendly ${language} for someone new to China: short sentences, no slang, no jargon.
4. Be respectful about Chinese culture and people. No politics, no opinions about governments, history disputes or territory. Mention religion only as a neutral description of a custom. No medical, legal or visa advice.
5. Don't invent quotes, statistics or what "locals think". Don't promise that a place is open, cheap, halal or safe unless FACTS say so.
6. Write Chinese words and pinyin exactly as they appear in FACTS.
7. FACTS from Wikipedia can be long: pick the friendly, cultural parts (what it is, how people enjoy it, what to look for) and leave out anything political, contested or sad.
8. For a skill to learn, teach the steps in order, in plain words, exactly as given; never add steps.
9. The last slide should lead naturally to the button.
10. When a QUIZ is asked for: one question whose answer is stated in FACTS, 2–3 short choices where only one is right and the others are plausible but clearly wrong by FACTS, "answer" = the index (from 0) of the right choice, and "why" = one or two sentences explaining it from FACTS. Question at most ${MAX_QUESTION_WORDS} words, each choice at most ${MAX_CHOICE_WORDS}, why at most ${MAX_WHY_WORDS}. Never a trick question.
11. Return ONLY a JSON object: {"title": string, "slides": [{"heading": string, "body": string}], "action_label": string} (plus "quiz": {"question": string, "choices": [string], "answer": number, "why": string} when asked for). No markdown, no extra keys.`;
}

const GOALS: Record<StoryType, string> = {
  culture_moment: 'Explain this tradition: what it is, what people do, and a tip for enjoying or joining in.',
  place_spotlight: 'Show why this real place nearby is worth a visit: what it is, what to see or do there, and practical details only if FACTS give them.',
  your_people_loved: 'This real place is popular with people from the country in FACTS. Say how many of them visited and liked it (numbers exactly as given), what the place is, and practical details only if FACTS give them.',
  food_to_try: 'Introduce this dish: what it is and what is in it, how spicy it is, diet notes exactly as given (halal, vegetarian, pork), and how to order it.',
  phrase_of_the_day: 'Teach this one phrase: the Chinese, the pinyin, what it means, and when to use it.',
  etiquette_tip: 'Give one simple etiquette tip: the situation, what to do, and what to avoid.',
  coming_up: 'A holiday countdown: when it starts (exactly as given), what it is, what will be closed or crowded, and one tip.',
  season_tip: 'Weather and season advice for the next few days in this city, from the forecast and climate notes.',
  learn_how: 'Teach this hands-on skill like a friendly teacher: slide 1 what it is and what you need, slides 2–3 the steps in order, slide 4 the last step and a tip, inviting the user to learn it with Hao.',
  did_you_know:
    'A "Did you know?" story. The reader first answers the QUIZ: a surprising, fun fact from FACTS that most visitors would not guess. The slides then reveal and explain it: slide 1 the answer and what it means, the next slides the story behind it and how to see or enjoy it in China. Curious and playful, never smug.',
  painting:
    'Introduce this famous Chinese painting to someone seeing it for the first time, as a museum guide would: slide 1 what it is and who painted it, the middle slides what it shows and what to look for (style, scenes, details), the last slide why people love it and where it is kept, only if FACTS say so. The picture on screen is the painting itself; the app zooms across it as the slides go.',
  home_and_china:
    'Show a traveller from the country in FACTS how their home and China are connected: people, students, trade, travel, culture, food, landmarks or shared history. Warm and personal ("you might be surprised…"), with real facts only. Leave out politics, governments, leaders, debt, military, disputes and anything negative; if FACTS are mostly about those, use only the friendly parts.',
};

export function storyUserPrompt(o: {
  type: StoryType;
  city: string;
  slides: number;
  actionLabel: string;
  facts: string[];
  /** Ask for a quiz shown before the slides (the story answers it) or after them (it checks what they said). */
  quiz?: 'start' | 'end' | null;
  retryError?: string;
}) {
  return [
    `STORY TYPE: ${o.type}`,
    `CITY: ${o.city}`,
    `GOAL: ${GOALS[o.type]}`,
    `SLIDES: exactly ${o.slides}`,
    `BUTTON on the last slide: "${o.actionLabel}" (you may shorten it; at most 4 words).`,
    ...(o.quiz === 'start'
      ? ['QUIZ: yes, shown BEFORE the slides. Ask about the surprising fact; the slides then reveal and explain it.']
      : o.quiz === 'end'
        ? ['QUIZ: yes, shown AFTER the slides, as a friendly check of one thing the slides said.']
        : []),
    'FACTS:',
    ...o.facts.map((f) => `- ${f}`),
    ...(o.retryError
      ? ['', `Your previous answer was rejected: ${o.retryError}. Fix that and reply with the JSON object only.`]
      : []),
  ].join('\n');
}

/** Prompt for an optional illustration of a cultural tradition (never for real places or restaurant food). */
export function illustrationPrompt(o: { title: string; zh: string; about: string }) {
  return `A warm, simple flat illustration of the Chinese tradition "${o.title}"${o.zh ? ` (${o.zh})` : ''}: ${o.about} Soft colours, friendly, no text, no letters, no logos, no recognisable real people.`;
}
