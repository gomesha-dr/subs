import type { PublicPlayer } from '@/lib/types';

const POSITION_LABEL: Record<string, string> = {
  attack: 'Attack',
  midfield: 'Midfield',
  defence: 'Defence',
};

export function TeamList({ players, currentId }: { players: PublicPlayer[]; currentId: string | null }) {
  if (players.length === 0) {
    return <p className="text-sm text-gray-600">No other players yet.</p>;
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Team</h2>
      <ul className="space-y-2">
        {players.map((p) => {
          const isMe = p.id === currentId;
          return (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-md border border-gray-200 p-3 bg-white"
            >
              <div>
                <p className="font-medium">
                  {p.name}
                  {isMe && <span className="ml-2 text-xs text-gray-500">(you)</span>}
                  {p.is_goalkeeper && <span className="ml-2 text-xs text-gray-500">GK</span>}
                </p>
                <p className="text-xs text-gray-500">
                  {POSITION_LABEL[p.primary_position]}
                  {p.secondary_position ? ` / ${POSITION_LABEL[p.secondary_position]}` : ''}
                </p>
              </div>
              <p className="text-xs text-gray-500">
                {p.max_block_minutes}/{p.max_total_minutes} min
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
