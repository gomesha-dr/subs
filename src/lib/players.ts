import { supabaseServer } from './supabase';
import type { Player, PublicPlayer } from './types';

const PUBLIC_COLUMNS =
  'id, name, pref_1_position, pref_2_position, pref_3_position, max_block_minutes, max_total_minutes, is_goalkeeper, created_at, updated_at';

export async function listAllNames(): Promise<string[]> {
  const { data, error } = await supabaseServer()
    .from('players')
    .select('name')
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.name);
}

export async function listPublicPlayers(): Promise<PublicPlayer[]> {
  const { data, error } = await supabaseServer()
    .from('players')
    .select(PUBLIC_COLUMNS)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as PublicPlayer[];
}

export async function getPlayerById(id: string): Promise<Player | null> {
  const { data, error } = await supabaseServer()
    .from('players')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getPlayerByName(name: string): Promise<Player | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data, error } = await supabaseServer()
    .from('players')
    .select('*')
    .ilike('name', trimmed)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export type CreatePlayerInput = Omit<Player, 'id' | 'created_at' | 'updated_at'>;

export async function createPlayer(input: CreatePlayerInput): Promise<Player> {
  const { data, error } = await supabaseServer()
    .from('players')
    .insert({ ...input, name: input.name.trim() })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export type UpdatePlayerInput = Partial<Omit<Player, 'id' | 'created_at' | 'updated_at'>>;

export async function updatePlayer(id: string, input: UpdatePlayerInput): Promise<Player> {
  const patch = { ...input };
  if (typeof patch.name === 'string') patch.name = patch.name.trim();
  const { data, error } = await supabaseServer()
    .from('players')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}
