'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { updateMyProfile } from '@/app/actions';
import { PreferencePicker } from '@/app/_components/PreferencePicker';
import type { Player } from '@/lib/types';

export function EditProfileForm({ player }: { player: Player }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateMyProfile(formData);
      if (result && 'error' in result) setError(result.error);
    });
  }

  return (
    <div className="mx-auto w-full max-w-md p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit profile</h1>
        <Link href="/" className="text-sm underline text-gray-700">Cancel</Link>
      </div>
      <p className="text-sm text-gray-600 mb-6">
        Editing <strong>{player.name}</strong>. Name can&apos;t be changed for now.
      </p>

      <form action={handleSubmit} className="space-y-4">
        <Field label="Rank your positions (1st = most preferred)">
          <PreferencePicker
            defaults={{
              p1: player.pref_1_position,
              p2: player.pref_2_position,
              p3: player.pref_3_position,
            }}
          />
          <span className="block mt-1 text-xs text-gray-500">
            You&apos;ll be asked to play your 3rd-rank position only when nobody else can cover it.
          </span>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Max minutes in one block">
            <input
              name="max_block_minutes"
              type="number"
              min={1}
              max={120}
              defaultValue={player.max_block_minutes}
              required
              className="w-full rounded-md border border-gray-300 p-2"
            />
          </Field>
          <Field label="Max total minutes">
            <input
              name="max_total_minutes"
              type="number"
              min={1}
              max={120}
              defaultValue={player.max_total_minutes}
              required
              className="w-full rounded-md border border-gray-300 p-2"
            />
          </Field>
        </div>

        <Field label="Skill score (1–10)">
          <input
            name="skill_score"
            type="number"
            min={1}
            max={10}
            defaultValue={player.skill_score}
            required
            className="w-full rounded-md border border-gray-300 p-2"
          />
          <span className="block mt-1 text-xs text-gray-500">
            Only the algorithm uses this — it&apos;s never displayed to anyone, including the captain.
          </span>
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_goalkeeper"
            defaultChecked={player.is_goalkeeper}
          />
          I play in goal (excluded from outfield rotation)
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-black text-white rounded-md py-2 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-gray-700 mb-1">{label}</span>
      {children}
    </label>
  );
}
