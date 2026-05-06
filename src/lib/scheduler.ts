import type { Position } from './types';

export type Formation = { def: number; mid: number; att: number };

export const POSITIONS_IN_ORDER: Position[] = ['defence', 'midfield', 'attack'];

export function parseFormation(str: string): Formation | null {
  const match = /^(\d+)-(\d+)-(\d+)$/.exec(str);
  if (!match) return null;
  const [, d, m, a] = match;
  return { def: Number(d), mid: Number(m), att: Number(a) };
}

export function formatFormation(f: Formation): string {
  return `${f.def}-${f.mid}-${f.att}`;
}

export function totalOutfieldSeats(f: Formation): number {
  return f.def + f.mid + f.att;
}

export type PlayerForScheduling = {
  id: string;
  name: string;
  pref_1_position: Position;
  pref_2_position: Position;
  pref_3_position: Position;
  max_block_minutes: number;
  max_total_minutes: number;
  skill_score: number;
};

function positionRankFor(p: PlayerForScheduling, pos: Position): 1 | 2 | 3 {
  if (p.pref_1_position === pos) return 1;
  if (p.pref_2_position === pos) return 2;
  return 3;
}

export type SchedulerInput = {
  match_duration_minutes: number;
  slot_minutes: number;
  formation: Formation;
  goalkeeper_id: string | null;
  attending_players: PlayerForScheduling[];
};

export type ScheduleBlock = {
  player_id: string;
  position: Position;
  start_slot: number;
  end_slot: number;
};

export type Schedule = {
  slot_minutes: number;
  total_slots: number;
  formation: Formation;
  goalkeeper_id: string | null;
  blocks: ScheduleBlock[];
  unfilled_slots: Array<{ slot: number; position: Position; missing: number }>;
  player_summaries: Array<{
    player_id: string;
    total_slots: number;
    longest_block_slots: number;
    block_count: number;
  }>;
  generated_at: string;
};

export type SchedulerError =
  | { kind: 'not_enough_players'; required: number; got: number }
  | { kind: 'invalid_formation'; details: string }
  | { kind: 'invalid_input'; details: string };

const POSITIONS_TUPLE: Array<readonly [Position, keyof Formation]> = [
  ['defence', 'def'],
  ['midfield', 'mid'],
  ['attack', 'att'],
];

export function generateSchedule(input: SchedulerInput): Schedule | SchedulerError {
  const seats = totalOutfieldSeats(input.formation);
  if (seats < 1) {
    return { kind: 'invalid_formation', details: `Formation must total at least 1 outfield seat (got ${seats}).` };
  }
  if (input.match_duration_minutes <= 0 || input.slot_minutes <= 0) {
    return { kind: 'invalid_input', details: 'Match duration and slot minutes must be positive.' };
  }
  if (input.match_duration_minutes % input.slot_minutes !== 0) {
    return {
      kind: 'invalid_input',
      details: `Match duration (${input.match_duration_minutes}) must divide evenly by slot length (${input.slot_minutes}).`,
    };
  }

  const N = input.match_duration_minutes / input.slot_minutes;

  const outfield = input.attending_players.filter((p) => p.id !== input.goalkeeper_id);
  if (outfield.length < seats) {
    return { kind: 'not_enough_players', required: seats, got: outfield.length };
  }

  // Step 1: Compute fair-share minutes budgets, capped by each player's max_total_minutes.
  // After capping, distribute any leftover slot-minutes to players with headroom so the
  // total budget exactly equals the seat-minutes needed (no late-game gaps from rounding).
  const budgets = computeBudgets(outfield, N * seats * input.slot_minutes, input.slot_minutes);

  // Step 2: Greedy per-slot assignment with continuity preference.
  // `rest_until_slot` enforces at least one slot off after a max_block-induced block end,
  // so contiguous on-pitch time (regardless of position changes) cannot exceed max_block.
  type PlayerState = {
    minutes_used: number;
    current_block_start: number | null;
    current_position: Position | null;
    current_block_minutes: number;
    rest_until_slot: number;
  };
  const state = new Map<string, PlayerState>();
  for (const p of outfield) {
    state.set(p.id, {
      minutes_used: 0,
      current_block_start: null,
      current_position: null,
      current_block_minutes: 0,
      rest_until_slot: 0,
    });
  }

  type SlotAssignment = { player_id: string; position: Position; slot: number };
  const assignments: SlotAssignment[] = [];

  for (let slot = 0; slot < N; slot++) {
    const remainingByPosition: Record<Position, number> = {
      defence: input.formation.def,
      midfield: input.formation.mid,
      attack: input.formation.att,
    };

    const placedThisSlot = new Set<string>();

    // Pass A: continuity — keep players currently on if they can stay.
    for (const p of outfield) {
      const s = state.get(p.id)!;
      if (s.current_block_start === null || s.current_position === null) continue;
      const wouldBeMinutesUsed = s.minutes_used + input.slot_minutes;
      const wouldBeBlockMinutes = s.current_block_minutes + input.slot_minutes;
      const stillHasBudget = wouldBeMinutesUsed <= (budgets.get(p.id) ?? 0);
      const stillUnderBlockCap = wouldBeBlockMinutes <= p.max_block_minutes;
      const positionStillNeeded = remainingByPosition[s.current_position] > 0;
      if (stillHasBudget && stillUnderBlockCap && positionStillNeeded) {
        assignments.push({ player_id: p.id, position: s.current_position, slot });
        s.minutes_used = wouldBeMinutesUsed;
        s.current_block_minutes = wouldBeBlockMinutes;
        // current_block_start, current_position unchanged
        remainingByPosition[s.current_position]--;
        placedThisSlot.add(p.id);
      } else {
        // End this player's current block. They were on the pitch through the previous
        // slot, so they must sit out at least the current slot (no Pass-B rescue).
        s.current_block_start = null;
        s.current_position = null;
        s.current_block_minutes = 0;
        s.rest_until_slot = slot + 1;
      }
    }

    // Pass B: fill remaining seats with new players.
    for (const [pos] of POSITIONS_TUPLE) {
      while (remainingByPosition[pos] > 0) {
        const chosen = pickFreshPlayer(outfield, pos, placedThisSlot, state, budgets, input.slot_minutes, slot);
        if (!chosen) break; // no eligible player; slot stays under-filled
        assignments.push({ player_id: chosen.id, position: pos, slot });
        const s = state.get(chosen.id)!;
        s.minutes_used += input.slot_minutes;
        s.current_block_start = slot;
        s.current_position = pos;
        s.current_block_minutes = input.slot_minutes;
        remainingByPosition[pos]--;
        placedThisSlot.add(chosen.id);
      }
    }
  }

  // Step 3: Compress per-slot assignments into contiguous blocks per (player, position).
  const blocks = compressToBlocks(assignments);

  // Step 4: Compute unfilled-slot report and per-player summaries.
  const unfilled = computeUnfilledSlots(assignments, N, input.formation);
  const summaries = computeSummaries(blocks, outfield);

  return {
    slot_minutes: input.slot_minutes,
    total_slots: N,
    formation: input.formation,
    goalkeeper_id: input.goalkeeper_id,
    blocks,
    unfilled_slots: unfilled,
    player_summaries: summaries,
    generated_at: new Date().toISOString(),
  };
}

function computeBudgets(
  players: PlayerForScheduling[],
  totalSeatMinutes: number,
  slotMinutes: number,
): Map<string, number> {
  // Goal: every player gets a budget of roughly their max_block (one solid stint),
  // and any leftover seat-minutes are distributed to players who CAN absorb more
  // (max_total - current_budget headroom). max_total is treated as a hard ceiling,
  // never a target — players who could play more but don't need to, just don't.
  const totalSlotsNeeded = Math.floor(totalSeatMinutes / slotMinutes);
  const maxBlockSlots = new Map<string, number>(
    players.map((p) => [p.id, Math.floor(p.max_block_minutes / slotMinutes)]),
  );
  const maxTotalSlots = new Map<string, number>(
    players.map((p) => [p.id, Math.floor(p.max_total_minutes / slotMinutes)]),
  );
  const budgetSlots = new Map<string, number>(players.map((p) => [p.id, 0]));

  // Initial pass: each player gets max_block_minutes (one stint), capped by max_total.
  let allocated = 0;
  for (const p of players) {
    const got = Math.min(maxBlockSlots.get(p.id)!, maxTotalSlots.get(p.id)!);
    budgetSlots.set(p.id, got);
    allocated += got;
  }

  // If sum of max_blocks exceeds available seats (rare — only when most players
  // have very high max_blocks), trim from the largest budgets one slot at a time.
  while (allocated > totalSlotsNeeded) {
    let bestId: string | null = null;
    let bestSlots = 0;
    for (const p of players) {
      const cur = budgetSlots.get(p.id)!;
      if (cur > bestSlots) {
        bestSlots = cur;
        bestId = p.id;
      }
    }
    if (!bestId || bestSlots <= 1) break;
    budgetSlots.set(bestId, bestSlots - 1);
    allocated--;
  }

  // Distribute any leftover seat-minutes to players with the most headroom under
  // max_total. High-stamina players naturally absorb more; low-stamina ones stay
  // at their max_block.
  let remaining = totalSlotsNeeded - allocated;
  while (remaining > 0) {
    let best: string | null = null;
    let bestHeadroom = 0;
    for (const p of players) {
      const headroom = maxTotalSlots.get(p.id)! - budgetSlots.get(p.id)!;
      if (headroom > bestHeadroom) {
        bestHeadroom = headroom;
        best = p.id;
      }
    }
    if (!best) break;
    budgetSlots.set(best, budgetSlots.get(best)! + 1);
    remaining--;
  }

  const budgets = new Map<string, number>();
  for (const [id, slots] of budgetSlots) {
    budgets.set(id, slots * slotMinutes);
  }
  return budgets;
}

function pickFreshPlayer(
  outfield: PlayerForScheduling[],
  pos: Position,
  alreadyPlaced: Set<string>,
  state: Map<string, { minutes_used: number; current_block_start: number | null; rest_until_slot: number }>,
  budgets: Map<string, number>,
  slotMinutes: number,
  currentSlot: number,
): PlayerForScheduling | null {
  const eligible = outfield.filter((p) => {
    if (alreadyPlaced.has(p.id)) return false;
    const s = state.get(p.id)!;
    if (s.current_block_start !== null) return false; // already in an open block elsewhere — shouldn't happen
    if (s.rest_until_slot > currentSlot) return false; // mandatory rest after max-block end
    if (s.minutes_used + slotMinutes > (budgets.get(p.id) ?? 0)) return false;
    return true; // any of the three preferences is acceptable; rank-3 just costs more
  });
  if (eligible.length === 0) return null;
  // Sort: lower rank first (rank-1 candidates beat rank-2 beat rank-3), then most remaining budget,
  // then longest max-block so high-stamina players take longer stretches.
  eligible.sort((a, b) => {
    const aRank = positionRankFor(a, pos);
    const bRank = positionRankFor(b, pos);
    if (aRank !== bRank) return aRank - bRank;
    const aRemaining = (budgets.get(a.id) ?? 0) - (state.get(a.id)?.minutes_used ?? 0);
    const bRemaining = (budgets.get(b.id) ?? 0) - (state.get(b.id)?.minutes_used ?? 0);
    if (aRemaining !== bRemaining) return bRemaining - aRemaining;
    return b.max_block_minutes - a.max_block_minutes;
  });
  return eligible[0];
}

function compressToBlocks(
  assignments: Array<{ player_id: string; position: Position; slot: number }>,
): ScheduleBlock[] {
  const grouped = new Map<string, Array<{ player_id: string; position: Position; slot: number }>>();
  for (const a of assignments) {
    const key = `${a.player_id}::${a.position}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(a);
  }
  const out: ScheduleBlock[] = [];
  for (const list of grouped.values()) {
    list.sort((a, b) => a.slot - b.slot);
    let start = list[0].slot;
    let end = list[0].slot + 1;
    for (let i = 1; i < list.length; i++) {
      if (list[i].slot === end) {
        end++;
      } else {
        out.push({ player_id: list[0].player_id, position: list[0].position, start_slot: start, end_slot: end });
        start = list[i].slot;
        end = list[i].slot + 1;
      }
    }
    out.push({ player_id: list[0].player_id, position: list[0].position, start_slot: start, end_slot: end });
  }
  out.sort((a, b) => a.start_slot - b.start_slot || a.player_id.localeCompare(b.player_id));
  return out;
}

export function computeUnfilledSlots(
  assignments: Array<{ position: Position; slot: number }>,
  totalSlots: number,
  formation: Formation,
): Array<{ slot: number; position: Position; missing: number }> {
  const counts = new Map<number, Record<Position, number>>();
  for (const a of assignments) {
    if (!counts.has(a.slot)) {
      counts.set(a.slot, { defence: 0, midfield: 0, attack: 0 });
    }
    counts.get(a.slot)![a.position]++;
  }
  const out: Array<{ slot: number; position: Position; missing: number }> = [];
  for (let s = 0; s < totalSlots; s++) {
    const c = counts.get(s) ?? { defence: 0, midfield: 0, attack: 0 };
    for (const [pos, key] of POSITIONS_TUPLE) {
      const needed = formation[key];
      if (c[pos] < needed) {
        out.push({ slot: s, position: pos, missing: needed - c[pos] });
      }
    }
  }
  return out;
}

export function computeSummaries(
  blocks: ScheduleBlock[],
  outfield: PlayerForScheduling[],
): Schedule['player_summaries'] {
  const by_player = new Map<string, ScheduleBlock[]>();
  for (const p of outfield) by_player.set(p.id, []);
  for (const b of blocks) {
    if (!by_player.has(b.player_id)) by_player.set(b.player_id, []);
    by_player.get(b.player_id)!.push(b);
  }
  return outfield.map((p) => {
    const list = by_player.get(p.id) ?? [];
    const total_slots = list.reduce((sum, b) => sum + (b.end_slot - b.start_slot), 0);
    const longest = list.reduce((max, b) => Math.max(max, b.end_slot - b.start_slot), 0);
    return {
      player_id: p.id,
      total_slots,
      longest_block_slots: longest,
      block_count: list.length,
    };
  });
}
