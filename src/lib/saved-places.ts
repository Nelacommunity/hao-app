import { supabase } from '@/lib/supabase';

export async function fetchSavedPlaceIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('saved_places')
    .select('place_id')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((row) => row.place_id);
}

export async function isPlaceSaved(placeId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('saved_places')
    .select('place_id', { count: 'exact', head: true })
    .eq('place_id', placeId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function setPlaceSaved(placeId: string, saved: boolean) {
  const { error } = saved
    ? await supabase.from('saved_places').insert({ place_id: placeId })
    : await supabase.from('saved_places').delete().eq('place_id', placeId);
  if (error) throw error;
}
