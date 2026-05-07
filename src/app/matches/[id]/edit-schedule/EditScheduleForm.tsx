'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { saveScheduleEditsAction } from '../../actions';
import type { Position } from '@/lib/types';

type Block = {
  player_id: string;
  position: Position;
  start_slot: number;
  end_slot: number;
};

type Player = { id: string; name: string };

const POSITIONS: Array<{ value: Position; label: string }> = [
  { value: 'defence', label: 'DEF' },
  { value: 'midfield', label: 'MID' },
  { value: 'attack', label: 'ATT' },
];

export function EditScheduleForm({
  matchId,
  durationMinutes,
  halfLengthMinutes,
  slotMinutes,
  totalSlots,
  initialBlocks,
  eligiblePlayers,
}: {
  matchId: string;
  durationMinutes: number;
  halfLengthMinutes: number;
  slotMinutes: number;
  totalSlots: number;
  initialBlocks: Block[];
  eligiblePlayers: Player[];
}) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<Block[]>(() =>
    [...initialBlocks].sort(
      (a, b) => a.start_slot - b.start_slot || a.position.localeCompare(b.position),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addBlock() {
    setBlocks((bs) => [
      ...bs,
      {
        player_id: eligiblePlayers[0]?.id ?? '',
        position: 'midfield',
        start_slot: 0,
        end_slot: Math.min(8, totalSlots), // default 40-min block
      },
    ]);
  }

  function deleteBlock(index: number) {
    setBlocks((bs) => bs.filter((_, i) => i !== index));
  }

  function updateBlock(index: number, patch: Partial<Block>) {
    setBlocks((bs) => bs.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function save() {
    setError(null);
    if (blocks.some((b) => !b.player_id)) {
      setError('Every block needs a player.');
      return;
    }
    startTransition(async () => {
      const result = await saveScheduleEditsAction(matchId, blocks);
      if (result && 'error' in result) {
        setError(result.error);
        return;
      }
      router.push(`/matches/${matchId}`);
    });
  }

  // Slot options for start/end dropdowns (minutes labels).
  const startSlotOptions = Array.from({ length: totalSlots }, (_, i) => i);
  const endSlotOptions = Array.from({ length: totalSlots }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-md p-4 space-y-5">
        <header>
          <Link href={`/matches/${matchId}`} className="text-sm underline text-gray-700">
            ← Cancel and back to match
          </Link>
          <h1 className="text-2xl font-semibold mt-2">Edit roster</h1>
          <p className="text-sm text-gray-500">
            {durationMinutes}-min match · half at {halfLengthMinutes}&apos; · {slotMinutes}-min slots
          </p>
        </header>

        <ul className="space-y-3">
          {blocks.map((b, i) => {
            const startMin = b.start_slot * slotMinutes;
            const endMin = b.end_slot * slotMinutes;
            const lengthMin = endMin - startMin;
            return (
              <li key={i} className="rounded-md border border-gray-200 bg-white p-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {startMin}&apos; → {endMin}&apos; ({lengthMin} min)
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteBlock(i)}
                    className="text-red-600 underline text-xs"
                  >
                    Delete
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Field label="Player">
                    <select
                      value={b.player_id}
                      onChange={(e) => updateBlock(i, { player_id: e.target.value })}
                      className="w-full rounded-md border border-gray-300 p-2 text-sm"
                    >
                      <option value="">— Pick —</option>
                      {eligiblePlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Position">
                    <select
                      value={b.position}
                      onChange={(e) => updateBlock(i, { position: e.target.value as Position })}
                      className="w-full rounded-md border border-gray-300 p-2 text-sm"
                    >
                      {POSITIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Start (min)">
                    <select
                      value={b.start_slot}
                      onChange={(e) => updateBlock(i, { start_slot: Number(e.target.value) })}
                      className="w-full rounded-md border border-gray-300 p-2 text-sm"
                    >
                      {startSlotOptions.map((s) => (
                        <option key={s} value={s}>
                          {s * slotMinutes}&apos;
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="End (min)">
                    <select
                      value={b.end_slot}
                      onChange={(e) => updateBlock(i, { end_slot: Number(e.target.value) })}
                      className="w-full rounded-md border border-gray-300 p-2 text-sm"
                    >
                      {endSlotOptions.map((s) => (
                        <option key={s} value={s}>
                          {s * slotMinutes}&apos;
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={addBlock}
          className="w-full rounded-md border border-dashed border-gray-400 py-2 text-sm text-gray-700"
        >
          + Add block
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <Link
            href={`/matches/${matchId}`}
            className="flex-1 text-center rounded-md border border-gray-300 bg-white py-2 text-sm"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="flex-1 rounded-md bg-black text-white py-2 text-sm disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
