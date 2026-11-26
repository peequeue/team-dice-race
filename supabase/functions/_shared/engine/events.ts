// Daily events: one global modifier per game date, pre-generated at season setup.
import type { Rng } from './rng.ts';

export interface EventContext {
  isLast: boolean; // lowest on-board position at the start of the day
  isLeader: boolean; // highest on-board position at the start of the day
}

export interface DailyEvent {
  key: string;
  name: string;
  text: string;
  weight: number;
  sixesRollAgain?: boolean; // default true
  trapsShut?: boolean; // trap doors do not trigger today
  face?: (die: number) => number; // value a single die is worth
  total?: (total: number, ctx: EventContext) => number; // adjust the summed move
}

export const EVENTS: DailyEvent[] = [
  { key: 'quiet', name: 'Business as Usual', text: 'Nothing special today. Everyone rolls as normal.', weight: 8 },
  {
    key: 'drought', name: 'Budget Freeze', text: 'Belts are tightening. Every roll moves one square less today, but never less than one.', weight: 1,
    total: (t) => Math.max(1, t - 1),
  },
  {
    key: 'muster', name: 'All Hands', text: 'The whole company is pulling together. Everyone gets two bonus squares on top of their roll.', weight: 1,
    total: (t) => t + 2,
  },
  {
    key: 'sale_day', name: 'End of Financial Year', text: 'Everything is due at once. Any six rolled today is worth 12 squares.', weight: 1,
    face: (d) => (d === 6 ? 12 : d),
  },
  {
    key: 'big_wet', name: 'System Outage', text: "The network is down and nothing works properly. Nobody moves more than 6 squares today, however well they roll.", weight: 1,
    total: (t) => Math.min(6, t),
  },
  {
    key: 'good_season', name: 'Morning Tea', text: 'Someone brought in a cake and spirits are up. Any 1 or 2 rolled today counts as a 3.', weight: 1,
    face: (d) => (d <= 2 ? 3 : d),
  },
  {
    key: 'back_of_mob', name: 'Mentoring Day', text: 'Whoever is in last place gets some coaching and a 4 square boost today.', weight: 1,
    total: (t, c) => (c.isLast ? t + 4 : t),
  },
  {
    key: 'audit', name: 'Performance Review', text: "The leader hasn't submitted their quarterly check-in! They lose 2 squares off their roll today, but always move at least one.", weight: 1,
    total: (t, c) => (c.isLeader ? Math.max(1, t - 2) : t),
  },
  {
    key: 'odds_on', name: 'Casual Friday', text: 'Everyone is relaxed. Every 1, 3 or 5 rolled is worth one extra square.', weight: 1,
    face: (d) => (d % 2 === 1 ? d + 1 : d),
  },
  {
    key: 'gates_shut', name: 'Change Freeze', text: 'Nothing is allowed to change today, including setbacks. Land on a trap door and nothing happens.', weight: 1,
    trapsShut: true,
  },
  {
    key: 'fair_dinkum', name: 'Hard Stop at 5', text: "Everyone is out the door on time. Sixes don't roll again today, so nobody can be dragged into Meeting Hell.", weight: 1,
    sixesRollAgain: false,
  },
  {
    key: 'road_train', name: 'Hackathon', text: 'Momentum is everything today. Any move over 4 squares gets 2 extra.', weight: 1,
    total: (t) => (t > 4 ? t + 2 : t),
  },
];

const BY_KEY = new Map(EVENTS.map((e) => [e.key, e]));

export function getEvent(key: string): DailyEvent {
  const e = BY_KEY.get(key);
  if (!e) throw new Error(`Unknown event: ${key}`);
  return e;
}

/** Pre-generate a season's events. No special event repeats on consecutive days. */
export function generateEventSequence(dates: string[], rng: Rng): Record<string, string> {
  const out: Record<string, string> = {};
  let prev = '';
  for (const date of dates) {
    let key = '';
    do {
      key = weightedPick(rng);
    } while (key !== 'quiet' && key === prev);
    out[date] = key;
    prev = key;
  }
  return out;
}

function weightedPick(rng: Rng): string {
  const total = EVENTS.reduce((s, e) => s + e.weight, 0);
  let r = rng.next() * total;
  for (const e of EVENTS) {
    r -= e.weight;
    if (r < 0) return e.key;
  }
  return EVENTS[0].key;
}
