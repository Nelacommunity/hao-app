import { createClient } from '@supabase/supabase-js';

import { config } from './config';

const supabase =
  config.supabaseUrl && config.supabaseKey
    ? createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

if (!supabase) {
  console.warn('[auth] SUPABASE_URL/SUPABASE_KEY not set: anyone on the network can create rooms (dev only).');
}

/** Returns the host's user id, or null when the request isn't from a signed-in Hao user. */
export async function authenticateHost(authorization: string | undefined): Promise<string | null> {
  if (!supabase) return 'dev-host';
  const token = authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}
