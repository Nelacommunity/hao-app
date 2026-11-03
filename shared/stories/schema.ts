// Discover story shapes, shared by the app, the API routes and the generate-stories Edge Function (Deno).
// Keep imports to zod and files in this folder (with .ts extensions) so all three can load it.
import { z } from 'zod';

export const STORY_TYPES = [
  'culture_moment',
  'place_spotlight',
  'your_people_loved',
  'food_to_try',
  'phrase_of_the_day',
  'etiquette_tip',
  'coming_up',
  'season_tip',
  'learn_how',
  'did_you_know',
  'painting',
  'home_and_china',
] as const;
export type StoryType = (typeof STORY_TYPES)[number];

export const AUDIENCES = ['student', 'tourist', 'all'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const IMAGE_KINDS = ['real_photo', 'ai_illustration', 'none'] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

export const ACTION_KINDS = ['navigate', 'save_place', 'talk_to_staff', 'find_food', 'practice_phrase', 'ask_more', 'learn_with_hao'] as const;

/** Types that go live without review; the rest start as drafts (unless STORIES_AUTO_APPROVE_ALL is on). */
export const AUTO_APPROVED_TYPES: readonly StoryType[] = ['phrase_of_the_day', 'etiquette_tip', 'season_tip', 'coming_up'];

/** Types about a real place: only real AMap photos, never an AI image. */
export const PLACE_TYPES: readonly StoryType[] = ['place_spotlight', 'your_people_loved'];

/** Types that open with a quiz question; the story is the answer. */
export const QUIZ_FIRST_TYPES: readonly StoryType[] = ['did_you_know'];
/** Types that end with a one-question quiz on what the story said. */
export const QUIZ_LAST_TYPES: readonly StoryType[] = ['culture_moment', 'painting', 'home_and_china'];

export const MAX_HEADING_WORDS = 8;
export const MAX_BODY_WORDS = 40;
export const MAX_QUESTION_WORDS = 20;
export const MAX_CHOICE_WORDS = 8;
export const MAX_WHY_WORDS = 30;

/** Words in English-like text; each CJK character counts as one, so Chinese can't sneak past the limit. */
export function wordCount(text: string) {
  const cjk = text.match(/[㐀-鿿]/g)?.length ?? 0;
  const words = text.replace(/[㐀-鿿]/g, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return words + Math.ceil(cjk / 2);
}

const heading = z
  .string()
  .trim()
  .min(1)
  .refine((s) => wordCount(s) <= MAX_HEADING_WORDS, `Heading must be at most ${MAX_HEADING_WORDS} words`);
const body = z
  .string()
  .trim()
  .min(1)
  .refine((s) => wordCount(s) <= MAX_BODY_WORDS, `Body must be at most ${MAX_BODY_WORDS} words`);

export const slideSchema = z.object({
  heading,
  body,
  image_url: z.url({ protocol: /^https$/ }).nullable().default(null),
  image_kind: z.enum(IMAGE_KINDS).default('none'),
  /** Who took a photo that isn't from AMap, and its licence, e.g. "Jane Doe · CC BY-SA 4.0 · Wikimedia Commons". */
  image_credit: z.string().trim().max(200).nullable().default(null),
});
export type Slide = z.infer<typeof slideSchema>;

const words = (max: number, what: string) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((s) => wordCount(s) <= max, `${what} must be at most ${max} words`);

/** One question with 2–3 answers; `answer` is the index of the right one, `why` explains it. */
export const quizSchema = z
  .object({
    question: words(MAX_QUESTION_WORDS, 'Question'),
    choices: z.array(words(MAX_CHOICE_WORDS, 'Choice')).min(2).max(3),
    answer: z.number().int().min(0),
    why: words(MAX_WHY_WORDS, 'Why'),
  })
  .refine((q) => q.answer < q.choices.length, { message: 'answer must be the index of one of the choices', path: ['answer'] })
  .refine((q) => new Set(q.choices.map((c) => c.toLowerCase())).size === q.choices.length, { message: 'choices must all differ', path: ['choices'] });
export type Quiz = z.infer<typeof quizSchema>;

/**
 * What the reader can do inside a story: a quiz (before or after the slides), and "Tried it / Want to try"
 * for something they can do in China (`tried`: what it is, in short English for their Hao DNA).
 */
export const interactionSchema = z.object({
  quiz: quizSchema.nullable().default(null),
  quiz_at: z.enum(['start', 'end']).nullable().default(null),
  tried: z.string().trim().min(1).max(80).nullable().default(null),
});
export type Interaction = z.infer<typeof interactionSchema>;

export const actionSchema = z.object({
  kind: z.enum(ACTION_KINDS),
  label: z.string().trim().min(1).max(40),
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});
export type StoryAction = z.infer<typeof actionSchema>;

/** One fact a story was written from (shown to chat for "Ask Hao more", and to reviewers). */
export const sourceSchema = z.object({
  kind: z.enum(['knowledge', 'culture', 'festival', 'holiday', 'dish', 'phrase', 'weather', 'amap_place', 'community_stats', 'wikipedia', 'craft']),
  ref: z.string().max(120),
  facts: z.string().max(2000),
});
export type StorySource = z.infer<typeof sourceSchema>;

/** A story as the feed sends it to the app. */
export const storySchema = z
  .object({
    id: z.string(),
    type: z.enum(STORY_TYPES),
    city: z.string().nullable(),
    nationality: z.string().nullable(),
    audience: z.enum(AUDIENCES),
    language: z.string(),
    title: z.string().min(1).max(120),
    slides: z.array(slideSchema).min(3).max(4),
    action: actionSchema,
    place_id: z.string().nullable(),
    topics: z.array(z.string()),
    valid_until: z.string().nullable(),
    /** Shown on the story when its facts or photos need credit, e.g. "Based on Wikipedia: Paper cutting (CC BY-SA 4.0)". */
    attribution: z.string().max(300).nullable().default(null),
    interaction: interactionSchema.nullable().default(null),
  })
  .refine((s) => !PLACE_TYPES.includes(s.type) || s.slides.every((slide) => slide.image_kind !== 'ai_illustration'), {
    message: 'Place stories may only use real photos',
    path: ['slides'],
  })
  // Photos that aren't AMap's (e.g. Wikimedia Commons) must say whose they are and their licence.
  .refine((s) => PLACE_TYPES.includes(s.type) || s.slides.every((slide) => slide.image_kind !== 'real_photo' || !!slide.image_credit), {
    message: 'Photos outside place stories need an image credit',
    path: ['slides'],
  })
  .refine((s) => !s.interaction?.quiz === !s.interaction?.quiz_at, { message: 'A quiz needs quiz_at, and quiz_at needs a quiz', path: ['interaction'] })
  // A painting story is about one real artwork: never an AI picture of it.
  .refine((s) => s.type !== 'painting' || s.slides.every((slide) => slide.image_kind === 'real_photo'), {
    message: 'Painting stories show the real painting on every slide',
    path: ['slides'],
  });
export type Story = z.infer<typeof storySchema>;

/**
 * What the model returns. Images, the action and every id are added by code from the facts, so the
 * model can't invent a URL, a place or a coordinate.
 */
export const generatedStorySchema = z.object({
  title: z.string().trim().min(1).max(80),
  slides: z.array(z.object({ heading, body })).min(3).max(4),
  action_label: z.string().trim().min(1).max(40),
  /** Only asked for (and kept) for quiz types. */
  quiz: quizSchema.optional(),
});
export type GeneratedStory = z.infer<typeof generatedStorySchema>;

/** JSON schema of generatedStorySchema for the model's structured output. */
export const generatedStoryJsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Story title, at most 8 words.' },
    slides: {
      type: 'array',
      minItems: 3,
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string', description: `At most ${MAX_HEADING_WORDS} words.` },
          body: { type: 'string', description: `At most ${MAX_BODY_WORDS} words.` },
        },
        required: ['heading', 'body'],
      },
    },
    action_label: { type: 'string', description: 'Short button label for the last slide, at most 4 words.' },
  },
  required: ['title', 'slides', 'action_label'],
} as const;

/** generatedStoryJsonSchema plus the quiz, for quiz types. */
export const generatedQuizStoryJsonSchema = {
  ...generatedStoryJsonSchema,
  properties: {
    ...generatedStoryJsonSchema.properties,
    quiz: {
      type: 'object',
      properties: {
        question: { type: 'string', description: `At most ${MAX_QUESTION_WORDS} words.` },
        choices: { type: 'array', minItems: 2, maxItems: 3, items: { type: 'string', description: `At most ${MAX_CHOICE_WORDS} words.` } },
        answer: { type: 'integer', description: 'Index (from 0) of the right choice.' },
        why: { type: 'string', description: `At most ${MAX_WHY_WORDS} words.` },
      },
      required: ['question', 'choices', 'answer', 'why'],
    },
  },
  required: ['title', 'slides', 'action_label', 'quiz'],
} as const;

/** Validates model output; returns the story or a readable error for the log and the retry prompt. */
export function parseGenerated(raw: string, o: { quiz?: boolean } = {}): { ok: true; story: GeneratedStory } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return { ok: false, error: 'Output is not valid JSON' };
  }
  const result = generatedStorySchema.safeParse(json);
  if (result.success && o.quiz && !result.data.quiz) return { ok: false, error: 'quiz: missing' };
  if (result.success) return { ok: true, story: o.quiz ? result.data : { ...result.data, quiz: undefined } };
  return { ok: false, error: result.error.issues.map((i) => `${i.path.join('.') || 'story'}: ${i.message}`).join('; ') };
}
