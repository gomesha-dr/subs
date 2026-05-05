import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function supabaseServer(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SECRET_KEY. Check .env.local locally and Vercel project env vars in production.',
    );
  }
  cached = createClient(url, secretKey, { auth: { persistSession: false } });
  return cached;
}
