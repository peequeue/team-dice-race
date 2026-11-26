// Board generation. The board is data (stored in `squares`), so the host can
// regenerate or hand-edit it between seasons. This is the default generator.
import type { Rng } from './rng.ts';
import type { Square, SquareType } from './types.ts';

export const ZONES = [
  { key: 'onboarding', name: 'Onboarding', from: 1, to: 20 },
  { key: 'open_plan', name: 'Open Plan', from: 21, to: 40 },
  { key: 'meeting_rooms', name: 'Meeting Rooms', from: 41, to: 60 },
  { key: 'middle_management', name: 'Dedicated Desk', from: 61, to: 80 },
  { key: 'corner_office', name: 'Dedicated Car Space', from: 81, to: 100 },
] as const;

/** Hidden setbacks (trap doors). Each board uses each text at most once. */
export const TRAP_TEXTS = [
  'Missed your KPIs',
  'Replied all to the entire company',
  'Forgot to complete your anti-bribery and corruption training',
  'Laptop forced a 2 hour update',
  'Mistyped your password three times',
  'Sent the draft to the client',
  'Mandatory brainstorming workshop',
  'Left yourself unmuted on the all-staff',
  'Forgot to submit your credit card expenses!',
  'Had a run-in with someone with a different DISC profile',
];

/** Hidden good surprises (boosts). No real names: the repo is public. */
export const BOOST_TEXTS = [
  'Positive client feedback',
  'R&R award',
  'Shout-out at the all-staff',
  'Meeting cancelled',
  'Project delivered early',
  'Catering leftovers in the kitchen',
  'Boss is on leave',
  'Inbox zero',
];

export interface BoardSpec {
  size: number; // squares before the finish
  traps: number;
  boosts: number;
  surveys: number;
  powerups: number;
  decisions: number;
  dropMin: number;
  dropMax: number;
  gainMin: number;
  gainMax: number;
}

export const DEFAULT_SPEC: BoardSpec = {
  size: 90, traps: 6, boosts: 5, surveys: 4, powerups: 6, decisions: 10, dropMin: 5, dropMax: 10, gainMin: 3, gainMax: 6,
};

/** Zones scaled to the board size: five equal bands. */
export function zonesFor(size: number) {
  const band = size / ZONES.length;
  return ZONES.map((z, i) => ({ ...z, from: Math.round(i * band) + 1, to: Math.round((i + 1) * band) }));
}

export function zoneOf(idx: number, size = 100) {
  const zs = zonesFor(size);
  return zs.find((z) => idx >= z.from && idx <= z.to) ?? zs[zs.length - 1];
}

/**
 * Spread special squares so every zone gets some of each type, no traps in
 * squares 1 to 5 (traps and boosts), no two specials adjacent where avoidable, and the last square stays normal.
 */
export function generateBoard(rng: Rng, partial: Partial<BoardSpec> = {}): Square[] {
  const spec = { ...DEFAULT_SPEC, ...partial };
  const zones = zonesFor(spec.size);
  const squares: Square[] = [];
  for (let i = 1; i <= spec.size; i++) squares.push({ idx: i, type: 'normal', revealed: true });

  const taken = new Set<number>([spec.size]);
  const trapTexts = rng.shuffle(TRAP_TEXTS);
  const boostTexts = rng.shuffle(BOOST_TEXTS);
  const place = (type: SquareType, count: number) => {
    // round-robin across zones, starting at a random zone
    const start = rng.int(0, zones.length - 1);
    for (let n = 0; n < count; n++) {
      const zone = zones[(start + n) % zones.length];
      const from = type === 'trap' || type === 'boost' ? Math.max(zone.from, 6) : zone.from;
      let candidates: number[] = [];
      for (let i = from; i <= zone.to; i++) {
        if (!taken.has(i) && !taken.has(i - 1) && !taken.has(i + 1)) candidates.push(i);
      }
      if (candidates.length === 0) {
        for (let i = from; i <= zone.to; i++) if (!taken.has(i)) candidates.push(i);
      }
      const idx = rng.pick(candidates);
      taken.add(idx);
      const sq = squares[idx - 1];
      sq.type = type;
      if (type === 'trap') {
        sq.revealed = false;
        sq.payload = n === 0
          ? { drop: 0, text: 'Consult with industry', effect: 'glass_ceiling' }
          : { drop: rng.int(spec.dropMin, spec.dropMax), text: trapTexts[n % trapTexts.length] };
      } else if (type === 'boost') {
        sq.revealed = false;
        sq.payload = n === 0
          ? { gain: 0, text: "Industry agrees in principle, won't put it in writing", effect: 'cpi' }
          : { gain: rng.int(spec.gainMin, spec.gainMax), text: boostTexts[n % boostTexts.length] };
      }
    }
  };

  place('trap', spec.traps);
  place('boost', spec.boosts);
  place('survey', spec.surveys);
  place('decision', spec.decisions);
  place('powerup', spec.powerups);
  return squares;
}
