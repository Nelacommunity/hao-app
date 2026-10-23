// WebSocket protocol shared by the rooms server and the app. The vanilla web join page
// (server/public/join.js) speaks the same messages; keep it in sync when changing this file.
import type { AudioInput, LanguageTarget, Preferences, RoomAlertType, RoomSpeaker } from '../ai/types';
import { tx } from '../i18n/tx';

export type RoomType = 'conversation' | 'broadcast';
export type Role = 'host' | 'local' | 'listener';

export const ROOM_TTL_MS = 3 * 60 * 60 * 1000;

// ─── Conversation rooms ──────────────────────────────────────────────────────
export type RoomContext = 'restaurant' | 'taxi' | 'shop' | 'bank' | 'hotel' | 'phone_shop' | 'pharmacy' | 'other';

export const RoomContexts: Record<RoomContext, { label: string; zh: string }> = {
  restaurant: { label: tx('Restaurant'), zh: '餐厅' },
  taxi: { label: tx('Taxi'), zh: '出租车' },
  shop: { label: tx('Shop'), zh: '商店' },
  bank: { label: tx('Bank'), zh: '银行' },
  hotel: { label: tx('Hotel'), zh: '酒店' },
  phone_shop: { label: tx('Phone shop'), zh: '手机店' },
  pharmacy: { label: tx('Pharmacy'), zh: '药店' },
  other: { label: tx('Other'), zh: '其他' },
};

/** Only one person talks at a time: the room moves idle → listening → thinking → speaking → idle. */
export type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';
export type PhaseState = { phase: Phase; by: RoomSpeaker | null };

export type ConvCaption = {
  id: string;
  speaker: 'USER' | 'LOCAL' | 'AGENT';
  /** For agent lines: who Hao was speaking to. */
  to?: 'USER' | 'LOCAL';
  text: string;
  at: number;
};
export type RoomSummary = { title: string; items: string[]; total: string };
export type RoomAlert = { type: RoomAlertType; message: string; at: number };

export type CreateRoomRequest = {
  type: RoomType;
  userLanguage: LanguageTarget;
  preferences?: Preferences | null;
  context?: RoomContext | null;
};

export type CreateRoomResponse = {
  roomId: string;
  hostToken: string;
  joinUrl: string;
  expiresAt: number;
};

export type RoomInfo = { id: string; type: RoomType; expiresAt: number };

export type TranscriptLine = { seq: number; zh: string };
export type Caption = { seq: number; text: string };
export type Question = { id: string; original: string; zh: string; language: string; at: number };
export type ListenerCounts = Record<string, { name: string; count: number }>;

export type Snapshot =
  | {
      kind: 'conversation_host';
      captions: ConvCaption[];
      summary: RoomSummary | null;
      alerts: RoomAlert[];
      whispers: string[];
      context: RoomContext | null;
      phase: PhaseState;
      localConnected: boolean;
    }
  | { kind: 'conversation_local'; captions: ConvCaption[]; phase: PhaseState }
  | { kind: 'broadcast_host'; transcript: TranscriptLine[]; questions: Question[]; counts: ListenerCounts; nextSeq: number }
  | { kind: 'broadcast_listener'; captions: Caption[] };

export type ClientMessage =
  | { t: 'ping' }
  | { t: 'audio'; speaker: RoomSpeaker; audio: AudioInput }
  | { t: 'text'; speaker: RoomSpeaker; text: string }
  /** Recording started (claims the turn) or cancelled. */
  | { t: 'mic'; active: boolean }
  /** This phone finished playing Hao's voice. */
  | { t: 'played' }
  | { t: 'set_context'; context: RoomContext | null }
  /** Host refreshes its Supabase access token so the room can keep using its memory. */
  | { t: 'auth'; accessToken: string }
  | { t: 'chunk'; seq: number; audio: AudioInput }
  | { t: 'question'; text: string }
  | { t: 'set_language'; language: LanguageTarget }
  | { t: 'end' };

export type ErrorCode =
  | 'room_not_found'
  | 'room_full'
  | 'unauthorized'
  | 'rate_limited'
  | 'bad_request'
  | 'busy'
  | 'ai_failed';

export type ServerMessage =
  | { t: 'welcome'; room: RoomInfo; you: { id: string; role: Role }; snapshot: Snapshot }
  | { t: 'presence'; localConnected: boolean; counts: ListenerCounts }
  | { t: 'phase'; state: PhaseState }
  | { t: 'conv_caption'; caption: ConvCaption }
  /** Hao speaking to this phone: play `audio` if present, otherwise speak `text` with the device voice in `lang`. */
  | { t: 'voice'; id: string; text: string; lang: string; audio: AudioInput | null }
  | { t: 'whisper'; text: string }
  | { t: 'alert'; alert: RoomAlert }
  | { t: 'summary'; summary: RoomSummary | null }
  | { t: 'context'; context: RoomContext | null }
  | { t: 'not_heard' }
  | { t: 'transcript'; line: TranscriptLine }
  | { t: 'caption'; caption: Caption }
  | { t: 'question'; question: Question }
  | { t: 'question_sent'; ok: boolean }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'ended'; reason: 'host_ended' | 'expired' | 'idle' }
  | { t: 'pong' };
