import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SECRET_KEY. Check .env.local locally and Vercel project env vars in production.',
  );
}

export const supabase = createClient(url, secretKey, {
  auth: { persistSession: false },
});
