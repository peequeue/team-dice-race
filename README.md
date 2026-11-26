# Team Dice Race

A daily, 16-bit style board game race for a small team. Players lock in before 4pm Sydney time, the server rolls for everyone at 4pm, and everyone watches the replay.

## Layout

```
supabase/functions/_shared/engine/
                        Pure TypeScript rules engine. No I/O, no clock, injected RNG.
    types.ts            State, lock-in and log types
    rng.ts              Seeded RNG and a scripted-dice test RNG
    board.ts            Board generator (zones, trap doors, specials)
    events.ts           Daily events and season sequence generator
    content.ts          Display names and flavour text
    resolve.ts          resolveDay(): one game date in, new state and event log out
    time.ts             Sydney calendar, 4pm reveal, DST-safe due-date logic
    season.ts           New players, resolution planning (idempotent, catch-up, pause)
    awards.ts           End-of-season awards from the event log
supabase/functions/
  _shared/              http, db (Postgres, keys, rate limits), store (row mapping, transactional resolver)
  resolve/              Hourly cron target. Resolves due dates. Needs the cron secret.
  play/                 Player endpoint: state, lockin, replay, hall
  admin/                Host endpoint: bootstrap, seasons, links, pause, WYR, board, awards
supabase/migrations/    0001 schema (RLS locked down), 0002 hourly pg_cron trigger
engine/
  test/                 node:test suites (seeded RNG), plus an end-to-end Deno script
  sim/simulate.ts       Full-season simulator for length and Hell frequency
web/                    Static front end for GitHub Pages (pass after the functions)
docs/decisions.md       How ambiguous rules were interpreted
docs/CHANGES.md         Everything that differs from the original brief, for review
.github/workflows/      Runs the engine tests on every push
```

The engine runs unchanged in Deno (Edge Functions) and Node 22+ (tests). Imports use `.ts` extensions and no TypeScript-only syntax, so no build step is needed.

## Running the tests

Tests run automatically on GitHub (Actions tab) on every push. Locally, with Node 22 or later:

```
cd engine
npm test
npm run sim
```

## Privacy

This repo is public. It must never contain player nicknames, Would You Rather questions or answers, or any key other than the Supabase anon key. All of that lives in the database and is entered through the admin view.
