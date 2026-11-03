import { randomUUID } from 'expo-crypto';
import { useEffect, useRef } from 'react';

import type { ChatMode } from '@/components/chat-composer';
import type { Json } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

// Saved chats, like Claude's chat history. Each mode has one open chat whose content is kept on the
// device (so it reopens instantly, even offline) and synced to Supabase, where the history list lives.

/** 'room': a QR-room conversation the user chose to save (read-only, opened at /room/saved). */
export type ChatSummary = { id: string; mode: ChatMode | 'room'; title: string; updatedAt: string };
export type OpenChat<T> = { id: string; title: string; data: T };

const CURRENT_KEY = (mode: ChatMode) => `hao:chat:current:${mode}:v1`;
const SAVE_DELAY_MS = 1200;
// Deleted this session, so a save still waiting can't bring them back.
const deleted = new Set<string>();

export const newChatId = () => randomUUID();

/** A short title from the first thing the user said. */
export function chatTitle(firstMessage: string | undefined) {
  const text = (firstMessage ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text;
}

/** The chat that was open in `mode` last time, from the device. */
export function openChat<T>(mode: ChatMode, empty: T): OpenChat<T> {
  try {
    const raw = globalThis.localStorage?.getItem(CURRENT_KEY(mode));
    if (raw) {
      const chat = JSON.parse(raw) as OpenChat<T>;
      return { ...chat, data: { ...empty, ...chat.data } };
    }
  } catch {
    // Unreadable: start a new chat.
  }
  return { id: newChatId(), title: '', data: empty };
}

function rememberOpen<T>(mode: ChatMode, chat: OpenChat<T>) {
  try {
    globalThis.localStorage?.setItem(CURRENT_KEY(mode), JSON.stringify(chat));
  } catch {
    // Storage full or unavailable: the cloud copy still works.
  }
}

async function saveRemote(mode: ChatMode, chat: OpenChat<unknown>) {
  if (deleted.has(chat.id)) return;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return;
  const row = { mode, title: chat.title, data: chat.data as Json };
  const { data, error } = await supabase.from('chats').update(row).eq('id', chat.id).select('id');
  if (error) throw error;
  if (!data?.length) {
    const { error: insertError } = await supabase.from('chats').insert({ id: chat.id, ...row });
    if (insertError) throw insertError;
  }
}

/**
 * Keeps the open chat saved: on the device right away, in the cloud a moment after the last change
 * (and right away when the chat closes). Empty chats (nothing said yet) aren't saved to the history.
 */
export function useChatAutosave<T>(mode: ChatMode, chat: OpenChat<T>, hasContent: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<OpenChat<T> | null>(null);

  const flush = useRef(() => {
    clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (next) saveRemote(mode, next).catch((e: Error) => console.warn('Could not save chat:', e.message));
  });

  useEffect(() => {
    rememberOpen(mode, chat);
    if (!hasContent) return;
    pending.current = chat;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush.current, SAVE_DELAY_MS);
  }, [mode, chat, hasContent]);

  // Leaving the chat (new chat, another one opened) saves what's still waiting.
  useEffect(() => {
    const save = flush.current;
    return () => save();
  }, []);
}

export async function listChats(): Promise<ChatSummary[]> {
  const { data, error } = await supabase.from('chats').select('id, mode, title, updated_at').order('updated_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, mode: c.mode as ChatSummary['mode'], title: c.title, updatedAt: c.updated_at }));
}

export async function loadChat<T>(id: string): Promise<{ mode: ChatMode; chat: OpenChat<T> } | null> {
  const { data, error } = await supabase.from('chats').select('id, mode, title, data').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { mode: data.mode as ChatMode, chat: { id: data.id, title: data.title, data: data.data as T } };
}

export async function deleteChat(id: string) {
  deleted.add(id);
  const { error } = await supabase.from('chats').delete().eq('id', id);
  if (error) throw error;
}
