// HTTP helpers shared by all Edge Functions.

const ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';

export const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** Wraps a handler with CORS preflight, JSON parsing and error mapping. */
export function serve(handler: (body: Record<string, unknown>, req: Request) => Promise<unknown>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    try {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      return json(await handler(body, req));
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Something went wrong' }, 500);
    }
  });
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
}
