// End-of-season awards, derived only from the event log.
// Every player gets at least one award.
import type { LogEntry } from './types.ts';

export interface SeasonLogEntry extends LogEntry {
  gameDate: string;
}

export interface Award {
  award: string;
  playerId: string;
  detail: string;
}

interface Stats {
  traps: number;
  hell: number;
  gambles: number;
  passes: number;
  diceSum: number;
  diceCount: number;
  sixes: number;
  powerups: number;
  blocks: number;
  longestStreak: number;
  worstRank: number;
  finalRank: number;
  finalPos: number;
}

export function computeStats(playerIds: string[], log: SeasonLogEntry[]): Record<string, Stats> {
  const s: Record<string, Stats> = {};
  for (const id of playerIds) {
    s[id] = {
      traps: 0, hell: 0, gambles: 0, passes: 0, diceSum: 0, diceCount: 0, sixes: 0,
      powerups: 0, blocks: 0, longestStreak: 0, worstRank: 1, finalRank: playerIds.length, finalPos: 0,
    };
  }
  const streak: Record<string, number> = {};
  let days = 0;
  for (const e of log) {
    const st = e.playerId ? s[e.playerId] : undefined;
    switch (e.kind) {
      case 'trap': if (st) st.traps++; break;
      case 'shield_block': if (st) st.blocks++; break;
      case 'hell_sent': if (st) st.hell++; break;
      case 'powerup_gain': if (st) st.powerups++; break;
      case 'decision':
        if (st && !e.data.auto) (e.data.choice === 'pass' ? st.passes++ : st.gambles++);
        break;
      case 'dice':
        if (st && !e.data.double) {
          for (const d of e.data.dice as number[]) {
            st.diceSum += d; st.diceCount++;
            if (d === 6) st.sixes++;
          }
        }
        break;
      case 'turn_start':
        if (st && e.playerId) {
          streak[e.playerId] = e.data.manual ? (streak[e.playerId] ?? 0) + 1 : 0;
          st.longestStreak = Math.max(st.longestStreak, streak[e.playerId]);
        }
        break;
      case 'day_end': {
        days++;
        const pos = e.data.positions as Record<string, number>;
        for (const id of playerIds) {
          const rank = 1 + playerIds.filter((o) => (pos[o] ?? 0) > (pos[id] ?? 0)).length;
          if (days >= 5) s[id].worstRank = Math.max(s[id].worstRank, rank);
          s[id].finalRank = rank;
          s[id].finalPos = pos[id] ?? 0;
        }
        break;
      }
    }
  }
  return s;
}

type Rule = { award: string; score: (s: Stats) => number; detail: (s: Stats) => string; min?: number };

const avg = (s: Stats) => (s.diceCount ? s.diceSum / s.diceCount : 3.5);

const PRIMARY: Rule[] = [
  { award: 'Most Setbacks', score: (s) => s.traps, detail: (s) => `${s.traps} trap doors fallen through`, min: 1 },
  { award: 'Meeting Hell Regular', score: (s) => s.hell, detail: (s) => `${s.hell} trips to Meeting Hell`, min: 1 },
  { award: 'Biggest Comeback', score: (s) => s.worstRank - s.finalRank, detail: (s) => `From ${ordinal(s.worstRank)} to ${ordinal(s.finalRank)}`, min: 1 },
  { award: 'Unluckiest Roller', score: (s) => -avg(s), detail: (s) => `Average roll ${avg(s).toFixed(2)}` },
  { award: 'Risk Taker', score: (s) => s.gambles, detail: (s) => `${s.gambles} decisions taken`, min: 1 },
  { award: 'Plays It Safe', score: (s) => s.passes, detail: (s) => `${s.passes} passes`, min: 1 },
];

const FALLBACK: Rule[] = [
  { award: 'Luckiest Roller', score: (s) => avg(s), detail: (s) => `Average roll ${avg(s).toFixed(2)}` },
  { award: 'Six Machine', score: (s) => s.sixes, detail: (s) => `${s.sixes} sixes` },
  { award: 'Power Hoarder', score: (s) => s.powerups, detail: (s) => `${s.powerups} power-ups collected` },
  { award: 'Iron Streak', score: (s) => s.longestStreak, detail: (s) => `${s.longestStreak} lock-ins in a row` },
  { award: 'Time in Lieu Champion', score: (s) => s.blocks, detail: (s) => `${s.blocks} trap doors dodged on time in lieu` },
  { award: 'Steady Hand', score: (s) => -Math.abs(avg(s) - 3.5), detail: (s) => `Average roll ${avg(s).toFixed(2)}, bang on par` },
  { award: 'Good Sport', score: () => 0, detail: () => 'Turned up every day and copped it sweet' },
];

export function computeAwards(playerIds: string[], log: SeasonLogEntry[], winnerId: string | null): Award[] {
  const stats = computeStats(playerIds, log);
  const awards: Award[] = [];
  if (winnerId) awards.push({ award: 'Winner', playerId: winnerId, detail: 'First to Long Service Leave' });

  for (const rule of PRIMARY) {
    const scores = playerIds.map((id) => ({ id, v: rule.score(stats[id]) }));
    const best = Math.max(...scores.map((x) => x.v));
    if (rule.min !== undefined && best < rule.min) continue;
    for (const x of scores.filter((x) => x.v === best)) {
      awards.push({ award: rule.award, playerId: x.id, detail: rule.detail(stats[x.id]) });
    }
  }

  // Top up anyone without an award with the fallback they rank best in.
  const used = new Set<string>();
  for (const id of playerIds) {
    if (awards.some((a) => a.playerId === id)) continue;
    const others = playerIds.filter((o) => o !== id);
    let pick: Rule | null = null;
    let pickRank = Infinity;
    for (const rule of FALLBACK) {
      if (used.has(rule.award) && rule.award !== 'Good Sport') continue;
      const mine = rule.score(stats[id]);
      const rank = 1 + others.filter((o) => rule.score(stats[o]) > mine).length;
      if (rank < pickRank) { pick = rule; pickRank = rank; }
    }
    pick = pick ?? FALLBACK[FALLBACK.length - 1];
    used.add(pick.award);
    awards.push({ award: pick.award, playerId: id, detail: pick.detail(stats[id]) });
  }
  return awards;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
