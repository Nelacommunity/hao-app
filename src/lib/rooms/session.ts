import Constants from 'expo-constants';
import { getRandomBytes } from 'expo-crypto';
import { Platform } from 'react-native';

import type { RoomContext, RoomType } from '@shared/rooms/protocol';
import { joinPath, newRoomCode } from '@shared/rooms/realtime';

export type HostedRoom = { roomId: string; type: RoomType; joinUrl: string; expiresAt: number };

const ROOM_TTL_MS = 3 * 60 * 60 * 1000;

/**
 * Where guests open the join page (public/join.html). The guest's microphone needs https, so:
 * the dev server when it's https (`npx expo start --tunnel`), otherwise EXPO_PUBLIC_WEB_URL (the
 * EAS Hosting deployment, which production builds always use), otherwise the plain-http dev server.
 */
export function webBaseUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  const host = Constants.expoConfig?.hostUri;
  if (host?.includes('exp.direct')) return `https://${host.replace(/:\d+$/, '')}`;
  const configured = process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/+$/, '');
  if (configured) return configured;
  return host ? `http://${host}` : '';
}

// The rooms this device is hosting, shared by the QR page and the live screens.
// Each mode keeps one room until it ends or expires, so switching tabs never creates extra rooms.
const rooms: Partial<Record<RoomType, HostedRoom>> = {};

export function getHostedRoom(type: RoomType): HostedRoom | null {
  const room = rooms[type];
  if (room && room.expiresAt <= Date.now()) {
    delete rooms[type];
    return null;
  }
  return room ?? null;
}

export function ensureHostedRoom(type: RoomType): HostedRoom {
  const existing = getHostedRoom(type);
  if (existing) return existing;
  const roomId = newRoomCode(getRandomBytes);
  const room = { roomId, type, joinUrl: `${webBaseUrl()}${joinPath(roomId, type)}`, expiresAt: Date.now() + ROOM_TTL_MS };
  rooms[type] = room;
  return room;
}

export function forgetHostedRoom(type: RoomType) {
  delete rooms[type];
}

// Where the conversation happens when Hao knows it ("Talk to staff" on a place card sets it); null is a casual chat.
let roomContext: RoomContext | null = null;
export const getRoomContext = () => roomContext;
export const setRoomContext = (next: RoomContext | null) => {
  roomContext = next;
};

// The place a Voice Room was opened for ("Talk to staff" on a place card). When the conversation
// ends, Hao asks whether the user went there.
let roomPlace: { id: string; name: string } | null = null;
export const getRoomPlace = () => roomPlace;
export const setRoomPlace = (next: { id: string; name: string } | null) => {
  roomPlace = next;
};
