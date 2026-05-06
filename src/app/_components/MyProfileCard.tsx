import Link from 'next/link';
import { signOut } from '../actions';
import type { Player } from '@/lib/types';

const POSITION_LABEL: Record<string, string> = {
  attack: 'Attack',
  midfield: 'Midfield',
  defence: 'Defence',
};

export function MyProfileCard({ player }: { player: Player }) {
  return (
    <section className="rounded-lg border border-gray-200 p-4 bg-white">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">You</p>
          <h2 className="text-xl font-semibold">{player.name}</h2>
        </div>
        <Link href="/me/edit" className="text-sm underline text-gray-700">
          Edit
        </Link>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
        <Cell label="Position ranking" wide>
          1. {POSITION_LABEL[player.pref_1_position]} · 2. {POSITION_LABEL[player.pref_2_position]} · 3. {POSITION_LABEL[player.pref_3_position]}
        </Cell>
        <Cell label="Max block">{player.max_block_minutes} min</Cell>
        <Cell label="Max total">{player.max_total_minutes} min</Cell>
        <Cell label="In goal?">{player.is_goalkeeper ? 'Yes' : 'No'}</Cell>
        <Cell label="Skill">Hidden — only the algorithm sees it.</Cell>
      </dl>

      <form action={signOut} className="mt-4">
        <button type="submit" className="text-xs text-gray-500 underline">
          Not me — switch player
        </button>
      </form>
    </section>
  );
}

function Cell({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900">{children}</dd>
    </div>
  );
}
