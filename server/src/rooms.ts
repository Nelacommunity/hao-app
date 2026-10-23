import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { WebSocket } from 'ws';

import type { LanguageTarget, Preferences, RoomTurnLine } from '../../shared/ai/types';
import {
  ROOM_TTL_MS,
  type ConvCaption,
  type PhaseState,
  type Question,
  type Role,
  type RoomAlert,
  type RoomContext,
  type RoomInfo,
  type RoomSummary,
  type RoomType,
  type ServerMessage,
} from '../../shared/rooms/protocol';
import { config } from './config';

export type Participant = {
  id: string;
  role: Role;
  language: LanguageTarget | null;
  socket: WebSocket | null;
  lastSeen: number;
};

export type CaptionRecord = { seq: number; zh: string; translations: Record<string, string> };

export type Room = {
  id: string;
  type: RoomType;
  hostId: string;
  hostToken: string;
  createdAt: number;
  expiresAt: number;
  userLanguage: LanguageTarget;
  preferences: Preferences | null;
  participants: Map<string, Participant>;
  aiCallTimes: number[];
  aiCallsTotal: number;
  /** Called once when the room closes (e.g. to save the conversation summary to memory). */
  onEnd?: () => void;
  conversation: {
    userName: string;
    context: RoomContext | null;
    /** Each phone sees its own captions, in its own language. */
    hostCaptions: ConvCaption[];
    localCaptions: ConvCaption[];
    /** Recent lines for the agent prompt. */
    recent: RoomTurnLine[];
    summary: RoomSummary | null;
    alerts: RoomAlert[];
    whispers: string[];
    introduced: boolean;
    phase: PhaseState;
    phaseTimer: NodeJS.Timeout | null;
    /** Participants still playing Hao's last lines. */
    awaitingPlayback: Set<string>;
    lastTurnAt: number;
    /** The host's Supabase access token (memory runs as the user, under RLS). */
    memoryToken: string | null;
    memoryEnabled: boolean;
  };
  broadcast: {
    captions: CaptionRecord[];
    questions: Question[];
    nextEmitSeq: number;
    highestSeq: number;
    ready: Map<number, CaptionRecord | null>;
    /** Chunks received and still being transcribed. */
    processing: Set<number>;
    inFlight: number;
    waiting: (() => void)[];
    gapTimer: NodeJS.Timeout | null;
  };
};

const rooms = new Map<string, Room>();

// 31 unambiguous characters; 10 of them ≈ 49 bits, so codes can't be guessed.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function roomCode(length = 10) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function createRoom(input: {
  type: RoomType;
  hostId: string;
  userLanguage: LanguageTarget;
  preferences: Preferences | null;
  context?: RoomContext | null;
  userName?: string;
  memoryToken?: string | null;
  memoryEnabled?: boolean;
}): Room {
  let id = roomCode();
  while (rooms.has(id)) id = roomCode();
  const now = Date.now();
  const room: Room = {
    id,
    type: input.type,
    hostId: input.hostId,
    hostToken: randomBytes(24).toString('base64url'),
    createdAt: now,
    expiresAt: now + ROOM_TTL_MS,
    userLanguage: input.userLanguage,
    preferences: input.preferences,
    participants: new Map(),
    aiCallTimes: [],
    aiCallsTotal: 0,
    conversation: {
      userName: input.userName || 'my friend',
      context: input.context ?? null,
      hostCaptions: [],
      localCaptions: [],
      recent: [],
      summary: null,
      alerts: [],
      whispers: [],
      introduced: false,
      phase: { phase: 'idle', by: null },
      phaseTimer: null,
      awaitingPlayback: new Set(),
      lastTurnAt: now,
      memoryToken: input.memoryToken ?? null,
      memoryEnabled: input.memoryEnabled ?? true,
    },
    broadcast: {
      captions: [],
      questions: [],
      nextEmitSeq: 0,
      highestSeq: -1,
      ready: new Map(),
      processing: new Set(),
      inFlight: 0,
      waiting: [],
      gapTimer: null,
    },
  };
  rooms.set(id, room);
  console.log(`[room] created ${id} type=${room.type}`);
  return room;
}

export function getRoom(id: string | undefined | null): Room | undefined {
  if (!id) return undefined;
  const room = rooms.get(id.toUpperCase());
  if (room && room.expiresAt <= Date.now()) {
    endRoom(room, 'expired');
    return undefined;
  }
  return room;
}

export function activeRoomsForHost(hostId: string) {
  return [...rooms.values()].filter((r) => r.hostId === hostId && r.expiresAt > Date.now()).length;
}

export function roomInfo(room: Room): RoomInfo {
  return { id: room.id, type: room.type, expiresAt: room.expiresAt };
}

export function checkHostToken(room: Room, token: string | null) {
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(room.hostToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function send(socket: WebSocket | null | undefined, message: ServerMessage) {
  if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

export function sendToRole(room: Room, role: Role, message: ServerMessage, filter?: (p: Participant) => boolean) {
  for (const p of room.participants.values()) {
    if (p.role === role && p.socket && (!filter || filter(p))) send(p.socket, message);
  }
}

export function connectedListeners(room: Room) {
  return [...room.participants.values()].filter((p) => p.role === 'listener' && p.socket && p.language);
}

export function listenerCounts(room: Room) {
  const counts: Record<string, { name: string; count: number }> = {};
  for (const p of connectedListeners(room)) {
    const lang = p.language!;
    counts[lang.code] ??= { name: lang.name, count: 0 };
    counts[lang.code].count += 1;
  }
  return counts;
}

export function localConnected(room: Room) {
  return [...room.participants.values()].some((p) => p.role === 'local' && p.socket);
}

export function broadcastPresence(room: Room) {
  const message: ServerMessage = { t: 'presence', localConnected: localConnected(room), counts: listenerCounts(room) };
  for (const p of room.participants.values()) send(p.socket, message);
}

export function endRoom(room: Room, reason: 'host_ended' | 'expired' | 'idle') {
  if (!rooms.has(room.id)) return;
  rooms.delete(room.id);
  if (room.broadcast.gapTimer) clearTimeout(room.broadcast.gapTimer);
  if (room.conversation.phaseTimer) clearTimeout(room.conversation.phaseTimer);
  try {
    room.onEnd?.();
  } catch (e) {
    console.warn(`[room] onEnd failed for ${room.id}:`, (e as Error).message);
  }
  for (const p of room.participants.values()) {
    send(p.socket, { t: 'ended', reason });
    p.socket?.close(4000, reason);
  }
  console.log(`[room] ended ${room.id} reason=${reason} aiCalls=${room.aiCallsTotal}`);
}

/** Sliding-window limiter so a stuck mic or a noisy room can't run up AI costs. */
export function takeAiCall(room: Room): boolean {
  const now = Date.now();
  room.aiCallTimes = room.aiCallTimes.filter((t) => now - t < 60_000);
  if (room.aiCallTimes.length >= config.aiCallsPerMinute || room.aiCallsTotal >= config.aiCallsPerRoom) return false;
  room.aiCallTimes.push(now);
  room.aiCallsTotal += 1;
  return true;
}

export function startExpirySweep() {
  return setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (room.expiresAt <= now) endRoom(room, 'expired');
      // Conversations close after a few quiet minutes; their state is freed with the room.
      else if (room.type === 'conversation' && now - room.conversation.lastTurnAt > config.roomIdleMs) endRoom(room, 'idle');
    }
  }, Math.min(30_000, Math.max(1000, config.roomIdleMs / 4)));
}
