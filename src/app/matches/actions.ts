'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentPlayerId } from '@/lib/session';
import {
  createMatch,
  deleteMatch,
  getMyAttendance,
  upsertAttendance,
  updateMatch,
} from '@/lib/matches';

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
