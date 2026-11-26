// Season-level helpers shared by the Edge Functions and the simulator.
import { dueDates } from './time.ts';
import type { PlayerState } from './types.ts';

export function newPlayer(id: string, nickname: string): PlayerState {
  return {
    id, nickname, position: 0, inHell: false, hellVisits: 0, devilMarked: false,
    heldPowerup: null, curse: null, streak: 0, pendingDecision: null, bonusRolls: 0, nextRoll: null, finishedOn: null,
  };
}

export interface ResolutionPlan {
  resolve: string[]; // oldest first
  skip: string[]; // recorded as skipped (season paused when the job ran)
}

/**
 * Decide what the hourly job should do. Idempotent: dates with a resolutions row
 * (resolved or skipped) are never touched again. Missed runs are caught up in order.
 */
export function planResolution(
  seasonStart: string,
  done: Set<string>,
  paused: boolean,
  finished: boolean,
  now: Date,
): ResolutionPlan {
  if (finished) return { resolve: [], skip: [] };
  const due = dueDates(seasonStart, done, now);
  return paused ? { resolve: [], skip: due } : { resolve: due, skip: [] };
}
