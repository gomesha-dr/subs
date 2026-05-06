'use client';

import { useState } from 'react';
import type { Position } from '@/lib/types';

const ALL_POSITIONS: Array<{ value: Position; label: string }> = [
  { value: 'attack', label: 'Attack' },
  { value: 'midfield', label: 'Midfield' },
  { value: 'defence', label: 'Defence' },
];

export function PreferencePicker({
  defaults,
}: {
  defaults?: { p1: Position; p2: Position; p3: Position };
}) {
  const [p1, setP1] = useState<Position | ''>(defaults?.p1 ?? '');
  const [p2, setP2] = useState<Position | ''>(defaults?.p2 ?? '');
  const [p3, setP3] = useState<Position | ''>(defaults?.p3 ?? '');

  function isDisabled(option: Position, currentValue: Position | '', ...others: (Position | '')[]): boolean {
    if (option === currentValue) return false;
    return others.includes(option);
  }

  return (
    <div className="space-y-2">
      <RankRow
        rank={1}
        name="pref_1_position"
        value={p1}
        onChange={(v) => setP1(v)}
        disabledOptions={[p2, p3]}
        isDisabled={isDisabled}
      />
      <RankRow
        rank={2}
        name="pref_2_position"
        value={p2}
        onChange={(v) => setP2(v)}
        disabledOptions={[p1, p3]}
        isDisabled={isDisabled}
      />
      <RankRow
        rank={3}
        name="pref_3_position"
        value={p3}
        onChange={(v) => setP3(v)}
        disabledOptions={[p1, p2]}
        isDisabled={isDisabled}
      />
    </div>
  );
}

function RankRow({
  rank,
  name,
  value,
  onChange,
  disabledOptions,
  isDisabled,
}: {
  rank: number;
  name: string;
  value: Position | '';
  onChange: (v: Position | '') => void;
  disabledOptions: (Position | '')[];
  isDisabled: (option: Position, currentValue: Position | '', ...others: (Position | '')[]) => boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600 w-6 text-right">{rank}.</span>
      <select
        name={name}
        required
        value={value}
        onChange={(e) => onChange(e.target.value as Position | '')}
        className="flex-1 rounded-md border border-gray-300 p-2 text-sm"
      >
        <option value="" disabled>
          Pick one
        </option>
        {ALL_POSITIONS.map((p) => (
          <option key={p.value} value={p.value} disabled={isDisabled(p.value, value, ...disabledOptions)}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
}
