'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { createMatchAction } from '../actions';

export function CreateMatchForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createMatchAction(formData);
      if (result && 'error' in result) setError(result.error);
    });
  }

  return (
    <div className="mx-auto w-full max-w-md p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New match</h1>
        <Link href="/matches" className="text-sm underline text-gray-700">Cancel</Link>
      </div>

      <form action={handleSubmit} className="space-y-4">
        <Field label="Date">
          <input
            name="match_date"
            type="date"
            required
            className="w-full rounded-md border border-gray-300 p-2"
          />
        </Field>

        <Field label="Kick-off time (optional)">
          <input
            name="match_time"
            type="time"
            className="w-full rounded-md border border-gray-300 p-2"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Duration (min)">
            <input
              name="duration_minutes"
              type="number"
              min={1}
              max={240}
              defaultValue={90}
              required
              className="w-full rounded-md border border-gray-300 p-2"
            />
          </Field>
          <Field label="Half length (min)">
            <input
              name="half_length_minutes"
              type="number"
              min={1}
              max={120}
              defaultValue={45}
              required
              className="w-full rounded-md border border-gray-300 p-2"
            />
          </Field>
        </div>

        <Field label="Notes (optional)">
          <input
            name="notes"
            type="text"
            placeholder="e.g. opponent, pitch, anything"
            className="w-full rounded-md border border-gray-300 p-2"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-black text-white rounded-md py-2 disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create match'}
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
