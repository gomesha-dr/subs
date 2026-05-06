import type { Position } from './types';

export type SubEvent = {
  minute: number;
  ons: Array<{ player_id: string; position: Position }>;
  offs: Array<{ player_id: string; position: Position }>;
};

type ScheduleBlock = {
  player_id: string;
  position: Position;
  start_slot: number;
  end_slot: number;
};

/**
 * Convert schedule blocks into a chronological list of substitution events.
 * - Block starts become "ON" events at their start minute.
 * - Block ends become "OFF" events at their end minute, except for blocks that
 *   end at the final whistle (everyone is implicitly coming off then anyway).
 * Events at the same minute are merged so the captain sees one bundled sub.
 */
export function blocksToEvents(
  blocks: ScheduleBlock[],
  slotMinutes: number,
  totalSlots: number,
): SubEvent[] {
  const eventMap = new Map<number, SubEvent>();
  const ensure = (minute: number): SubEvent => {
    if (!eventMap.has(minute)) eventMap.set(minute, { minute, ons: [], offs: [] });
    return eventMap.get(minute)!;
  };

  for (const b of blocks) {
    const startMin = b.start_slot * slotMinutes;
    const endMin = b.end_slot * slotMinutes;
    ensure(startMin).ons.push({ player_id: b.player_id, position: b.position });
    if (b.end_slot < totalSlots) {
      ensure(endMin).offs.push({ player_id: b.player_id, position: b.position });
    }
  }

  return Array.from(eventMap.values()).sort((a, b) => a.minute - b.minute);
}

/** Returns players currently on the pitch at a given minute, derived from blocks. */
export function lineupAtMinute(
  blocks: ScheduleBlock[],
  slotMinutes: number,
  minute: number,
): Array<{ player_id: string; position: Position }> {
  const slot = Math.floor(minute / slotMinutes);
  return blocks
    .filter((b) => b.start_slot <= slot && slot < b.end_slot)
    .map((b) => ({ player_id: b.player_id, position: b.position }));
}
