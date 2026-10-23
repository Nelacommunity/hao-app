import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';

import { createProvider, parsePreferences } from '../../shared/ai';
import type { AudioInput, LanguageTarget } from '../../shared/ai/types';
import { RoomContexts, type ClientMessage, type CreateRoomRequest, type CreateRoomResponse, type Role, type Snapshot } from '../../shared/rooms/protocol';
import { authenticateHost } from './auth';
import { captionsFor, handleChunk, handleQuestion } from './broadcast';
import { config, providerEnv } from './config';
import { handleMic, handlePlayed, handleTurn, rememberSummary, setContext } from './conversation';
import { loadProfile } from './memory';
import {
  activeRoomsForHost,
  broadcastPresence,
  checkHostToken,
  createRoom,
  endRoom,
  getRoom,
  listenerCounts,
  localConnected,
  roomInfo,
  send,
  startExpirySweep,
  type Participant,
  type Room,
} from './rooms';

const provider = createProvider(providerEnv);
const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const MAX_AUDIO_BASE64 = 6 * 1024 * 1024;

// ─── HTTP ────────────────────────────────────────────────────────────────────
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, limit = 64 * 1024): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error('Body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function serveStatic(res: ServerResponse, relative: string) {
  const path = normalize(join(PUBLIC_DIR, relative));
  if (!path.startsWith(PUBLIC_DIR)) return json(res, 404, { error: 'Not found' });
  try {
    const body = await readFile(path);
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(path)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  } catch {
    json(res, 404, { error: 'Not found' });
  }
}

// Street-routing proxy for phones that can't reach the public OpenStreetMap router directly.
const ROUTE_MODES = new Set(['foot', 'bike', 'car']);
const ROUTE_PATH = /^-?\d{1,3}\.\d{1,8},-?\d{1,2}\.\d{1,8};-?\d{1,3}\.\d{1,8},-?\d{1,2}\.\d{1,8}$/;
const routeCalls = new Map<string, number[]>();

async function proxyRoute(req: IncomingMessage, res: ServerResponse, url: URL) {
  const mode = url.searchParams.get('mode') ?? '';
  const path = url.searchParams.get('path') ?? '';
  if (!ROUTE_MODES.has(mode) || !ROUTE_PATH.test(path)) return json(res, 400, { error: 'Invalid mode or path' });

  const ip = req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const recent = (routeCalls.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 60) return json(res, 429, { error: 'Too many route requests' });
  routeCalls.set(ip, [...recent, now]);

  try {
    const upstream = await fetch(
      `https://routing.openstreetmap.de/routed-${mode}/route/v1/driving/${path}?overview=full&geometries=geojson`,
      { signal: AbortSignal.timeout(8000) }
    );
    return json(res, upstream.status, await upstream.json());
  } catch {
    return json(res, 502, { error: 'Routing service unreachable' });
  }
}

const isLanguage = (v: unknown): v is LanguageTarget =>
  !!v && typeof (v as LanguageTarget).code === 'string' && typeof (v as LanguageTarget).name === 'string';

const cleanLanguage = (l: LanguageTarget): LanguageTarget => ({ code: l.code.slice(0, 32), name: l.name.slice(0, 64) });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;

  if (req.method === 'OPTIONS') return json(res, 204, null);
  if (path === '/health') return json(res, 200, { ok: true, provider: provider.name });
  if (path === '/api/route' && req.method === 'GET') return proxyRoute(req, res, url);

  if (path === '/api/rooms' && req.method === 'POST') {
    const hostId = await authenticateHost(req.headers.authorization);
    if (!hostId) return json(res, 401, { error: 'Sign in to create a room.' });
    if (activeRoomsForHost(hostId) >= config.maxRoomsPerHost) {
      return json(res, 429, { error: 'You already have the maximum number of open rooms. End one first.' });
    }
    let body: CreateRoomRequest;
    try {
      body = (await readJson(req)) as CreateRoomRequest;
    } catch {
      return json(res, 400, { error: 'Invalid JSON body' });
    }
    if ((body.type !== 'conversation' && body.type !== 'broadcast') || !isLanguage(body.userLanguage)) {
      return json(res, 400, { error: 'type and userLanguage are required' });
    }
    // The user's own token lets the room read their profile and memory under RLS.
    const accessToken = req.headers.authorization?.replace(/^Bearer\s+/i, '') || null;
    const profile = body.type === 'conversation' ? await loadProfile(accessToken, hostId).catch(() => null) : null;
    const room = createRoom({
      type: body.type,
      hostId,
      userLanguage: cleanLanguage(body.userLanguage),
      preferences: profile?.preferences ?? parsePreferences(body.preferences),
      context: body.context && body.context in RoomContexts ? body.context : null,
      userName: profile?.name ?? undefined,
      memoryToken: profile ? accessToken : null,
      memoryEnabled: profile?.memoryEnabled ?? false,
    });
    if (room.type === 'conversation') room.onEnd = () => rememberSummary(room);
    const response: CreateRoomResponse = {
      roomId: room.id,
      hostToken: room.hostToken,
      joinUrl: `${config.publicBaseUrl}/join/${room.id}`,
      expiresAt: room.expiresAt,
    };
    return json(res, 201, response);
  }

  const roomMatch = path.match(/^\/api\/rooms\/([A-Za-z0-9]{4,16})$/);
  if (roomMatch && req.method === 'GET') {
    const room = getRoom(roomMatch[1]);
    return room ? json(res, 200, roomInfo(room)) : json(res, 404, { error: 'Room not found or expired' });
  }

  if (path === '/join' || /^\/join\/[A-Za-z0-9]{4,16}\/?$/.test(path)) return serveStatic(res, 'join.html');
  if (path.startsWith('/static/')) return serveStatic(res, path.slice('/static/'.length));
  if (path === '/') {
    res.writeHead(302, { Location: '/join' });
    return res.end();
  }
  json(res, 404, { error: 'Not found' });
});

// ─── WebSocket ───────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 * 1024 });

function snapshotFor(room: Room, participant: Participant): Snapshot {
  if (room.type === 'conversation') {
    const c = room.conversation;
    return participant.role === 'host'
      ? {
          kind: 'conversation_host',
          captions: c.hostCaptions,
          summary: c.summary,
          alerts: c.alerts,
          whispers: c.whispers,
          context: c.context,
          phase: c.phase,
          localConnected: localConnected(room),
        }
      : { kind: 'conversation_local', captions: c.localCaptions, phase: c.phase };
  }
  const b = room.broadcast;
  return participant.role === 'host'
    ? {
        kind: 'broadcast_host',
        transcript: b.captions.slice(-50).map((c) => ({ seq: c.seq, zh: c.zh })),
        questions: b.questions,
        counts: listenerCounts(room),
        nextSeq: b.highestSeq + 1,
      }
    : { kind: 'broadcast_listener', captions: captionsFor(room, participant.language) };
}

const validAudio = (a: unknown): a is AudioInput =>
  !!a &&
  typeof (a as AudioInput).data === 'string' &&
  typeof (a as AudioInput).mimeType === 'string' &&
  (a as AudioInput).mimeType.startsWith('audio/') &&
  (a as AudioInput).data.length > 0 &&
  (a as AudioInput).data.length <= MAX_AUDIO_BASE64;

function reject(socket: WebSocket, code: 'room_not_found' | 'room_full' | 'unauthorized' | 'bad_request', message: string) {
  send(socket, { t: 'error', code, message });
  socket.close(4001, code);
}

wss.on('connection', (socket, req) => {
  const url = new URL(req.url ?? '', 'http://localhost');
  const room = getRoom(url.searchParams.get('room'));
  if (!room) return reject(socket, 'room_not_found', 'Room not found or expired');

  const role = url.searchParams.get('role') as Role;
  const participantId = (url.searchParams.get('pid') ?? '').slice(0, 64);
  if (!['host', 'local', 'listener'].includes(role) || !participantId) {
    return reject(socket, 'bad_request', 'Missing role or participant id');
  }
  if (role === 'host' && !checkHostToken(room, url.searchParams.get('token'))) {
    return reject(socket, 'unauthorized', 'Invalid host token');
  }
  if ((role === 'local' && room.type !== 'conversation') || (role === 'listener' && room.type !== 'broadcast')) {
    return reject(socket, 'bad_request', 'Wrong role for this room');
  }
  if (role === 'local') {
    const other = [...room.participants.values()].find((p) => p.role === 'local' && p.socket && p.id !== participantId);
    if (other) return reject(socket, 'room_full', 'Someone else is already in this conversation');
  }
  if (role === 'listener') {
    const listeners = [...room.participants.values()].filter((p) => p.role === 'listener' && p.socket).length;
    if (listeners >= config.maxListeners) return reject(socket, 'room_full', 'This tour is full');
  }

  // Reconnects reuse the participant record, so a listener keeps their language and history.
  const existing = room.participants.get(participantId);
  if (existing && existing.role !== role) return reject(socket, 'bad_request', 'Participant id already used');
  existing?.socket?.close(4002, 'replaced');
  const participant: Participant = existing ?? { id: participantId, role, language: null, socket: null, lastSeen: Date.now() };
  participant.socket = socket;
  participant.lastSeen = Date.now();
  const lang = url.searchParams.get('lang');
  const langName = url.searchParams.get('langName');
  if ((role === 'listener' || role === 'local') && lang && langName) participant.language = cleanLanguage({ code: lang, name: langName });
  room.participants.set(participantId, participant);
  if (role === 'host') room.hostId = room.hostId || participantId;

  send(socket, { t: 'welcome', room: roomInfo(room), you: { id: participantId, role }, snapshot: snapshotFor(room, participant) });
  broadcastPresence(room);
  console.log(`[ws] room=${room.id} ${existing ? 'rejoined' : 'joined'} role=${role} id=${participantId.slice(0, 8)}`);

  let alive = true;
  socket.on('pong', () => (alive = true));
  const heartbeat = setInterval(() => {
    if (!alive) return socket.terminate();
    alive = false;
    socket.ping();
  }, 25_000);

  socket.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(socket, { t: 'error', code: 'bad_request', message: 'Invalid message' });
    }
    participant.lastSeen = Date.now();
    const live = getRoom(room.id);
    if (!live) return send(socket, { t: 'ended', reason: 'expired' });

    switch (msg.t) {
      case 'ping':
        return send(socket, { t: 'pong' });

      case 'audio':
      case 'text': {
        // The server decides who is speaking from the role, never from the client label.
        if (room.type !== 'conversation' || role === 'listener') return;
        if (msg.t === 'audio' && validAudio(msg.audio)) return void handleTurn(provider, room, participant, { audio: msg.audio });
        if (msg.t === 'text' && typeof msg.text === 'string' && msg.text.trim()) {
          return void handleTurn(provider, room, participant, { text: msg.text.trim().slice(0, 1000) });
        }
        return send(socket, { t: 'error', code: 'bad_request', message: 'Empty or invalid input' });
      }

      case 'mic':
        if (room.type === 'conversation' && role !== 'listener') handleMic(room, participant, !!msg.active);
        return;

      case 'played':
        if (room.type === 'conversation') handlePlayed(room, participant);
        return;

      case 'set_context':
        if (room.type === 'conversation' && role === 'host') setContext(room, msg.context);
        return;

      case 'auth':
        // Access tokens expire; the host app sends fresh ones so memory keeps working.
        if (room.type === 'conversation' && role === 'host' && typeof msg.accessToken === 'string' && room.conversation.memoryToken) {
          room.conversation.memoryToken = msg.accessToken.slice(0, 4096);
        }
        return;

      case 'chunk':
        if (room.type !== 'broadcast' || role !== 'host' || !validAudio(msg.audio)) return;
        return void handleChunk(provider, room, participant, msg.seq, msg.audio);

      case 'question':
        if (room.type !== 'broadcast' || role !== 'listener' || typeof msg.text !== 'string') return;
        return void handleQuestion(provider, room, participant, msg.text);

      case 'set_language':
        if (role !== 'listener' || !isLanguage(msg.language)) return;
        participant.language = cleanLanguage(msg.language);
        send(socket, { t: 'welcome', room: roomInfo(room), you: { id: participantId, role }, snapshot: snapshotFor(room, participant) });
        return broadcastPresence(room);

      case 'end':
        if (role === 'host') endRoom(room, 'host_ended');
        return;
    }
  });

  socket.on('close', () => {
    clearInterval(heartbeat);
    if (participant.socket === socket) {
      participant.socket = null;
      if (getRoom(room.id)) broadcastPresence(room);
    }
  });
});

startExpirySweep();
server.listen(config.port, '0.0.0.0', () => {
  console.log(`[server] Hao rooms on http://0.0.0.0:${config.port}  ·  join links use ${config.publicBaseUrl}  ·  AI: ${provider.name}`);
});
