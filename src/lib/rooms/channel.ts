import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { RoomType } from '@shared/rooms/protocol';
import { channelName, EVENTS, type GuestEnvelope, type HostEnvelope, type PresenceMeta } from '@shared/rooms/realtime';

import { supabase } from '@/lib/supabase';

/**
 * The host side of a room: one Supabase Realtime channel with broadcast (messages) and presence
 * (who is here, and in which language). Supabase handles reconnects.
 */
export function useHostChannel(code: string | null, type: RoomType, onGuest: (env: GuestEnvelope) => void, name?: string) {
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState<PresenceMeta[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onGuestRef = useRef(onGuest);

  useEffect(() => {
    onGuestRef.current = onGuest;
  }, [onGuest]);

  useEffect(() => {
    if (!code) return;
    const channel = supabase.channel(channelName(code), {
      config: { broadcast: { self: false, ack: false }, presence: { key: 'host' } },
    });
    channelRef.current = channel;
    channel
      .on('broadcast', { event: EVENTS.fromGuest }, ({ payload }) => onGuestRef.current(payload as GuestEnvelope))
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceMeta>();
        setPresence(Object.values(state).flat());
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // The room type lets a guest who typed the code open the right page.
          // The guest page shows who they're talking with.
          await channel.track({ pid: 'host', role: 'host', type, name: name || undefined, at: Date.now() } satisfies PresenceMeta);
          setConnected(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnected(false);
        }
      });
    return () => {
      channelRef.current = null;
      setConnected(false);
      supabase.removeChannel(channel);
    };
  }, [code, type, name]);

  const send = useCallback((env: HostEnvelope) => {
    channelRef.current?.send({ type: 'broadcast', event: EVENTS.toGuests, payload: env });
  }, []);

  return { connected, presence, send };
}
