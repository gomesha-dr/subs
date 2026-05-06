'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { blocksToEvents, lineupAtMinute, type SubEvent } from '@/lib/match_events';
import type { Position } from '@/lib/types';

const SLOT_MINUTES = 5;

const POSITION_LABEL: Record<Position, string> = {
  defence: 'DEF',
  midfield: 'MID',
  attack: 'ATT',
};

const POSITION_COLOUR: Record<Position, string> = {
  defence: 'bg-emerald-600',
  midfield: 'bg-sky-600',
  attack: 'bg-rose-600',
};

type ScheduleShape = {
  slot_minutes: number;
  total_slots: number;
  blocks: Array<{
    player_id: string;
    position: Position;
    start_slot: number;
    end_slot: number;
  }>;
  formation?: { def: number; mid: number; att: number };
};

type Player = { id: string; name: string };

type ClockState = 'idle' | 'running' | 'paused' | 'finished';

type PersistedClock = {
  state: ClockState;
  elapsed_ms_at_change: number;
  last_change_ms: number; // Date.now() at last state change
  alerted_minutes: number[];
};

export function MatchClock({
  matchId,
  durationMinutes,
  halfLengthMinutes,
  goalkeeperId,
  players,
  schedule,
}: {
  matchId: string;
  durationMinutes: number;
  halfLengthMinutes: number;
  goalkeeperId: string | null;
  players: Player[];
  schedule: ScheduleShape;
}) {
  const slotMinutes = schedule.slot_minutes ?? SLOT_MINUTES;
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const events = useMemo(
    () => blocksToEvents(schedule.blocks, slotMinutes, schedule.total_slots),
    [schedule.blocks, schedule.total_slots, slotMinutes],
  );

  const storageKey = `subs:clock:${matchId}`;

  // Hydrated initial state. SSR sees a frozen idle state; client effect rehydrates from localStorage.
  const [state, setState] = useState<ClockState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [alertedMinutes, setAlertedMinutes] = useState<Set<number>>(new Set());
  const [pendingAlert, setPendingAlert] = useState<SubEvent | null>(null);

  const startTickRef = useRef<number | null>(null);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as PersistedClock;
      const now = Date.now();
      if (saved.state === 'running') {
        const fresh = saved.elapsed_ms_at_change + (now - saved.last_change_ms);
        setElapsedMs(Math.min(fresh, durationMinutes * 60_000));
        setState(fresh >= durationMinutes * 60_000 ? 'finished' : 'running');
      } else {
        setElapsedMs(saved.elapsed_ms_at_change);
        setState(saved.state);
      }
      setAlertedMinutes(new Set(saved.alerted_minutes));
    } catch {
      /* ignore */
    }
  }, [storageKey, durationMinutes]);

  // Persist on state change.
  useEffect(() => {
    const persisted: PersistedClock = {
      state,
      elapsed_ms_at_change: elapsedMs,
      last_change_ms: Date.now(),
      alerted_minutes: Array.from(alertedMinutes),
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(persisted));
    } catch {
      /* ignore */
    }
  }, [state, elapsedMs, alertedMinutes, storageKey]);

  // Tick when running.
  useEffect(() => {
    if (state !== 'running') {
      startTickRef.current = null;
      return;
    }
    startTickRef.current = Date.now() - elapsedMs;
    const id = window.setInterval(() => {
      const ref = startTickRef.current;
      if (ref == null) return;
      const fresh = Date.now() - ref;
      const cap = durationMinutes * 60_000;
      if (fresh >= cap) {
        setElapsedMs(cap);
        setState('finished');
        playFinalWhistle();
      } else {
        setElapsedMs(fresh);
      }
    }, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, durationMinutes]);

  // Fire substitution alerts when crossing event minutes.
  useEffect(() => {
    if (state !== 'running') return;
    const currentMinute = Math.floor(elapsedMs / 60_000);
    for (const ev of events) {
      // Skip the kickoff "0' on" event (no sub, just the starting lineup).
      if (ev.minute === 0) continue;
      // Skip events that have only ON or only OFF (a sub event has both).
      if (ev.ons.length === 0 || ev.offs.length === 0) continue;
      if (currentMinute >= ev.minute && !alertedMinutes.has(ev.minute)) {
        setAlertedMinutes((prev) => new Set([...prev, ev.minute]));
        setPendingAlert(ev);
        playSubBeep();
        navigator.vibrate?.([200, 100, 200]);
        // Auto-pause so the captain can act.
        setState('paused');
        break;
      }
    }
  }, [elapsedMs, events, state, alertedMinutes]);

  // Auto-pause at half-time on first cross.
  useEffect(() => {
    if (state !== 'running') return;
    const currentMinute = Math.floor(elapsedMs / 60_000);
    const halfKey = halfLengthMinutes;
    if (currentMinute >= halfKey && !alertedMinutes.has(-1)) {
      setAlertedMinutes((prev) => new Set([...prev, -1]));
      setState('paused');
      playHalfTimeBeep();
      navigator.vibrate?.([400, 200, 400]);
    }
  }, [elapsedMs, halfLengthMinutes, state, alertedMinutes]);

  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const currentMinute = minutes;
  const phase: 'pre' | 'first' | 'half' | 'second' | 'after' =
    state === 'finished'
      ? 'after'
      : currentMinute >= durationMinutes
        ? 'after'
        : currentMinute >= halfLengthMinutes
          ? state === 'paused' && currentMinute === halfLengthMinutes
            ? 'half'
            : 'second'
          : currentMinute === 0 && state === 'idle'
            ? 'pre'
            : 'first';

  const lineup = lineupAtMinute(schedule.blocks, slotMinutes, currentMinute);
  const lineupByPosition: Record<Position, Player[]> = {
    defence: [],
    midfield: [],
    attack: [],
  };
  for (const l of lineup) {
    const p = playerById.get(l.player_id);
    if (p) lineupByPosition[l.position].push(p);
  }

  const nextEvent = events.find(
    (e) => e.minute > currentMinute && e.ons.length > 0 && e.offs.length > 0,
  );
  const minutesToNext = nextEvent ? nextEvent.minute - minutes : null;

  const goalkeeper = goalkeeperId ? playerById.get(goalkeeperId) : null;

  function start() {
    setState('running');
  }
  function pause() {
    setState('paused');
  }
  function resume() {
    setState('running');
  }
  function reset() {
    setState('idle');
    setElapsedMs(0);
    setAlertedMinutes(new Set());
    setPendingAlert(null);
  }
  function dismissAlert() {
    setPendingAlert(null);
  }
  function skipMinutes(mins: number) {
    const skipMs = mins * 60_000;
    const cap = durationMinutes * 60_000;
    if (startTickRef.current != null) {
      // Running — push the reference backward so Date.now() - ref jumps forward.
      const minRef = Date.now() - cap;
      startTickRef.current = Math.max(startTickRef.current - skipMs, minRef);
      setElapsedMs(Math.min(Date.now() - startTickRef.current, cap));
    } else {
      // Paused or idle — just bump the stored value; resume will pick it up.
      setElapsedMs((prev) => Math.min(prev + skipMs, cap));
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="mx-auto w-full max-w-md p-4 space-y-5">
        <div className="flex items-center justify-between">
          <Link href={`/matches/${matchId}`} className="text-xs underline text-gray-400">
            ← Back to match
          </Link>
          <button
            type="button"
            onClick={reset}
            className="text-xs underline text-gray-400"
          >
            Reset clock
          </button>
        </div>

        <div className="text-center">
          <div className="font-mono text-7xl tracking-tight tabular-nums">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>
          <div className="mt-2 text-sm text-gray-400">
            {phase === 'pre' && 'Ready to kick off'}
            {phase === 'first' && `First half (until ${halfLengthMinutes}')`}
            {phase === 'half' && `Half-time — second half kicks off after ${halfLengthMinutes}'`}
            {phase === 'second' && `Second half (until ${durationMinutes}')`}
            {phase === 'after' && 'Match over'}
          </div>
        </div>

        <div className="space-y-2">
          {state === 'idle' && (
            <button
              onClick={start}
              className="w-full bg-emerald-500 text-black font-semibold py-3 rounded-md"
            >
              Kick off
            </button>
          )}
          {state === 'running' && (
            <button
              onClick={pause}
              className="w-full bg-amber-400 text-black font-semibold py-3 rounded-md"
            >
              Pause
            </button>
          )}
          {state === 'paused' && (
            <button
              onClick={resume}
              className="w-full bg-emerald-500 text-black font-semibold py-3 rounded-md"
            >
              {phase === 'half' ? 'Start second half' : 'Resume'}
            </button>
          )}
          {state === 'finished' && (
            <button
              onClick={reset}
              className="w-full bg-gray-700 text-white font-semibold py-3 rounded-md"
            >
              Match over · reset
            </button>
          )}
          {(state === 'running' || state === 'paused') && (
            <div className="flex gap-2 text-xs">
              <button
                onClick={() => skipMinutes(1)}
                className="flex-1 bg-gray-800 border border-gray-700 text-gray-300 py-1.5 rounded-md"
              >
                +1 min
              </button>
              <button
                onClick={() => skipMinutes(5)}
                className="flex-1 bg-gray-800 border border-gray-700 text-gray-300 py-1.5 rounded-md"
              >
                +5 min
              </button>
            </div>
          )}
        </div>

        <section className="rounded-lg border border-gray-700 p-4 bg-gray-800">
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-3">On the pitch now</p>
          {goalkeeper && (
            <div className="mb-3 flex items-center gap-2 text-sm">
              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-yellow-600 text-black font-bold">GK</span>
              <span>{goalkeeper.name}</span>
            </div>
          )}
          {(['defence', 'midfield', 'attack'] as Position[]).map((pos) => (
            <div key={pos} className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${POSITION_COLOUR[pos]} text-white font-bold`}>
                {POSITION_LABEL[pos]}
              </span>
              {lineupByPosition[pos].length === 0 ? (
                <span className="text-red-400">—</span>
              ) : (
                lineupByPosition[pos].map((p) => <span key={p.id}>{p.name}</span>)
              )}
            </div>
          ))}
        </section>

        {nextEvent && (
          <section className="rounded-lg border border-gray-700 p-4 bg-gray-800">
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">
              Next sub at {nextEvent.minute}&apos; (in {minutesToNext} min)
            </p>
            <div className="space-y-1 text-sm">
              {nextEvent.offs.map((e, i) => (
                <div key={`off-${i}`} className="flex items-center gap-2">
                  <span className="inline-block w-6 text-center text-red-400">↓</span>
                  <span>{playerById.get(e.player_id)?.name ?? e.player_id.slice(0, 8)}</span>
                  <span className="text-xs text-gray-400">{POSITION_LABEL[e.position]}</span>
                </div>
              ))}
              {nextEvent.ons.map((e, i) => (
                <div key={`on-${i}`} className="flex items-center gap-2">
                  <span className="inline-block w-6 text-center text-emerald-400">↑</span>
                  <span>{playerById.get(e.player_id)?.name ?? e.player_id.slice(0, 8)}</span>
                  <span className="text-xs text-gray-400">{POSITION_LABEL[e.position]}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {pendingAlert && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          >
            <div className="w-full max-w-sm bg-white text-black rounded-lg p-5 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Substitution at</p>
                <p className="text-3xl font-bold">{pendingAlert.minute}&apos;</p>
              </div>
              <div className="space-y-2">
                {pendingAlert.offs.map((e, i) => (
                  <div key={`off-${i}`} className="flex items-center gap-2">
                    <span className="inline-block w-6 text-center text-red-600 font-bold">↓</span>
                    <span className="font-medium">{playerById.get(e.player_id)?.name ?? e.player_id.slice(0, 8)}</span>
                    <span className="text-xs text-gray-500">comes off ({POSITION_LABEL[e.position]})</span>
                  </div>
                ))}
                {pendingAlert.ons.map((e, i) => (
                  <div key={`on-${i}`} className="flex items-center gap-2">
                    <span className="inline-block w-6 text-center text-emerald-600 font-bold">↑</span>
                    <span className="font-medium">{playerById.get(e.player_id)?.name ?? e.player_id.slice(0, 8)}</span>
                    <span className="text-xs text-gray-500">comes on ({POSITION_LABEL[e.position]})</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  dismissAlert();
                  resume();
                }}
                className="w-full bg-emerald-500 text-black font-semibold py-3 rounded-md"
              >
                Done — resume clock
              </button>
              <button
                onClick={dismissAlert}
                className="w-full text-sm text-gray-500 underline"
              >
                Stay paused
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- audio helpers ---

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  return new Ctor();
}

function playTone(frequency: number, durationMs: number, gain = 0.3) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = frequency;
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
  osc.start();
  osc.stop(ctx.currentTime + durationMs / 1000);
}

function playSubBeep() {
  playTone(880, 200);
  setTimeout(() => playTone(880, 200), 250);
  setTimeout(() => playTone(1320, 400), 500);
}

function playHalfTimeBeep() {
  playTone(660, 600);
}

function playFinalWhistle() {
  playTone(660, 800);
  setTimeout(() => playTone(660, 800), 900);
  setTimeout(() => playTone(660, 1200), 1800);
}
