// Public values the static guest page (public/join.html) needs to join a Supabase Realtime room.
// Both are already shipped in the app bundle (EXPO_PUBLIC_*); access is protected by unguessable room codes.
export function GET() {
  return Response.json(
    { supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '', supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '' },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
