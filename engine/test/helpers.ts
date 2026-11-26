import { DEFAULT_CONFIG, newPlayer } from '../../supabase/functions/_shared/engine/index.ts';
import type { DayInput, LockIn, PlayerState, Square } from '../../supabase/functions/_shared/engine/index.ts';

export function plainBoard(overrides: Partial<Record<number, Partial<Square>>> = {}): Square[] {
  const out: Square[] = [];
  for (let i = 1; i <= 100; i++) out.push({ idx: i, type: 'normal', revealed: true, ...(overrides[i] ?? {}) } as Square);
  return out;
}

export function player(id: string, extra: Partial<PlayerState> = {}): PlayerState {
  return { ...newPlayer(id, id.toUpperCase()), ...extra };
}

export function day(players: PlayerState[], opts: Partial<DayInput> = {}): DayInput {
  return {
    date: '2026-12-01',
    eventKey: 'quiet',
    config: DEFAULT_CONFIG,
    players,
    squares: plainBoard(),
    lockIns: players.map((p): LockIn => ({ playerId: p.id, playPowerup: false, decisionChoice: null })),
    wyrAvailable: [],
    wyrAnswers: {},
    ...opts,
  };
}

export const lock = (playerId: string, extra: Partial<LockIn> = {}): LockIn => ({
  playerId, playPowerup: false, decisionChoice: null, ...extra,
});

export const kinds = (log: { kind: string; playerId: string | null }[], id?: string) =>
  log.filter((e) => !id || e.playerId === id).map((e) => e.kind);
