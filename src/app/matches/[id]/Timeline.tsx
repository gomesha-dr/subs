import type { Position } from '@/lib/types';

type ScheduleBlock = {
  player_id: string;
  position: Position;
  start_slot: number;
  end_slot: number;
};

type Schedule = {
  slot_minutes: number;
  total_slots: number;
  blocks: ScheduleBlock[];
  unfilled_slots?: Array<{ slot: number; position: Position; missing: number }>;
  player_summaries?: Array<{
    player_id: string;
    total_slots: number;
    longest_block_slots: number;
    block_count: number;
  }>;
};

type PlayerLite = {
  id: string;
  name: string;
  pref_1_position: Position;
  pref_2_position: Position;
  pref_3_position: Position;
};

const POSITION_COLOUR: Record<Position, string> = {
  defence: 'bg-emerald-600 text-white',
  midfield: 'bg-sky-600 text-white',
  attack: 'bg-rose-600 text-white',
};

const POSITION_SHORT: Record<Position, string> = {
  defence: 'DEF',
  midfield: 'MID',
  attack: 'ATT',
};

export function Timeline({
  schedule,
  players,
  matchDurationMinutes,
  halfLengthMinutes,
}: {
  schedule: Schedule;
  players: PlayerLite[];
  matchDurationMinutes: number;
  halfLengthMinutes: number;
}) {
  const playersOnPitch = new Set(schedule.blocks.map((b) => b.player_id));
  const orderedPlayers = [
    ...players.filter((p) => playersOnPitch.has(p.id)),
    ...players.filter((p) => !playersOnPitch.has(p.id)),
  ];
  const blocksByPlayer = new Map<string, ScheduleBlock[]>();
  for (const b of schedule.blocks) {
    if (!blocksByPlayer.has(b.player_id)) blocksByPlayer.set(b.player_id, []);
    blocksByPlayer.get(b.player_id)!.push(b);
  }
  const summaryById = new Map((schedule.player_summaries ?? []).map((s) => [s.player_id, s]));

  // X-axis ticks at 0, halftime, end (and intermediate 20-min marks for an 80-min match).
  const tickMinutes: number[] = [0];
  for (let m = 20; m < matchDurationMinutes; m += 20) tickMinutes.push(m);
  tickMinutes.push(matchDurationMinutes);
  if (!tickMinutes.includes(halfLengthMinutes)) tickMinutes.push(halfLengthMinutes);
  tickMinutes.sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <Legend />

      <div className="space-y-2">
        <div className="relative h-4">
          {tickMinutes.map((m) => (
            <span
              key={m}
              className="absolute -translate-x-1/2 text-[10px] text-gray-500"
              style={{ left: `${(m / matchDurationMinutes) * 100}%` }}
            >
              {m === halfLengthMinutes && m !== 0 && m !== matchDurationMinutes ? `HT (${m}')` : `${m}'`}
            </span>
          ))}
        </div>

        {orderedPlayers.map((p) => {
          const blocks = blocksByPlayer.get(p.id) ?? [];
          const summary = summaryById.get(p.id);
          const totalMinutes = (summary?.total_slots ?? 0) * schedule.slot_minutes;
          const longestMinutes = (summary?.longest_block_slots ?? 0) * schedule.slot_minutes;

          return (
            <div key={p.id}>
              <div className="flex items-baseline justify-between text-xs mb-1">
                <span className="font-medium text-gray-900">
                  {p.name}{' '}
                  <span className="text-gray-500 font-normal">
                    ({POSITION_SHORT[p.pref_1_position]}›{POSITION_SHORT[p.pref_2_position]}›{POSITION_SHORT[p.pref_3_position]})
                  </span>
                </span>
                <span className="text-gray-500">
                  {blocks.length === 0
                    ? '— bench'
                    : `${totalMinutes} min · longest ${longestMinutes} min · ${blocks.length} block${blocks.length > 1 ? 's' : ''}`}
                </span>
              </div>
              <div className="relative h-7 rounded bg-gray-100 overflow-hidden">
                {/* halftime divider */}
                <div
                  className="absolute top-0 bottom-0 border-l border-dashed border-gray-400"
                  style={{ left: `${(halfLengthMinutes / matchDurationMinutes) * 100}%` }}
                />
                {blocks.map((b, i) => {
                  const startMin = b.start_slot * schedule.slot_minutes;
                  const widthMin = (b.end_slot - b.start_slot) * schedule.slot_minutes;
                  return (
                    <div
                      key={i}
                      className={`absolute top-0 bottom-0 ${POSITION_COLOUR[b.position]} flex items-center justify-center text-[10px] font-medium`}
                      style={{
                        left: `${(startMin / matchDurationMinutes) * 100}%`,
                        width: `${(widthMin / matchDurationMinutes) * 100}%`,
                      }}
                      title={`${POSITION_SHORT[b.position]} · ${startMin}'–${startMin + widthMin}' (${widthMin} min)`}
                    >
                      {widthMin >= 10 ? POSITION_SHORT[b.position] : ''}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {schedule.unfilled_slots && schedule.unfilled_slots.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold mb-1">Some slots couldn&apos;t be filled</p>
          <p className="text-xs mb-2">Likely too few players for this formation, or position constraints leave gaps.</p>
          <ul className="text-xs space-y-1">
            {schedule.unfilled_slots.slice(0, 6).map((u, i) => (
              <li key={i}>
                Slot at {u.slot * schedule.slot_minutes}&apos;: missing {u.missing} {POSITION_SHORT[u.position]}
              </li>
            ))}
            {schedule.unfilled_slots.length > 6 && (
              <li className="text-amber-700">…and {schedule.unfilled_slots.length - 6} more.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {(['defence', 'midfield', 'attack'] as Position[]).map((pos) => (
        <span key={pos} className="flex items-center gap-1.5">
          <span className={`inline-block h-3 w-3 rounded ${POSITION_COLOUR[pos].split(' ')[0]}`} />
          {POSITION_SHORT[pos]}
        </span>
      ))}
    </div>
  );
}
