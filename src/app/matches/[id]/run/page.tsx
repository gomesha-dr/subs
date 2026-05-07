import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentPlayerId } from '@/lib/session';
import { getMatchById } from '@/lib/matches';
import { listPublicPlayers } from '@/lib/players';
import { MatchClock } from './MatchClock';

type Params = { params: Promise<{ id: string }> };

export default async function RunMatchPage({ params }: Params) {
  const { id: matchId } = await params;
  const playerId = await getCurrentPlayerId();
  if (!playerId) redirect('/');

  const [match, players] = await Promise.all([getMatchById(matchId), listPublicPlayers()]);
  if (!match) notFound();

  if (!match.generated_schedule) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-semibold">No roster yet</h1>
          <p className="text-sm text-gray-600">
            Generate a roster on the match page first, then come back here to run it on match day.
          </p>
          <Link
            href={`/matches/${matchId}`}
            className="inline-block bg-black text-white rounded-md px-4 py-2 text-sm"
          >
            Back to match
          </Link>
        </div>
      </div>
    );
  }

  const schedule = match.generated_schedule as Parameters<typeof MatchClock>[0]['schedule'];

  return (
    <MatchClock
      matchId={matchId}
      durationMinutes={match.duration_minutes}
      halfLengthMinutes={match.half_length_minutes}
      goalkeeperId={match.goalkeeper_id}
      players={players.map((p) => ({ id: p.id, name: p.name }))}
      schedule={schedule}
    />
  );
}
