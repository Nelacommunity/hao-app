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
] as const;
export type StoryType = (typeof STORY_TYPES)[number];

export const AUDIENCES = ['student', 'tourist', 'all'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const IMAGE_KINDS = ['real_photo', 'ai_illustration', 'none'] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

export const ACTION_KINDS = ['navigate', 'save_place', 'talk_to_staff', 'find_food', 'practice_phrase', 'ask_more', 'learn_with_hao'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/** Types that go live without review; the rest start as drafts (unless STORIES_AUTO_APPROVE_ALL is on). */
export const AUTO_APPROVED_TYPES: readonly StoryType[] = ['phrase_of_the_day', 'etiquette_tip', 'season_tip', 'coming_up'];

/** Types about a real place: only real AMap photos, never an AI image. */
export const PLACE_TYPES: readonly StoryType[] = ['place_spotlight', 'your_people_loved'];

export const MAX_HEADING_WORDS = 8;
export const MAX_BODY_WORDS = 40;

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
  })
  .refine((s) => !PLACE_TYPES.includes(s.type) || s.slides.every((slide) => slide.image_kind !== 'ai_illustration'), {
    message: 'Place stories may only use real photos',
    path: ['slides'],
  })
  // Photos that aren't AMap's (e.g. Wikimedia Commons) must say whose they are and their licence.
  .refine((s) => PLACE_TYPES.includes(s.type) || s.slides.every((slide) => slide.image_kind !== 'real_photo' || !!slide.image_credit), {
    message: 'Photos outside place stories need an image credit',
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

/** Validates model output; returns the story or a readable error for the log and the retry prompt. */
export function parseGenerated(raw: string): { ok: true; story: GeneratedStory } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return { ok: false, error: 'Output is not valid JSON' };
  }
  const result = generatedStorySchema.safeParse(json);
  if (result.success) return { ok: true, story: result.data };
  return { ok: false, error: result.error.issues.map((i) => `${i.path.join('.') || 'story'}: ${i.message}`).join('; ') };
}
