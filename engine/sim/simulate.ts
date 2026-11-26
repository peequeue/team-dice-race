// Simulate whole seasons with random player behaviour to sanity-check
// season length (target 5 to 6 weeks) and Hell frequency (about once per season or two).
//   node sim/simulate.ts [runs]
import {
  createRng, DEFAULT_CONFIG, DEFAULT_SPEC, generateBoard, generateEventSequence, newPlayer, nextWeekday, resolveDay,
} from '../../supabase/functions/_shared/engine/index.ts';
import type { LockIn, PlayerState, SeasonConfig, Square, WyrQuestion } from '../../supabase/functions/_shared/engine/index.ts';
import type { SeasonLogEntry } from '../../supabase/functions/_shared/engine/awards.ts';
import type { BoardSpec } from '../../supabase/functions/_shared/engine/board.ts';

export interface SimOptions {
  lockInRate?: number; // chance a player locks in manually on a given day
  config?: SeasonConfig;
  maxDays?: number;
  spec?: Partial<BoardSpec>;
  quietOnly?: boolean;
  players?: number;
}

export function simulateSeason(seed: string, opts: SimOptions = {}) {
  const rng = createRng(seed);
  const config = { ...(opts.config ?? DEFAULT_CONFIG), boardSize: opts.spec?.size ?? DEFAULT_SPEC.size };
  const lockInRate = opts.lockInRate ?? 0.85;
  const maxDays = opts.maxDays ?? 200;

  let squares: Square[] = generateBoard(rng, opts.spec);
  let players: PlayerState[] = Array.from({ length: opts.players ?? 6 }, (_, i) => newPlayer(`p${i + 1}`, `Player ${i + 1}`));
  const questions: WyrQuestion[] = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, question: 'Q', optionA: 'A', optionB: 'B' }));
  const answers: Record<string, 'a' | 'b'> = Object.fromEntries(questions.map((q) => [q.id, rng.chance(0.5) ? 'a' : 'b']));
  let available = [...questions];

  const dates: string[] = [];
  let d = '2026-11-30';
  for (let i = 0; i < maxDays; i++) { dates.push(d); d = nextWeekday(d); }
  const events = generateEventSequence(dates, rng);

  const log: SeasonLogEntry[] = [];
  let winnerId: string | null = null;
  let days = 0;
  for (const date of dates) {
    days++;
    const lockIns: LockIn[] = players
      .filter(() => rng.chance(lockInRate))
      .map((p) => ({
        playerId: p.id,
        playPowerup: rng.chance(0.7),
        decisionChoice: p.pendingDecision ? (rng.chance(0.25) ? 'pass' : rng.pick(p.pendingDecision.options)) : null,
        wyrPick: rng.chance(0.5) ? 'a' : 'b',
        coinCall: rng.chance(0.5) ? 'heads' : 'tails',
      }));
    const r = resolveDay({
      date, eventKey: opts.quietOnly ? 'quiet' : events[date], config, players, squares, lockIns,
      wyrAvailable: available, wyrAnswers: answers,
    }, createRng(`${seed}:${date}`));
    players = r.players;
    squares = r.squares;
    available = available.filter((q) => !r.usedQuestionIds.includes(q.id));
    for (const e of r.log) log.push({ ...e, gameDate: date });
    if (r.winnerId) { winnerId = r.winnerId; break; }
  }
  return {
    days,
    winnerId,
    playerIds: players.map((p) => p.id),
    hellTrips: players.reduce((s, p) => s + p.hellVisits, 0),
    devilDeals: players.filter((p) => p.devilMarked).length,
    trapsHit: log.filter((e) => e.kind === 'trap').length,
    decisions: log.filter((e) => e.kind === 'decision_offer').length,
    log,
  };
}

function pct(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runs = Number(process.argv[2] ?? 2000);
  const results = Array.from({ length: runs }, (_, i) => simulateSeason(`sim-${i}`));
  const days = results.map((r) => r.days).sort((a, b) => a - b);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const hell = results.map((r) => r.hellTrips);
  console.log(`Seasons simulated:      ${runs}`);
  console.log(`Working days to finish: mean ${mean(days).toFixed(1)}, median ${pct(days, 0.5)}, p10 ${pct(days, 0.1)}, p90 ${pct(days, 0.9)}`);
  console.log(`  in weeks:             mean ${(mean(days) / 5).toFixed(1)}, p10 ${(pct(days, 0.1) / 5).toFixed(1)}, p90 ${(pct(days, 0.9) / 5).toFixed(1)}`);
  console.log(`Hell trips per season:  mean ${mean(hell).toFixed(2)}, seasons with none ${(100 * hell.filter((h) => h === 0).length / runs).toFixed(0)}%`);
  console.log(`Trap doors hit:         mean ${mean(results.map((r) => r.trapsHit)).toFixed(1)} per season`);
  console.log(`Decision offers:        mean ${(mean(results.map((r) => r.decisions)) / 6).toFixed(1)} per player`);
  console.log(`Devil's Deals taken:    mean ${mean(results.map((r) => r.devilDeals)).toFixed(2)} per season`);
}
