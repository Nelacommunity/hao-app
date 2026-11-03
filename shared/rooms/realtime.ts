// Rooms run over Supabase Realtime. The host app is the room's "server": it keeps the state, calls the AI
// through the app's API routes, and broadcasts the same ServerMessage shapes the guest page understands.
// Guests (web page, no account) send ClientMessages. Keep the guest page in sync:
// public/join/join.js.
import type { LanguageTarget } from '../ai/types';
import type { ClientMessage, Role, RoomType, ServerMessage } from './protocol';

export const channelName = (code: string) => `hao-room-${code.toUpperCase()}`;

/** Broadcast event names on the room channel. */
export const EVENTS = { toGuests: 'srv', fromGuest: 'cli' } as const;

/** Host → guests. `to` targets one participant id, a role, or everyone. */
export type HostEnvelope = { to: 'all' | 'local' | 'listeners' | { pid: string } | { lang: string }; msg: ServerMessage };

/** Guest → host. */
/** `name`: what the guest asked to be called (typed on the join page), so the chat shows who said what. */
export type GuestEnvelope = { from: string; role: Exclude<Role, 'host'>; language?: LanguageTarget; name?: string; msg: ClientMessage | { t: 'hello' } };

/** What each client tracks in channel presence. */
export type PresenceMeta = { pid: string; role: Role; language?: LanguageTarget; type?: RoomType; name?: string; at: number };

/** A display name from untrusted input: trimmed, single line, short. */
export const cleanName = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 24) : '');

/** The QR encodes the room code and type, so the guest page needs no server lookup. */
export const joinPath = (code: string, type: RoomType) => `/join.html?r=${code}&t=${type === 'conversation' ? 'c' : 'b'}`;

// 31 unambiguous characters; 10 of them ≈ 49 bits, so codes can't be guessed.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function newRoomCode(randomBytes: (n: number) => Uint8Array, length = 10) {
  return Array.from(randomBytes(length), (b) => ALPHABET[b % ALPHABET.length]).join('');
}
