import type { Position } from './types';

export type Formation = { def: number; mid: number; att: number };

export const POSITIONS_IN_ORDER: Position[] = ['defence', 'midfield', 'attack'];

// Module-wide: minimum length any single block should run for. Pass A extends
// blocks below this length; Pass B refuses to pick a fresh player whose
// remaining budget or remaining slots before a boundary would force a shorter
// stint than this.
const MIN_BLOCK_LENGTH = 15;

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
  half_length_minutes: number;
  slot_minutes: number;
  formation: Formation;
  goalkeeper_id: string | null;
  attending_players: PlayerForScheduling[];
  settle_in_minutes?: number | null;
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
    current_block_cap_minutes: number; // per-block max length; randomised for starters to stagger first sub-outs
    rest_until_slot: number;
  };
  const state = new Map<string, PlayerState>();
  for (const p of outfield) {
    state.set(p.id, {
      minutes_used: 0,
      current_block_start: null,
      current_position: null,
      current_block_minutes: 0,
      current_block_cap_minutes: p.max_block_minutes,
      rest_until_slot: 0,
    });
  }

  type SlotAssignment = { player_id: string; position: Position; slot: number };
  const assignments: SlotAssignment[] = [];

  // Counter for starters placed at slot 0, used to give each starter a
  // deterministically-spread first-block cap so no two starters' first sub
  // events bunch up at the same slot.
  let slot0StarterIndex = 0;

  // Halftime: a 15-min break separates the first and second half. At the slot
  // boundary, every player's block-tracking and rest-timer is cleared — they're
  // all "fresh" again for the second half (max_block resets, no carry-over rest).
  // max_total still tracks across the whole match.
  const halftimeSlot =
    input.half_length_minutes > 0 && input.half_length_minutes < input.match_duration_minutes
      ? Math.round(input.half_length_minutes / input.slot_minutes)
      : -1;

  // Capacity-aware truncation: when sum of player budgets can't cover every seat
  // for every minute of the match, stop the algorithm early so any gaps land at
  // the END of the game (where the captain can substitute by eye) instead of
  // scattered through the middle.
  const totalBudgetMinutes = Array.from(budgets.values()).reduce((s, m) => s + m, 0);
  const totalSeatMinutes = N * seats * input.slot_minutes;
  const effectiveSlots =
    totalBudgetMinutes >= totalSeatMinutes
      ? N
      : Math.floor(totalBudgetMinutes / (seats * input.slot_minutes));

  for (let slot = 0; slot < effectiveSlots; slot++) {
    if (slot === halftimeSlot) {
      for (const s of state.values()) {
        s.current_block_start = null;
        s.current_position = null;
        s.current_block_minutes = 0;
        s.rest_until_slot = 0;
      }
    }
    const remainingByPosition: Record<Position, number> = {
      defence: input.formation.def,
      midfield: input.formation.mid,
      attack: input.formation.att,
    };

    const placedThisSlot = new Set<string>();

    // Pass A: continuity — keep players currently on if they can stay.
    // Three buckets per player:
    //   - continue: meets all constraints, plays this slot
    //   - mustEnd: budget exhausted or position no longer needed (always ends)
    //   - capHitOnly: only the max_block cap is what would force the end —
    //     candidate for deferral if too many subs are happening this slot
    //
    type CapHit = { p: PlayerForScheduling; pos: Position };
    const capHitCandidates: CapHit[] = [];
    const mustEndStates: Array<{ p: PlayerForScheduling }> = [];

    for (const p of outfield) {
      const s = state.get(p.id)!;
      if (s.current_block_start === null || s.current_position === null) continue;
      const wouldBeMinutesUsed = s.minutes_used + input.slot_minutes;
      const wouldBeBlockMinutes = s.current_block_minutes + input.slot_minutes;
      const stillHasBudget = wouldBeMinutesUsed <= (budgets.get(p.id) ?? 0);
      const stillUnderBlockCap = wouldBeBlockMinutes <= s.current_block_cap_minutes;
      const positionStillNeeded = remainingByPosition[s.current_position] > 0;
      const blockBelowMin = s.current_block_minutes < MIN_BLOCK_LENGTH;
      if (
        stillHasBudget &&
        positionStillNeeded &&
        (stillUnderBlockCap || blockBelowMin)
      ) {
        // Continue. If only the cap was preventing it but the block is below
        // the minimum length, extend the cap to allow this slot.
        if (!stillUnderBlockCap) {
          s.current_block_cap_minutes = wouldBeBlockMinutes;
        }
        assignments.push({ player_id: p.id, position: s.current_position, slot });
        s.minutes_used = wouldBeMinutesUsed;
        s.current_block_minutes = wouldBeBlockMinutes;
        remainingByPosition[s.current_position]--;
        placedThisSlot.add(p.id);
      } else if (!stillHasBudget || !positionStillNeeded) {
        mustEndStates.push({ p });
      } else {
        // Cap hit, block is already at MIN_BLOCK_LENGTH or above — defer-eligible.
        capHitCandidates.push({ p, pos: s.current_position });
      }
    }

    // Sub-cap: limit total simultaneous block-ends per slot. Must-ends count
    // first; cap-hits fill the remaining slots up to the cap. Excess cap-hits
    // get their cap extended by one slot and continue this slot.
    const SUB_CAP_PER_SLOT = 3;
    const slotsForCapEnds = Math.max(0, SUB_CAP_PER_SLOT - mustEndStates.length);
    capHitCandidates.sort(
      (a, b) =>
        (state.get(b.p.id)!.current_block_minutes) -
        (state.get(a.p.id)!.current_block_minutes),
    );
    const capActuallyEnd = capHitCandidates.slice(0, slotsForCapEnds);
    const capDeferred = capHitCandidates.slice(slotsForCapEnds);

    // Apply must-ends.
    for (const { p } of mustEndStates) {
      const s = state.get(p.id)!;
      s.current_block_start = null;
      s.current_position = null;
      s.current_block_minutes = 0;
      s.rest_until_slot = slot + 2;
    }
    // Apply cap-actual-ends.
    for (const { p } of capActuallyEnd) {
      const s = state.get(p.id)!;
      s.current_block_start = null;
      s.current_position = null;
      s.current_block_minutes = 0;
      s.rest_until_slot = slot + 2;
    }
    // Apply cap-deferreds: extend their cap by one slot and continue them this slot.
    for (const { p, pos } of capDeferred) {
      const s = state.get(p.id)!;
      if (remainingByPosition[pos] <= 0) {
        // Position got filled by other continuity; have to end after all.
        s.current_block_start = null;
        s.current_position = null;
        s.current_block_minutes = 0;
        s.rest_until_slot = slot + 2;
        continue;
      }
      s.current_block_cap_minutes += input.slot_minutes;
      assignments.push({ player_id: p.id, position: pos, slot });
      s.minutes_used += input.slot_minutes;
      s.current_block_minutes += input.slot_minutes;
      remainingByPosition[pos]--;
      placedThisSlot.add(p.id);
    }

    // Pass B: fill remaining seats with new players.
    // Compute slots remaining before the next boundary (halftime or end-of-
    // effective-slots) so pickFreshPlayer can refuse picks that would result in
    // a block under MIN_BLOCK_LENGTH.
    const nextBoundary =
      halftimeSlot > slot && halftimeSlot < effectiveSlots ? halftimeSlot : effectiveSlots;
    const slotsUntilNextBoundary = nextBoundary - slot;
    for (const [pos] of POSITIONS_TUPLE) {
      while (remainingByPosition[pos] > 0) {
        const chosen = pickFreshPlayer(outfield, pos, placedThisSlot, state, budgets, input.slot_minutes, slot, slotsUntilNextBoundary);
        if (!chosen) break; // no eligible player; slot stays under-filled
        assignments.push({ player_id: chosen.id, position: pos, slot });
        const s = state.get(chosen.id)!;
        s.minutes_used += input.slot_minutes;
        s.current_block_start = slot;
        s.current_position = pos;
        s.current_block_minutes = input.slot_minutes;
        // Starters at slot 0 get DETERMINISTICALLY-SPREAD first-block caps so
        // their first sub events happen at different slots, not bunched up.
        // The Nth starter (0-indexed, across all positions) gets a cap of
        // ((N+1)/totalStarters) * their max_block, rounded to slot multiples.
        // After their first block, subsequent blocks use the player's full
        // max_block.
        //
        // Settle-in floor: if the match has a settle_in_minutes, every starter's
        // first-block cap is at least settle_in_minutes (capped by their own
        // max_block — a player with max_block 10 still subs at min 10 even if
        // settle_in is 15). This gives a clean opening with no churn.
        if (slot === 0 && chosen.max_block_minutes > input.slot_minutes) {
          const ratio = (slot0StarterIndex + 1) / Math.max(seats, 1);
          const desiredMinutes = ratio * chosen.max_block_minutes;
          const capSlots = Math.max(1, Math.floor(desiredMinutes / input.slot_minutes));
          let capMinutes = capSlots * input.slot_minutes;
          if (input.settle_in_minutes && input.settle_in_minutes > 0) {
            capMinutes = Math.max(capMinutes, input.settle_in_minutes);
          }
          capMinutes = Math.min(chosen.max_block_minutes, capMinutes);
          s.current_block_cap_minutes = capMinutes;
          slot0StarterIndex++;
        } else {
          s.current_block_cap_minutes = chosen.max_block_minutes;
        }
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
  slotsUntilNextBoundary: number,
): PlayerForScheduling | null {
  // Don't start a new block too close to a boundary (halftime / end of effective
  // slots) — the resulting stint would be cut short below MIN_BLOCK_LENGTH.
  const minBlockSlotsRemaining = Math.ceil(MIN_BLOCK_LENGTH / slotMinutes);
  if (slotsUntilNextBoundary < minBlockSlotsRemaining) return null;

  const eligible = outfield.filter((p) => {
    if (alreadyPlaced.has(p.id)) return false;
    const s = state.get(p.id)!;
    if (s.current_block_start !== null) return false;
    if (s.rest_until_slot > currentSlot) return false; // mandatory rest after a block ends
    const budget = budgets.get(p.id) ?? 0;
    if (s.minutes_used + slotMinutes > budget) return false;
    // Refuse picks that wouldn't have enough remaining budget to fit a min block.
    if (budget - s.minutes_used < MIN_BLOCK_LENGTH) return false;
    return true;
  });
  if (eligible.length === 0) return null;

  // Sort: rank → smallest fraction of own max_total used (so playing time
  // spreads proportionally to each player's own willingness, not biased
  // toward whoever has the highest absolute max_total) → highest max_block →
  // highest skill → random tiebreaker.
  eligible.sort((a, b) => {
    const aRank = positionRankFor(a, pos);
    const bRank = positionRankFor(b, pos);
    if (aRank !== bRank) return aRank - bRank;
    const aFraction = a.max_total_minutes > 0 ? (state.get(a.id)?.minutes_used ?? 0) / a.max_total_minutes : 1;
    const bFraction = b.max_total_minutes > 0 ? (state.get(b.id)?.minutes_used ?? 0) / b.max_total_minutes : 1;
    if (aFraction !== bFraction) return aFraction - bFraction;
    if (a.max_block_minutes !== b.max_block_minutes)
      return b.max_block_minutes - a.max_block_minutes;
    if (a.skill_score !== b.skill_score) return b.skill_score - a.skill_score;
    return Math.random() - 0.5;
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
