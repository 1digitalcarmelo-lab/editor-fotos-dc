import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { handleLicense } from './handler.ts';

function key(map: string, fallback: string) {
  try { const parsed = JSON.parse(Deno.env.get(map) || '{}'); if (parsed.default) return String(parsed.default); } catch { /* clave heredada */ }
  return Deno.env.get(fallback) || '';
}
Deno.serve(req => handleLicense(req, {
  url: Deno.env.get('SUPABASE_URL') || '',
  publicKey: key('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),
  secretKey: key('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY'),
  createClient,
}));

