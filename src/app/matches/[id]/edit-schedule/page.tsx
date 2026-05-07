import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentPlayerId } from '@/lib/session';
import { getMatchById, listPublicAttendances } from '@/lib/matches';
import { listPublicPlayers } from '@/lib/players';
import { EditScheduleForm } from './EditScheduleForm';

type Params = { params: Promise<{ id: string }> };

export default async function EditSchedulePage({ params }: Params) {
  const { id: matchId } = await params;
  const playerId = await getCurrentPlayerId();
  if (!playerId) redirect('/');

  const [match, players, attendances] = await Promise.all([
    getMatchById(matchId),
    listPublicPlayers(),
    listPublicAttendances(matchId),
  ]);
  if (!match) notFound();

  if (!match.generated_schedule) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-semibold">No roster yet</h1>
          <p className="text-sm text-gray-600">
            Generate a roster first, then come back here to fine-tune it.
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

  const schedule = match.generated_schedule as {
    slot_minutes: number;
    total_slots: number;
    blocks: Array<{ player_id: string; position: 'attack' | 'midfield' | 'defence'; start_slot: number; end_slot: number }>;
  };

  const attendingIds = new Set(
    attendances.filter((a) => a.is_attending).map((a) => a.player_id),
  );
  const eligible = players.filter(
    (p) => attendingIds.has(p.id) && p.id !== match.goalkeeper_id,
  );

  return (
    <EditScheduleForm
      matchId={matchId}
      durationMinutes={match.duration_minutes}
      halfLengthMinutes={match.half_length_minutes}
      slotMinutes={schedule.slot_minutes}
      totalSlots={schedule.total_slots}
      initialBlocks={schedule.blocks}
      eligiblePlayers={eligible.map((p) => ({ id: p.id, name: p.name }))}
    />
  );
}
