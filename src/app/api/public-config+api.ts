// Public values the static guest page (public/join.html) needs to join a Supabase Realtime room.
// Both are already shipped in the app bundle (EXPO_PUBLIC_*); access is protected by unguessable room codes.
import { allowIp, tooMany } from '@/lib/server/rate-limit';

export async function GET(request: Request) {
  if (!(await allowIp(request, 'public-config', 30))) return tooMany();
  return Response.json(
    { supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '', supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '' },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
