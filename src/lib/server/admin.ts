// Server-only Supabase client with the secret key (bypasses RLS). Used only for shared data the API
// server owns, such as UI translations. Never import this from app code.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

let client: SupabaseClient<Database> | null | undefined;

export function adminClient(): SupabaseClient<Database> | null {
  if (client !== undefined) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return client;
}
