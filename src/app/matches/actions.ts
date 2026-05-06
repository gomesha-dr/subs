'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentPlayerId } from '@/lib/session';
import {
  createMatch,
  deleteMatch,
  getMatchById,
  getMyAttendance,
  listPublicAttendances,
  upsertAttendance,
  updateMatch,
} from '@/lib/matches';
import { supabaseServer } from '@/lib/supabase';
import {
  generateSchedule,
  parseFormation,
  totalOutfieldSeats,
  type PlayerForScheduling,
  type Schedule,
} from '@/lib/scheduler';
import type { Player } from '@/lib/types';

export type ActionResult = { error: string } | { ok: true };

function parseDateString(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function parseTimeString(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string' || v === '') return null;
  return /^\d{2}:\d{2}(:\d{2})?$/.test(v) ? v : null;
}

function parseInt1To240(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 240) return null;
  return n;
}

export async function createMatchAction(formData: FormData): Promise<ActionResult> {
  const date = parseDateString(formData.get('match_date'));
  const time = parseTimeString(formData.get('match_time'));
  const duration = parseInt1To240(formData.get('duration_minutes'));
  const half = parseInt1To240(formData.get('half_length_minutes'));
  const goalkeeperRaw = formData.get('goalkeeper_id');
  const goalkeeperId =
    typeof goalkeeperRaw === 'string' && goalkeeperRaw !== '' ? goalkeeperRaw : null;
  const notesRaw = formData.get('notes');
  const notes = typeof notesRaw === 'string' && notesRaw.trim() !== '' ? notesRaw.trim() : null;

  if (!date) return { error: 'Pick a valid date.' };
  if (duration === null) return { error: 'Duration must be 1–240 minutes.' };
  if (half === null) return { error: 'Half length must be 1–240 minutes.' };
  if (half > duration) return { error: 'Half length cannot exceed total duration.' };

  let id: string;
  try {
    const match = await createMatch({
      match_date: date,
      match_time: time,
      duration_minutes: duration,
      half_length_minutes: half,
      goalkeeper_id: goalkeeperId,
      notes,
    });
    id = match.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not create match.' };
  }

  revalidatePath('/matches');
  redirect(`/matches/${id}`);
}

export async function toggleMyAttendance(matchId: string): Promise<void> {
  const playerId = await getCurrentPlayerId();
  if (!playerId) return;
  const current = await getMyAttendance(matchId, playerId);
  const newState = !current?.is_attending;
  await upsertAttendance(matchId, playerId, { is_attending: newState });
  revalidatePath(`/matches/${matchId}`);
}

export async function setMatchGoalkeeperFromForm(
  matchId: string,
  formData: FormData,
): Promise<void> {
  const raw = formData.get('goalkeeper_id');
  const goalkeeper_id = typeof raw === 'string' && raw !== '' ? raw : null;
  await updateMatch(matchId, { goalkeeper_id });
  revalidatePath(`/matches/${matchId}`);
}

export async function deleteMatchAction(matchId: string): Promise<void> {
  await deleteMatch(matchId);
  revalidatePath('/matches');
  redirect('/matches');
}

export async function setMatchFormationFromForm(
  matchId: string,
  formData: FormData,
): Promise<void> {
  const raw = formData.get('formation');
  if (typeof raw !== 'string') return;
  const trimmed = raw.trim();
  if (trimmed === '') {
    await updateMatch(matchId, { formation: null });
  } else {
    const parsed = parseFormation(trimmed);
    if (!parsed) return; // silently ignore invalid; UI prevents this
    if (totalOutfieldSeats(parsed) !== 6) return;
    await updateMatch(matchId, { formation: trimmed });
  }
  revalidatePath(`/matches/${matchId}`);
}

export async function generateScheduleAction(matchId: string): Promise<ActionResult> {
  const match = await getMatchById(matchId);
  if (!match) return { error: 'Match not found.' };
  if (!match.formation) return { error: 'Pick a formation first.' };
  const formation = parseFormation(match.formation);
  if (!formation) return { error: 'Formation is invalid.' };
  if (totalOutfieldSeats(formation) !== 6) {
    return { error: 'Formation must total 6 outfield players.' };
  }

  const attendances = await listPublicAttendances(matchId);
  const attendingIds = attendances.filter((a) => a.is_attending).map((a) => a.player_id);

  if (attendingIds.length === 0) {
    return { error: 'Nobody has marked themselves as coming yet.' };
  }

  // Fetch full player rows (including skill_score) for scheduling.
  const { data: rawPlayers, error } = await supabaseServer()
    .from('players')
    .select('*')
    .in('id', attendingIds);
  if (error) return { error: error.message };

  const allAttendingPlayers = (rawPlayers ?? []) as Player[];
  const players: PlayerForScheduling[] = allAttendingPlayers.map((p) => ({
    id: p.id,
    name: p.name,
    pref_1_position: p.pref_1_position,
    pref_2_position: p.pref_2_position,
    pref_3_position: p.pref_3_position,
    max_block_minutes: p.max_block_minutes,
    max_total_minutes: p.max_total_minutes,
    skill_score: p.skill_score,
  }));

  const result = generateSchedule({
    match_duration_minutes: match.duration_minutes,
    slot_minutes: 5,
    formation,
    goalkeeper_id: match.goalkeeper_id,
    attending_players: players,
  });

  if ('kind' in result) {
    if (result.kind === 'not_enough_players') {
      return { error: `Need at least ${result.required} outfield players, but only ${result.got} are coming.` };
    }
    if (result.kind === 'invalid_formation') {
      return { error: result.details };
    }
    return { error: result.details };
  }

  await updateMatch(matchId, { generated_schedule: result as Schedule });
  revalidatePath(`/matches/${matchId}`);
  return { ok: true };
}

export async function clearScheduleAction(matchId: string): Promise<void> {
  await updateMatch(matchId, { generated_schedule: null });
  revalidatePath(`/matches/${matchId}`);
}

export async function saveScheduleEditsAction(
  matchId: string,
  blocks: Array<{
    player_id: string;
    position: string;
    start_slot: number;
    end_slot: number;
  }>,
): Promise<ActionResult> {
  const match = await getMatchById(matchId);
  if (!match) return { error: 'Match not found.' };
  const totalSlots = match.duration_minutes / 5;

  // Structural validation only — captain knows best, so we don't enforce stamina caps.
  for (const b of blocks) {
    if (!['attack', 'midfield', 'defence'].includes(b.position)) {
      return { error: `Invalid position: ${b.position}` };
    }
    if (!Number.isInteger(b.start_slot) || b.start_slot < 0 || b.start_slot >= totalSlots) {
      return { error: `Invalid start at slot ${b.start_slot}` };
    }
    if (!Number.isInteger(b.end_slot) || b.end_slot <= b.start_slot || b.end_slot > totalSlots) {
      return { error: `Invalid end at slot ${b.end_slot} (start ${b.start_slot})` };
    }
  }

  // Detect same-player overlaps (one player can't be on the pitch in two places at once).
  const byPlayer = new Map<string, Array<{ start: number; end: number }>>();
  for (const b of blocks) {
    if (!byPlayer.has(b.player_id)) byPlayer.set(b.player_id, []);
    byPlayer.get(b.player_id)!.push({ start: b.start_slot, end: b.end_slot });
  }
  for (const [playerId, intervals] of byPlayer) {
    intervals.sort((a, b) => a.start - b.start);
    for (let i = 1; i < intervals.length; i++) {
      if (intervals[i].start < intervals[i - 1].end) {
        return { error: `Player has overlapping blocks (player ${playerId.slice(0, 8)}…).` };
      }
    }
  }

  const existing = (match.generated_schedule ?? {}) as Record<string, unknown>;
  const newSchedule = {
    ...existing,
    blocks,
    edited_at: new Date().toISOString(),
  };

  await updateMatch(matchId, { generated_schedule: newSchedule });
  revalidatePath(`/matches/${matchId}`);
  return { ok: true };
}
