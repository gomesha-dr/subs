'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  setCurrentPlayerId,
  getCurrentPlayerId,
  clearCurrentPlayer,
} from '@/lib/session';
import {
  createPlayer,
  getPlayerByName,
  updatePlayer,
} from '@/lib/players';
import { POSITIONS, type Position } from '@/lib/types';

export type ActionResult = { error: string } | { ok: true };

function parsePosition(v: FormDataEntryValue | null): Position | null {
  if (typeof v !== 'string') return null;
  return (POSITIONS as readonly string[]).includes(v) ? (v as Position) : null;
}

function parseInt1To120(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 120) return null;
  return n;
}

function parseSkill(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 10) return null;
  return n;
}

export async function identifyByName(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Type your name first.' };
  const player = await getPlayerByName(name);
  if (!player) {
    return { error: `No player named "${name}" yet. Use "I'm new" to create a profile.` };
  }
  await setCurrentPlayerId(player.id);
  redirect('/');
}

export async function createMyProfile(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  const primary = parsePosition(formData.get('primary_position'));
  const secondaryRaw = formData.get('secondary_position');
  const secondary =
    typeof secondaryRaw === 'string' && secondaryRaw !== '' ? parsePosition(secondaryRaw) : null;
  const block = parseInt1To120(formData.get('max_block_minutes'));
  const total = parseInt1To120(formData.get('max_total_minutes'));
  const skill = parseSkill(formData.get('skill_score'));
  const isGk = formData.get('is_goalkeeper') === 'on';

  if (!name) return { error: 'Name is required.' };
  if (!primary) return { error: 'Pick a primary position.' };
  if (secondary === null && typeof secondaryRaw === 'string' && secondaryRaw !== '') {
    return { error: 'Secondary position must be attack, midfield, or defence.' };
  }
  if (secondary && secondary === primary) return { error: 'Secondary must differ from primary.' };
  if (block === null) return { error: 'Block minutes must be a whole number 1–120.' };
  if (total === null) return { error: 'Total minutes must be a whole number 1–120.' };
  if (total < block) return { error: 'Total minutes must be ≥ block minutes.' };
  if (skill === null) return { error: 'Skill score must be a whole number 1–10.' };

  try {
    const player = await createPlayer({
      name,
      primary_position: primary,
      secondary_position: secondary,
      max_block_minutes: block,
      max_total_minutes: total,
      skill_score: skill,
      is_goalkeeper: isGk,
    });
    await setCurrentPlayerId(player.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not create profile.';
    if (msg.includes('players_name_lower_idx')) {
      return { error: `A player named "${name}" already exists. Use "I'm an existing player" instead.` };
    }
    return { error: msg };
  }
  revalidatePath('/');
  redirect('/');
}

export async function updateMyProfile(formData: FormData): Promise<ActionResult> {
  const id = await getCurrentPlayerId();
  if (!id) redirect('/');

  const primary = parsePosition(formData.get('primary_position'));
  const secondaryRaw = formData.get('secondary_position');
  const secondary =
    typeof secondaryRaw === 'string' && secondaryRaw !== '' ? parsePosition(secondaryRaw) : null;
  const block = parseInt1To120(formData.get('max_block_minutes'));
  const total = parseInt1To120(formData.get('max_total_minutes'));
  const skillRaw = formData.get('skill_score');
  const isGk = formData.get('is_goalkeeper') === 'on';

  if (!primary) return { error: 'Pick a primary position.' };
  if (secondary && secondary === primary) return { error: 'Secondary must differ from primary.' };
  if (block === null) return { error: 'Block minutes must be a whole number 1–120.' };
  if (total === null) return { error: 'Total minutes must be a whole number 1–120.' };
  if (total < block) return { error: 'Total minutes must be ≥ block minutes.' };

  const patch: Record<string, unknown> = {
    primary_position: primary,
    secondary_position: secondary,
    max_block_minutes: block,
    max_total_minutes: total,
    is_goalkeeper: isGk,
  };

  if (typeof skillRaw === 'string' && skillRaw.trim() !== '') {
    const skill = parseSkill(skillRaw);
    if (skill === null) return { error: 'Skill score must be a whole number 1–10.' };
    patch.skill_score = skill;
  }

  await updatePlayer(id!, patch);
  revalidatePath('/');
  redirect('/');
}

export async function signOut(): Promise<void> {
  await clearCurrentPlayer();
  redirect('/');
}
