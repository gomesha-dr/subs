import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentPlayerId } from '@/lib/session';
import { listUpcomingMatches, listPastMatches } from '@/lib/matches';
import type { Match } from '@/lib/types';

function formatDate(dateStr: string, timeStr: string | null): string {
  const date = new Date(dateStr + 'T00:00:00');
  const dateLabel = date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  if (!timeStr) return dateLabel;
  return `${dateLabel}, ${timeStr.slice(0, 5)}`;
}

export default async function MatchesPage() {
  const id = await getCurrentPlayerId();
  if (!id) redirect('/');
  const [upcoming, past] = await Promise.all([listUpcomingMatches(), listPastMatches()]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-md p-4 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Matches</h1>
            <Link href="/" className="text-sm underline text-gray-700">
              ← Back to profile
            </Link>
          </div>
          <Link
            href="/matches/new"
            className="bg-black text-white text-sm rounded-md px-3 py-2"
          >
            + New
          </Link>
        </header>

        <Section title="Upcoming" matches={upcoming} emptyText="No upcoming matches yet. Tap + New to create one." />
        {past.length > 0 && <Section title="Past" matches={past} emptyText="" />}
      </div>
    </div>
  );
}

function Section({ title, matches, emptyText }: { title: string; matches: Match[]; emptyText: string }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {matches.length === 0 ? (
        <p className="text-sm text-gray-500">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {matches.map((m) => (
            <li key={m.id}>
              <Link
                href={`/matches/${m.id}`}
                className="block rounded-md border border-gray-200 p-3 bg-white"
              >
                <p className="font-medium">{formatDate(m.match_date, m.match_time)}</p>
                <p className="text-xs text-gray-500">
                  {m.duration_minutes} min ({m.half_length_minutes}-min halves)
                  {m.notes ? ` · ${m.notes}` : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
