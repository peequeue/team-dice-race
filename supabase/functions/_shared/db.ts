// Direct Postgres access so resolution can run inside one transaction with an
// advisory lock. SUPABASE_DB_URL is provided to Edge Functions automatically.
import postgres from 'npm:postgres@3.4.5';
import { HttpError } from './http.ts';

export const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, {
  max: 2,
  prepare: false, // required for the Supabase connection pooler
  types: { date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x } },
});

export type Sql = typeof sql;

// ---- keys ------------------------------------------------------------------

export function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newSeed(): string {
  return newKey();
}

/** Constant-time string comparison for shared secrets. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- rate limiting -----------------------------------------------------------

/** Fixed one-minute windows. Throws 429 when the bucket is over its limit. */
export async function rateLimit(bucket: string, limit: number): Promise<void> {
  const [row] = await sql`
    insert into rate_limits (bucket, window_start, hits)
    values (${bucket}, date_trunc('minute', now()), 1)
    on conflict (bucket, window_start) do update set hits = rate_limits.hits + 1
    returning hits`;
  if (row.hits > limit) throw new HttpError(429, 'Slow down a bit and try again in a minute');
  if (Math.random() < 0.02) await sql`delete from rate_limits where window_start < now() - interval '1 hour'`;
}
