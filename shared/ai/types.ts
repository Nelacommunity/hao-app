// Provider-neutral types shared by the app, the Expo API route and the rooms server.
// Keep this file free of React Native, DOM and Node-only imports.
import type { GuideApp } from './china-guide';

export type AudioInput = { data: string; mimeType: string };

export type LanguageTarget = { code: string; name: string };

// ─── Traveller preferences ───────────────────────────────────────────────────
export type DietTag = 'vegetarian' | 'vegan' | 'halal' | 'kosher' | 'no_pork' | 'no_beef' | 'no_seafood';
export type SpiceLevel = 'none' | 'mild' | 'medium' | 'hot';
export type Budget = 'low' | 'medium' | 'high';
/** Small decisions the agent may take on the user's behalf without asking. */
export type AutonomyKey = 'spice' | 'here_or_to_go' | 'drinks' | 'small_choices';

export type Preferences = {
  diet: DietTag[];
  allergies: string[];
  spice: SpiceLevel;
  budget: Budget;
  autonomy?: AutonomyKey[];
  notes?: string;
};

// ─── Memory: Hao's long-term memory of the user's time in China ──────────────
export type MemoryKind = 'said' | 'fact' | 'preference' | 'place' | 'plan' | 'note';
export type NewMemory = { kind: MemoryKind; text: string };
export type MemoryItem = { id: string; kind: MemoryKind; content: string; happened_at: string };

export type MemoryTurnInput = {
  language: LanguageTarget;
  question: string;
  memories: MemoryItem[];
  history: { role: 'user' | 'hao'; text: string }[];
  /** ISO timestamp, so "yesterday" and "this morning" can be worked out. */
  now: string;
};

export type MemoryTurn = { answer: string; cited_ids: string[]; new_memories: NewMemory[] };

// ─── Solo interpreter (one phone, Translate tab) ─────────────────────────────
export type Speaker = 'traveller' | 'local';

export type AgentTurn = {
  heard: string;
  heard_translation: string;
  goal: string;
  say_to_local_zh: string;
  say_to_local_pinyin: string;
  say_to_local_gloss: string;
  tell_traveller: string;
  key_points: string[];
  next_speaker: Speaker;
  status: 'in_progress' | 'done';
  /** New things worth remembering long-term. */
  memories: NewMemory[];
};

// One line of the shared conversation log the agent reasons over.
export type LogEntry =
  | { kind: 'traveller'; text: string }
  | { kind: 'local'; text: string; translation: string }
  | { kind: 'to_local'; zh: string; pinyin: string; gloss: string }
  | { kind: 'to_traveller'; text: string; points: string[] };

export type SoloTurnInput = {
  speaker: Speaker;
  travellerLanguage: string;
  log: LogEntry[];
  /** Relevant memories, already formatted for the prompt. */
  memories?: string;
  text?: string;
  audio?: AudioInput;
};

// ─── Conversation room (tourist phone ↔ local's phone) ───────────────────────
export type RoomSpeaker = 'USER' | 'LOCAL';

// ─── Broadcast room (guide → many listeners) ─────────────────────────────────
export type CaptionResult = {
  transcript: string;
  /** Keyed by LanguageTarget.code. */
  translations: Record<string, string>;
};

export type TranslationResult = { text: string; detectedLanguage: string };

// ─── Live room agent (voice conversation between the user and a local) ───────
export type Transcript = { text: string; language: string };

export type RoomAlertType = 'allergy' | 'price' | 'scam' | 'budget';

export type RoomAgentTurn = {
  /** Spoken to the other person (the one who did not just speak), in their language. */
  say_to_other: string;
  /** Spoken back to the person who just spoke, e.g. confirming a price or answering from the profile. */
  say_to_speaker: string;
  /** Private note for the user only, in the user's language. */
  whisper_to_user: string;
  alert: { type: RoomAlertType | null; message: string };
  agent_answered_itself: boolean;
  summary_update: { title: string; items: string[]; total: string } | null;
  /** Long-term memories worth saving for the user. */
  memories: NewMemory[];
};

export type RoomTurnLine = { speaker: 'USER' | 'LOCAL' | 'AGENT'; to?: 'USER' | 'LOCAL'; text: string };

export type RoomAgentInput = {
  userName: string;
  userLanguage: LanguageTarget;
  localLanguage: LanguageTarget;
  preferences: Preferences | null;
  context: string | null;
  /** Last ~6 turns. */
  recent: RoomTurnLine[];
  /** True until the agent has introduced itself to the local. */
  introduced: boolean;
  summary: { title: string; items: string[]; total: string } | null;
  memories?: string;
  speaker: 'USER' | 'LOCAL';
  /** Text of the turn, or empty when `audio` is given: then the agent listens to the audio itself. */
  said: string;
  audio?: AudioInput;
};

// ─── Guide (how to do things in China, with multi-step task state) ───────────
export type GuideStepStatus = 'todo' | 'doing' | 'done';

export type GuideTask = {
  id: string;
  title: string;
  steps: { title: string; detail: string; status: GuideStepStatus }[];
};

export type GuideMessage = { role: 'user' | 'hao'; text: string };

export type GuideTurnInput = {
  language: LanguageTarget;
  preferences: Preferences | null;
  /** Nearest covered city, if known, so advice can be local. */
  city: string | null;
  history: GuideMessage[];
  tasks: GuideTask[];
  activeTaskId: string | null;
  text: string;
  memories?: string;
};

export type GuideTurn = {
  reply: string;
  /** A new or revised checklist; empty task_id means no change. */
  task_id: string;
  task_title: string;
  task_steps: { title: string; detail: string }[];
  step_updates: { task_id: string; step_index: number; status: GuideStepStatus }[];
  quick_replies: string[];
  phrase_zh: string;
  phrase_pinyin: string;
  phrase_meaning: string;
  apps: GuideApp[];
  /** When a step needs talking to a local, what the interpreter should do. */
  handoff_goal: string;
  memories: NewMemory[];
};

// ─── The abstraction every AI call goes through ──────────────────────────────
export interface AgentProvider {
  readonly name: string;
  soloTurn(input: SoloTurnInput): Promise<AgentTurn>;
  /** Transcribe once, then translate into every requested language in the same request. */
  transcribeAndTranslate(input: { audio: AudioInput; sourceLanguage: LanguageTarget; targets: LanguageTarget[] }): Promise<CaptionResult>;
  translate(input: { text: string; target: LanguageTarget }): Promise<TranslationResult>;
  /** The app's own UI text, in order. Items that fail validation come back as the English source. */
  translateUi(input: { strings: string[]; target: LanguageTarget }): Promise<string[]>;
  guideTurn(input: GuideTurnInput): Promise<GuideTurn>;
  memoryTurn(input: MemoryTurnInput): Promise<MemoryTurn>;
  /** Speech to text only (fast). Empty text means nothing intelligible was said. */
  transcribe(input: { audio: AudioInput; expected: LanguageTarget[] }): Promise<Transcript>;
  /** `onSay` gets say_to_other as soon as it is generated, before the rest of the turn, so it can be spoken early. */
  roomAgentTurn(input: RoomAgentInput, onSay?: (text: string) => void): Promise<RoomAgentTurn>;
  /** Text to speech; returns playable audio or null if unavailable. */
  synthesize(input: { text: string; language: LanguageTarget }): Promise<AudioInput | null>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
