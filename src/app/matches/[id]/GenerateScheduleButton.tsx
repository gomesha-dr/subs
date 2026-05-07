'use client';

import { useState, useTransition } from 'react';
import { generateScheduleAction } from '../actions';

export function GenerateScheduleButton({
  matchId,
  disabled,
  disabledReason,
  label = 'Generate roster',
  hasEdits,
}: {
  matchId: string;
  disabled?: boolean;
  disabledReason?: string;
  label?: string;
  hasEdits?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    if (hasEdits) {
      const ok = window.confirm(
        'Re-generating will replace the roster you edited manually. Continue?',
      );
      if (!ok) return;
    }
    startTransition(async () => {
      const result = await generateScheduleAction(matchId);
      if (result && 'error' in result) setError(result.error);
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || pending}
        className="w-full rounded-md bg-black text-white py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? 'Generating…' : label}
      </button>
      {!pending && disabled && disabledReason && (
        <p className="text-xs text-gray-500">{disabledReason}</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
