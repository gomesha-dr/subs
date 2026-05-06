import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentPlayerId } from '@/lib/session';
import { getMatchById, listPublicAttendances, getMyAttendance } from '@/lib/matches';
import { listPublicPlayers } from '@/lib/players';
import {
  toggleMyAttendance,
  setMatchGoalkeeperFromForm,
  setMatchFormationFromForm,
  clearScheduleAction,
  deleteMatchAction,
} from '../actions';
import { Timeline } from './Timeline';
import { GenerateScheduleButton } from './GenerateScheduleButton';

function formatDate(dateStr: string, timeStr: string | null): string {
  const date = new Date(dateStr + 'T00:00:00');
  const dateLabel = date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  if (!timeStr) return dateLabel;
  return `${dateLabel}, ${timeStr.slice(0, 5)}`;
}

const FORMATIONS: Array<{ value: string; label: string }> = [
  { value: '2-3-2', label: '2-3-2 (balanced)' },
  { value: '3-3-1', label: '3-3-1 (defensive)' },
  { value: '3-2-2', label: '3-2-2 (back three)' },
  { value: '1-3-3', label: '1-3-3 (attacking)' },
  { value: '3-2-1', label: '3-2-1 (parked bus)' },
];

type Params = { params: Promise<{ id: string }> };

export default async function MatchDetailPage({ params }: Params) {
  const { id: matchId } = await params;
  const playerId = await getCurrentPlayerId();
  if (!playerId) redirect('/');

  const [match, players, attendances, myAttendance] = await Promise.all([
    getMatchById(matchId),
    listPublicPlayers(),
    listPublicAttendances(matchId),
    getMyAttendance(matchId, playerId),
  ]);

  if (!match) notFound();

  const attendanceByPlayer = new Map(attendances.map((a) => [a.player_id, a]));
  const attendingCount = attendances.filter((a) => a.is_attending).length;
  const outfieldAttending = attendances.filter((a) => {
    if (!a.is_attending) return false;
    const p = players.find((pl) => pl.id === a.player_id);
    return p && !p.is_goalkeeper;
  }).length;
  const goalkeeperPlayer = match.goalkeeper_id
    ? players.find((p) => p.id === match.goalkeeper_id) ?? null
    : null;

  const schedule =
    match.generated_schedule && typeof match.generated_schedule === 'object'
      ? (match.generated_schedule as Parameters<typeof Timeline>[0]['schedule'])
      : null;

  const attendingPlayers = players.filter((p) => attendanceByPlayer.get(p.id)?.is_attending);
  const outfieldAttendingPlayers = attendingPlayers.filter((p) => p.id !== match.goalkeeper_id);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-md p-4 space-y-6">
        <header>
          <Link href="/matches" className="text-sm underline text-gray-700">
            ← All matches
          </Link>
          <h1 className="text-2xl font-semibold mt-2">{formatDate(match.match_date, match.match_time)}</h1>
          <p className="text-sm text-gray-500">
            {match.duration_minutes} min ({match.half_length_minutes}-min halves)
            {match.notes ? ` · ${match.notes}` : ''}
          </p>
        </header>

        <section className="rounded-lg border border-gray-200 p-4 bg-white">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Your attendance</p>
          <p className="mb-3 text-sm">
            {myAttendance?.is_attending ? '✓ You said you\'re coming.' : 'You haven\'t marked yourself as coming.'}
          </p>
          <form action={toggleMyAttendance.bind(null, matchId)}>
            <button
              type="submit"
              className={`w-full rounded-md py-2 text-sm font-medium ${
                myAttendance?.is_attending
                  ? 'bg-white border border-gray-300 text-gray-900'
                  : 'bg-black text-white'
              }`}
            >
              {myAttendance?.is_attending ? "I can't make it after all" : "I'm coming"}
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-gray-200 p-4 bg-white">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Goalkeeper</p>
          <form
            action={setMatchGoalkeeperFromForm.bind(null, matchId)}
            className="flex gap-2"
          >
            <select
              name="goalkeeper_id"
              defaultValue={match.goalkeeper_id ?? ''}
              className="flex-1 rounded-md border border-gray-300 p-2 text-sm"
            >
              <option value="">— None set —</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.is_goalkeeper ? ' (regular GK)' : ''}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-md bg-black text-white px-4 text-sm">
              Save
            </button>
          </form>
          {goalkeeperPlayer && (
            <p className="mt-2 text-xs text-gray-500">
              {goalkeeperPlayer.name} will play the full match in goal.
            </p>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 p-4 bg-white">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Formation</p>
          <form
            action={setMatchFormationFromForm.bind(null, matchId)}
            className="flex gap-2"
          >
            <select
              name="formation"
              defaultValue={match.formation ?? ''}
              className="flex-1 rounded-md border border-gray-300 p-2 text-sm"
            >
              <option value="">— Pick a formation —</option>
              {FORMATIONS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <button type="submit" className="rounded-md bg-black text-white px-4 text-sm">
              Save
            </button>
          </form>
          <p className="mt-2 text-xs text-gray-500">
            Outfield only (def-mid-att). The GK is separate.
          </p>
        </section>

        <section className="rounded-lg border border-gray-200 p-4 bg-white">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-wide text-gray-500">Schedule</p>
            {schedule && (
              <form action={clearScheduleAction.bind(null, matchId)}>
                <button type="submit" className="text-xs text-gray-500 underline">
                  Clear
                </button>
              </form>
            )}
          </div>

          {!schedule ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                {match.formation
                  ? `Ready to generate. ${outfieldAttending} outfield player${outfieldAttending === 1 ? '' : 's'} marked as coming.`
                  : 'Pick a formation above first, then generate.'}
              </p>
              <GenerateScheduleButton
                matchId={matchId}
                disabled={!match.formation || outfieldAttending < 7}
                disabledReason={
                  !match.formation
                    ? 'Pick a formation first.'
                    : outfieldAttending < 7
                      ? `Need 7 outfield players (currently ${outfieldAttending}).`
                      : undefined
                }
              />
            </div>
          ) : (
            <div className="space-y-3">
              <Timeline
                schedule={schedule}
                players={outfieldAttendingPlayers}
                matchDurationMinutes={match.duration_minutes}
                halfLengthMinutes={match.half_length_minutes}
              />
              <Link
                href={`/matches/${matchId}/run`}
                className="block w-full text-center rounded-md bg-emerald-600 text-white py-2 text-sm font-semibold"
              >
                ▶ Run match (timer + sub alerts)
              </Link>
              <div className="flex gap-2 items-start">
                <Link
                  href={`/matches/${matchId}/edit-schedule`}
                  className="flex-1 text-center rounded-md border border-gray-300 bg-white py-2 text-sm"
                >
                  Edit schedule
                </Link>
                <div className="flex-1">
                  <GenerateScheduleButton
                    matchId={matchId}
                    disabled={!match.formation || outfieldAttending < 7}
                    label="Re-generate"
                    hasEdits={Boolean((schedule as { edited_at?: string } | null)?.edited_at)}
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-1">
            Squad ({attendingCount} coming{outfieldAttending !== attendingCount ? `, ${outfieldAttending} outfield` : ''})
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Tap your name on the previous screen to switch player; you can only toggle your own attendance here.
          </p>
          <ul className="space-y-2">
            {players.map((p) => {
              const att = attendanceByPlayer.get(p.id);
              const coming = !!att?.is_attending;
              const isMe = p.id === playerId;
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
                  </div>
                  <span className={`text-xs ${coming ? 'text-green-700' : 'text-gray-400'}`}>
                    {coming ? '✓ coming' : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <form action={deleteMatchAction.bind(null, matchId)}>
            <button type="submit" className="text-xs text-red-600 underline">
              Delete this match
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

