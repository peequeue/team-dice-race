// Called hourly on weekdays by pg_cron. Resolves any game dates whose 4pm
// Sydney reveal has passed. Idempotent: calling it again does nothing new.
import { serve, HttpError } from '../_shared/http.ts';
import { safeEqual } from '../_shared/db.ts';
import { runResolution } from '../_shared/store.ts';

serve(async (_body, req) => {
  const secret = Deno.env.get('CRON_SECRET') ?? '';
  const given = req.headers.get('x-cron-secret') ?? '';
  if (!secret || !safeEqual(given, secret)) throw new HttpError(401, 'Not allowed');
  const done = await runResolution();
  return { ok: true, done };
});
