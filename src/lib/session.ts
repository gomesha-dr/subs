import { cookies } from 'next/headers';

const COOKIE_NAME = 'player_id';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function getCurrentPlayerId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export async function setCurrentPlayerId(id: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ONE_YEAR_SECONDS,
    path: '/',
  });
}

export async function clearCurrentPlayer(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
