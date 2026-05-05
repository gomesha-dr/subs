'use client';

import { useState, useTransition } from 'react';
import { identifyByName, createMyProfile } from '../actions';

type Mode = 'existing' | 'new';

export function WelcomeForm({ existingNames }: { existingNames: string[] }) {
  const [mode, setMode] = useState<Mode>('existing');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const action = mode === 'existing' ? identifyByName : createMyProfile;
      const result = await action(formData);
      if (result && 'error' in result) setError(result.error);
    });
  }

  return (
    <div className="mx-auto w-full max-w-md p-6">
      <h1 className="text-2xl font-semibold mb-1">Welcome to Subs</h1>
      <p className="text-sm text-gray-600 mb-6">Player rotation for our 7-a-side team.</p>

      <div className="flex gap-2 mb-6 text-sm">
        <button
          type="button"
          onClick={() => setMode('existing')}
          className={`flex-1 py-2 px-3 rounded-md border ${mode === 'existing' ? 'bg-black text-white border-black' : 'bg-white border-gray-300'}`}
        >
          I&apos;m an existing player
        </button>
        <button
          type="button"
          onClick={() => setMode('new')}
          className={`flex-1 py-2 px-3 rounded-md border ${mode === 'new' ? 'bg-black text-white border-black' : 'bg-white border-gray-300'}`}
        >
          I&apos;m new
        </button>
      </div>

      <form action={handleSubmit} className="space-y-4">
        <Field label="Your name">
          <input
            name="name"
            list="existing-names"
            required
            autoComplete="off"
            className="w-full rounded-md border border-gray-300 p-2"
          />
          <datalist id="existing-names">
            {existingNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>

        {mode === 'new' && (
          <>
            <Field label="Primary position">
              <select name="primary_position" required defaultValue="" className="w-full rounded-md border border-gray-300 p-2">
                <option value="" disabled>Pick one</option>
                <option value="attack">Attack</option>
                <option value="midfield">Midfield</option>
                <option value="defence">Defence</option>
              </select>
            </Field>

            <Field label="Secondary position (optional)">
              <select name="secondary_position" defaultValue="" className="w-full rounded-md border border-gray-300 p-2">
                <option value="">None</option>
                <option value="attack">Attack</option>
                <option value="midfield">Midfield</option>
                <option value="defence">Defence</option>
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Max minutes in one block">
                <input
                  name="max_block_minutes"
                  type="number"
                  min={1}
                  max={120}
                  defaultValue={20}
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
                  defaultValue={60}
                  required
                  className="w-full rounded-md border border-gray-300 p-2"
                />
              </Field>
            </div>

            <Field label="Skill score (1–10, only the algorithm sees this)">
              <input
                name="skill_score"
                type="number"
                min={1}
                max={10}
                defaultValue={5}
                required
                className="w-full rounded-md border border-gray-300 p-2"
              />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_goalkeeper" />
              I play in goal (excluded from outfield rotation)
            </label>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-black text-white rounded-md py-2 disabled:opacity-50"
        >
          {pending ? 'Saving…' : mode === 'existing' ? 'Continue' : 'Create profile'}
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
