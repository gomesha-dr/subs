import { supabase } from './supabase';
import type { Match, MatchAttendance, PublicMatchAttendance } from './types';

export async function listUpcomingMatches(): Promise<Match[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .gte('match_date', today)
    .order('match_date', { ascending: true })
    .order('match_time', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Match[];
}

export async function listPastMatches(): Promise<Match[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .lt('match_date', today)
    .order('match_date', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as Match[];
}

export async function getMatchById(id: string): Promise<Match | null> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export type CreateMatchInput = Omit<Match, 'id' | 'created_at' | 'updated_at'>;

export async function createMatch(input: CreateMatchInput): Promise<Match> {
  const { data, error } = await supabase
    .from('matches')
    .insert(input)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateMatch(id: string, patch: Partial<CreateMatchInput>): Promise<Match> {
  const { data, error } = await supabase
    .from('matches')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteMatch(id: string): Promise<void> {
  const { error } = await supabase.from('matches').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

const PUBLIC_ATTENDANCE_COLUMNS =
  'match_id, player_id, is_attending, override_primary_position, override_secondary_position, override_max_block_minutes, override_max_total_minutes, created_at, updated_at';

export async function listPublicAttendances(matchId: string): Promise<PublicMatchAttendance[]> {
  const { data, error } = await supabase
    .from('match_attendances')
    .select(PUBLIC_ATTENDANCE_COLUMNS)
    .eq('match_id', matchId);
  if (error) throw new Error(error.message);
  return (data ?? []) as PublicMatchAttendance[];
}

export async function getMyAttendance(
  matchId: string,
  playerId: string,
): Promise<MatchAttendance | null> {
  const { data, error } = await supabase
    .from('match_attendances')
    .select('*')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertAttendance(
  matchId: string,
  playerId: string,
  patch: Partial<Omit<MatchAttendance, 'match_id' | 'player_id' | 'created_at' | 'updated_at'>>,
): Promise<MatchAttendance> {
  const { data, error } = await supabase
    .from('match_attendances')
    .upsert({ match_id: matchId, player_id: playerId, ...patch }, {
      onConflict: 'match_id,player_id',
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}
