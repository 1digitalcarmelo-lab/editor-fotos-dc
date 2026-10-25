import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm";

export const SUPABASE_URL =
  "https://rkkulnehklzqqmffvaqz.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_tKfKztMCb7iwDEIUdrgszA_qzPSPLZo";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

