import Constants from 'expo-constants';
import { getRandomBytes } from 'expo-crypto';
import { Platform } from 'react-native';

import type { RoomContext, RoomType } from '@shared/rooms/protocol';
import { joinPath, newRoomCode } from '@shared/rooms/realtime';

export type HostedRoom = { roomId: string; type: RoomType; joinUrl: string; expiresAt: number };

const ROOM_TTL_MS = 3 * 60 * 60 * 1000;

/**
 * Where guests open the join page (public/join.html, served by the Expo web server):
 * the dev server the app was loaded from (host and port), https when started with
 * `npx expo start --tunnel`, which the guest's microphone needs; otherwise EXPO_PUBLIC_WEB_URL
 * (e.g. an EAS Hosting URL), which production builds use since they have no dev server.
 */
export function webBaseUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  const host = Constants.expoConfig?.hostUri;
  if (host) return host.includes('exp.direct') ? `https://${host.replace(/:\d+$/, '')}` : `http://${host}`;
  return process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/+$/, '') ?? '';
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

// Where the user said they are (restaurant, taxi…), chosen on the QR page and used by the conversation.
let roomContext: RoomContext | null = 'restaurant';
export const getRoomContext = () => roomContext;
export const setRoomContext = (next: RoomContext | null) => {
  roomContext = next;
};
