// Provider-neutral types shared by the app, the Expo API route and the rooms server.
// Keep this file free of React Native, DOM and Node-only imports.
import type { GuideApp } from './china-guide';
import type { Story } from '../stories/schema';

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
  /** Hao knowledge-base sections the answer drew on (filled in by the provider, not the model). */
  sources?: string[];
  /** What Hao did for this turn, added by the API route. */
  tools?: ToolUse[];
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

/** Something Hao did while answering, shown above the reply like Claude's tool calls. */
export type ToolUse =
  | { tool: 'knowledge'; items: string[] }
  | { tool: 'recall'; count: number }
  | { tool: 'remember'; items: string[] }
  | { tool: 'listen'; text: string }
  | { tool: 'speak'; text: string }
  | { tool: 'checklist'; title: string; created: boolean }
  | { tool: 'search_places'; query: string; count: number; community: boolean }
  | { tool: 'log_visit'; place: string }
  | { tool: 'my_places'; count: number }
  | { tool: 'save_place'; place: string }
  | { tool: 'story'; title: string }
  | { tool: 'dna'; items: string[] }
  | { tool: 'community_picks'; count: number; nationality: string };

/** The text of a place a traveller reads; the Chinese original stays alongside it in the app. */
export type PlaceText = { name: string; address: string; type: string; tags: string[] };

// ─── Live room agent (voice conversation between the user and a local) ───────
export type Transcript = { text: string; language: string };

export type RoomAlertType = 'allergy' | 'price' | 'scam' | 'budget';
/** Contact details the traveller can choose to share in a conversation (WeChat comes later). */
export type ContactKind = 'phone' | 'email';

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
  /**
   * Someone wants the traveller's phone number or email. Hao never knows them: the traveller's phone asks
   * them whether to share, and only then is it sent.
   */
  contact_request: ContactKind | null;
};

export type RoomTurnLine = { speaker: 'USER' | 'LOCAL' | 'AGENT'; to?: 'USER' | 'LOCAL'; text: string };

export type RoomAgentInput = {
  userName: string;
  /** What the local person asked to be called on the join page, if they gave a name. */
  localName?: string | null;
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
  /** A Discover story the user is asking about, with the facts it was written from. */
  story?: string;
};

export type GuideTurn = {
  /** Hao knowledge-base sections the answer drew on (filled in by the provider, not the model). */
  sources?: string[];
  /** A Discover story shown as a card under the reply (added by the API route, not the model). */
  story?: Story;
  /** Important things the user said about themselves this turn, saved to their Hao DNA. */
  dna?: TwinUpdates;
  /** What Hao did for this turn, added by the API route. */
  tools?: ToolUse[];
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

// ─── Places chat: recommendations and the places the user has been ─────────
export type PlacesTool = 'search_places' | 'community_picks' | 'log_visit' | 'get_my_places' | 'save_place' | 'none';
export type PlacesCategory = 'food' | 'attraction' | 'shop' | 'service' | 'hotel';
export type PlacesFilter = 'halal' | 'vegetarian' | 'cheap' | 'spicy' | 'not_spicy' | 'good_for_groups';

/** A place already shown in this chat, so "save the second one" or "I went there" can refer to it. */
export type ShownPlace = { ref: number; name: string; nameZh: string; category: PlacesCategory };

export type PlacesPlanInput = {
  language: LanguageTarget;
  preferences: Preferences | null;
  /** Nationality, city and university, already formatted. */
  about: string;
  /** "near the user (GPS)", a city name, or null when the location is unknown. */
  where: string | null;
  history: { role: 'user' | 'hao'; text: string }[];
  shown: ShownPlace[];
  text: string;
  memories?: string;
};

/** The tool call Hao decided on (one per turn), with its arguments; unused fields are empty. */
export type PlacesPlan = {
  tool: PlacesTool;
  /** search_places: AMap keywords in Chinese or English (e.g. "清真 牛肉面", "museum"), may be empty for a category. */
  query: string;
  category: PlacesCategory | '';
  /** search_places: a city or area name when the user asked about somewhere else; empty means near the user. */
  near: string;
  filters: PlacesFilter[];
  /** log_visit / save_place: the place, by its ref in the shown list (0 = not shown)… */
  place_ref: number;
  /** …or by name when it wasn't shown. */
  place_name: string;
  /** log_visit: what the user said about it, 1 liked, -1 disliked, 0 unknown. */
  rating: number;
  tags: string[];
  /** community_picks: how far to look. nearby (default), city (the whole city) or anywhere in China (trips). */
  scope: 'nearby' | 'city' | 'anywhere' | '';
  /** Important things the user said about themselves this turn, saved to their Hao DNA. */
  dna: TwinUpdates;
  /** The final reply when tool is none, log_visit or save_place; ignored for searches. */
  reply: string;
  quick_replies: string[];
};

export type PlacesReplyInput = {
  language: LanguageTarget;
  history: { role: 'user' | 'hao'; text: string }[];
  text: string;
  tool: PlacesTool;
  /** What the tool returned, already formatted (names, reasons, distances, the user's ratings). */
  results: string;
  /** The traveller's Hao DNA as plain text, so the reply can say why a result fits them. */
  dna?: string;
};

export type PlacesReply = { reply: string; quick_replies: string[] };

// ─── Digital twin ("Hao DNA"): what Hao knows about the user, built by chatting ───
export type TravellerType = 'student' | 'tourist';

/** The parts of a profile the twin chat reads and may change. */
export type TwinProfile = {
  nationality: string | null;
  /** Their city back home, e.g. "Dar es Salaam", for "somewhere like home". */
  home_city: string | null;
  city: string | null;
  traveller_type: TravellerType | null;
  preferences: Preferences;
  /** Places, foods and activities the user loves, in their words ("night markets", "hotpot"). */
  loves: string[];
  /** Things they want to do, try or find ("try Peking duck", "a quiet café to study"). */
  wants: string[];
  /** Titles of conversations they saved, newest last ("Opening a bank card · 24 Oct"). */
  experiences: string[];
};

/** Changes the model proposes; empty strings and lists mean "no change". Validated by applyTwinUpdates. */
export type TwinUpdates = {
  nationality: string;
  home_city: string;
  city: string;
  traveller_type: TravellerType | '';
  diet_add: string[];
  diet_remove: string[];
  allergies_add: string[];
  allergies_remove: string[];
  spice: SpiceLevel | '';
  budget: Budget | '';
  loves_add: string[];
  loves_remove: string[];
  wants_add: string[];
  wants_remove: string[];
  notes: string;
};

export type TwinTurnInput = {
  language: LanguageTarget;
  profile: TwinProfile;
  /** Found automatically: the phone's region and the city from GPS. The chat confirms them. */
  detected: { nationality: string | null; city: string | null };
  history: { role: 'user' | 'hao'; text: string }[];
  /** Empty when Hao opens the conversation. */
  text: string;
};

export type TwinTurn = { reply: string; quick_replies: string[]; updates: TwinUpdates; done: boolean };

/** A finished QR-room conversation the user chose to save. */
export type ConversationSummaryInput = {
  language: LanguageTarget;
  /** Where it happened, when known (e.g. "Restaurant"); null for a casual chat. */
  context: string | null;
  lines: { speaker: 'USER' | 'LOCAL' | 'AGENT'; to?: 'USER' | 'LOCAL'; text: string }[];
  /** Who was talking, when known: the traveller and the local person (from the join page). */
  names?: { user: string | null; local: string | null };
};

export type ConversationSummary = {
  /** Short title in English, e.g. "Ordering at a restaurant", "Opening a bank card". */
  title: string;
  /** Two or three sentences in the user's language. */
  summary: string;
  /** Useful things learned, as short how-to points in the user's language (e.g. the documents a bank asked for). */
  learned: string[];
  memories: NewMemory[];
  /** What the conversation showed about the user (loves, wants, allergies…), for their Hao DNA. */
  dna: TwinUpdates;
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
  /** Place names, addresses, types and tags, in order. Items that fail validation come back null. */
  translatePlaces(input: { places: PlaceText[]; target: LanguageTarget }): Promise<(PlaceText | null)[]>;
  guideTurn(input: GuideTurnInput): Promise<GuideTurn>;
  memoryTurn(input: MemoryTurnInput): Promise<MemoryTurn>;
  /** Places chat, step 1: pick the tool to call (search, log a visit, list my places, save) and its arguments. */
  placesPlan(input: PlacesPlanInput): Promise<PlacesPlan>;
  /** Places chat, step 2: a short reply grounded only in what the tool returned. */
  placesReply(input: PlacesReplyInput): Promise<PlacesReply>;
  /** Digital twin chat: one question at a time, and the profile changes the user's answers imply. */
  twinTurn(input: TwinTurnInput): Promise<TwinTurn>;
  /** Summarises a saved QR-room conversation for the user's chats, memory and Hao DNA. */
  summarizeConversation(input: ConversationSummaryInput): Promise<ConversationSummary>;
  /** Speech to text only (fast). Empty text means nothing intelligible was said. */
  transcribe(input: { audio: AudioInput; expected: LanguageTarget[] }): Promise<Transcript>;
  /** `onSay` gets say_to_other as soon as it is generated, before the rest of the turn, so it can be spoken early. */
  roomAgentTurn(input: RoomAgentInput, onSay?: (text: string) => void): Promise<RoomAgentTurn>;
  /** Discover's voice guide: a short spoken explanation of a story, place or phrase. */
  explain(input: { title: string; facts: string; language: LanguageTarget }): Promise<{ text: string }>;
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
