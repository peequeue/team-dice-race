// Core types for the Team Dice Race engine.
// The engine is pure: no I/O, no clock, no Math.random. Everything random comes
// from an injected Rng so tests and replays are reproducible.

export type PowerUp = 'double_dice' | 'shield' | 'lucky_roll' | 'swap';

export type DecisionOption =
  | 'two_up'
  | 'wyr'
  | 'book_truck'
  | 'consignment'
  | 'devils_deal';

export type DecisionChoice = DecisionOption | 'pass';

export type SquareType = 'normal' | 'trap' | 'boost' | 'survey' | 'powerup' | 'decision';

export interface Square {
  idx: number; // 1..100
  type: SquareType;
  payload?: {
    drop?: number; // trap doors: squares to drop back (5 to 10)
    gain?: number; // boosts: squares forward (3 to 6)
    effect?: 'cpi' | 'glass_ceiling'; // instead of moving now, changes the next main move
    text?: string; // trap doors and boosts: flavour text
    powerup?: PowerUp; // power-up squares: fixed power-up, otherwise random
  };
  revealed: boolean; // only meaningful for trap doors and boosts (hidden until landed on)
}

export interface Curse {
  kind: 'lame_steer';
  daysLeft: number;
}

export interface WyrQuestion {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
}

export interface PendingDecision {
  options: [DecisionOption, DecisionOption];
  triggerMove: number; // the main move that landed the player here (for Two-Up)
  wyr?: WyrQuestion; // attached when one of the options is 1:1 time (would you rather)
  offeredOn: string; // game date
}

export interface PlayerState {
  id: string;
  nickname: string;
  position: number; // 0 = start line, 1..100 = squares, >100 = finished
  inHell: boolean;
  hellVisits: number;
  devilMarked: boolean;
  heldPowerup: PowerUp | null;
  curse: Curse | null;
  streak: number;
  pendingDecision: PendingDecision | null;
  bonusRolls: number; // granted by the host, resolved as passive moves
  nextRoll: 'cpi' | 'glass_ceiling' | null; // set by a hidden square, applies to the next main move
  finishedOn: string | null;
}

export interface LockIn {
  playerId: string;
  playPowerup: boolean;
  decisionChoice: DecisionChoice | null;
  wyrPick?: 'a' | 'b';
  coinCall?: 'heads' | 'tails'; // Two-Up
}

export interface SeasonConfig {
  boardSize: number; // 100
  swapEnabled: boolean;
  devilsDealOfferRate: number; // chance a decision offer includes Devil's Deal
}

export const DEFAULT_CONFIG: SeasonConfig = {
  boardSize: 90,
  swapEnabled: false,
  devilsDealOfferRate: 1 / 8,
};

export interface DayInput {
  date: string; // YYYY-MM-DD, Australia/Sydney game date
  eventKey: string;
  config: SeasonConfig;
  players: PlayerState[];
  squares: Square[];
  lockIns: LockIn[]; // manual lock-ins only; anyone missing is auto-rolled
  wyrAvailable: WyrQuestion[]; // unused this season
  wyrAnswers: Record<string, 'a' | 'b'>; // answers for questions currently attached to pending decisions
  /** Demo test lab and tests only: dice values a player's own rolls take first. The server never sets this. */
  riggedDice?: Record<string, number[]>;
}

export interface LogEntry {
  seq: number;
  playerId: string | null;
  kind: string;
  data: Record<string, unknown>;
}

export interface DayResult {
  players: PlayerState[];
  squares: Square[];
  usedQuestionIds: string[];
  log: LogEntry[];
  winnerId: string | null;
}
