// Resolves one game date. Pure function: state in, state plus ordered event log out.
// The replay is rendered entirely from the log, so every visible step is logged.
import type { Rng } from './rng.ts';
import { getEvent, type DailyEvent, type EventContext } from './events.ts';
import type {
  DayInput, DayResult, DecisionOption, LockIn, LogEntry, PendingDecision,
  PlayerState, PowerUp, Square, WyrQuestion,
} from './types.ts';

const NORMAL_DECISIONS: DecisionOption[] = ['two_up', 'wyr', 'book_truck', 'consignment'];
export const SURVEY_MOVE = 5;

/** Hell players sit behind the start line for ordering purposes. */
export function effectivePosition(p: PlayerState): number {
  return p.inHell ? -1 : p.position;
}

export function resolveDay(input: DayInput, rng: Rng): DayResult {
  const players = input.players.map((p) => structuredClone(p));
  const squares = input.squares.map((s) => structuredClone(s));
  const event = getEvent(input.eventKey);
  const boardSize = input.config.boardSize;
  const lockIns = new Map<string, LockIn>(input.lockIns.map((l) => [l.playerId, l]));
  const wyrPool: WyrQuestion[] = [...input.wyrAvailable];
  const usedQuestionIds: string[] = [];
  const log: LogEntry[] = [];
  let seq = 0;
  const emit = (playerId: string | null, kind: string, data: Record<string, unknown> = {}) =>
    log.push({ seq: seq++, playerId, kind, data });

  let winnerId: string | null = null;
  const byId = new Map(players.map((p) => [p.id, p]));
  const active = () => players.filter((p) => !p.finishedOn);

  // Order: last place to first. Ties broken randomly.
  const order = rng
    .shuffle(active())
    .sort((a, b) => effectivePosition(a) - effectivePosition(b));

  // Event context uses on-board positions at the start of the day.
  const startPos = new Map(order.map((p) => [p.id, effectivePosition(p)]));
  const onBoard = order.filter((p) => !p.inHell).map((p) => p.position);
  const lowest = onBoard.length ? Math.min(...onBoard) : 0;
  const highest = onBoard.length ? Math.max(...onBoard) : 0;

  emit(null, 'day_start', {
    date: input.date,
    event: event.key,
    order: order.map((p) => p.id),
    positions: Object.fromEntries(players.map((p) => [p.id, effectivePosition(p)])),
  });

  /** Passive movement: never triggers a square. Can finish the race. */
  const movePassive = (p: PlayerState, delta: number, reason: string) => {
    if (p.inHell || p.finishedOn || delta === 0) return;
    const from = p.position;
    p.position = Math.max(0, p.position + delta);
    emit(p.id, 'move', { from, to: p.position, passive: true, reason });
    checkFinish(p);
  };

  const checkFinish = (p: PlayerState) => {
    if (p.position > boardSize && !p.finishedOn) {
      p.finishedOn = input.date;
      emit(p.id, 'finish', { winner: winnerId === null });
      if (winnerId === null) winnerId = p.id;
    }
  };

  const grantPowerup = (p: PlayerState, source: string, fixed?: PowerUp) => {
    if (p.heldPowerup) {
      emit(p.id, 'powerup_full', { source, held: p.heldPowerup });
      return false;
    }
    const pool: PowerUp[] = ['double_dice', 'shield', 'lucky_roll'];
    if (input.config.swapEnabled) pool.push('swap');
    p.heldPowerup = fixed ?? rng.pick(pool);
    emit(p.id, 'powerup_gain', { source, powerup: p.heldPowerup });
    return true;
  };

  const drawOffer = (): [DecisionOption, DecisionOption] => {
    const normals = NORMAL_DECISIONS.filter((o) => o !== 'wyr' || wyrPool.length > 0);
    if (rng.chance(input.config.devilsDealOfferRate)) {
      return rng.shuffle(['devils_deal', rng.pick(normals)]) as [DecisionOption, DecisionOption];
    }
    const [a, b] = rng.shuffle(normals);
    return [a, b];
  };

  const rigged: Record<string, number[]> = structuredClone(input.riggedDice ?? {});
  const rngFor = (id: string): Rng => {
    const queue = rigged[id];
    if (!queue?.length) return rng;
    return { ...rng, die: () => (queue.length ? queue.shift()! : rng.die()) };
  };

  for (const p of order) {
    if (p.finishedOn) continue;
    const prng = rngFor(p.id);
    const lock = lockIns.get(p.id);
    const manual = !!lock;
    emit(p.id, 'turn_start', { position: effectivePosition(p), manual, inHell: p.inHell });

    // 1. Pending decision (passive movement, resolved before the main roll).
    let bookTruck = false;
    if (p.pendingDecision) {
      const pd = p.pendingDecision;
      p.pendingDecision = null;
      const choice = manual ? lock!.decisionChoice : 'pass';
      const valid = choice && (choice === 'pass' || pd.options.includes(choice));
      const picked = valid ? choice! : 'pass';
      emit(p.id, 'decision', { choice: picked, options: pd.options, auto: !manual });
      switch (picked) {
        case 'two_up': {
          const call = lock?.coinCall ?? 'heads';
          const heads = rng.chance(0.5);
          const won = (heads ? 'heads' : 'tails') === call;
          emit(p.id, 'two_up', { heads, call, won, amount: pd.triggerMove * 2 });
          movePassive(p, (won ? 1 : -1) * pd.triggerMove * 2, 'two_up');
          break;
        }
        case 'wyr': {
          const q = pd.wyr!;
          const answer = input.wyrAnswers[q.id];
          const pick = lock?.wyrPick;
          const correct = !!pick && pick === answer;
          const ahead = active().filter((o) => o.id !== p.id && !o.inHell && o.position > p.position);
          const target = correct && ahead.length ? rng.pick(ahead) : null;
          emit(p.id, 'wyr', { questionId: q.id, question: q.question, optionA: q.optionA, optionB: q.optionB, pick: pick ?? null, answer, correct, targetId: target?.id ?? null, candidates: correct ? ahead.map((o) => o.id) : [] });
          if (correct && target) movePassive(target, -3, 'wyr_hit');
          if (!correct) movePassive(p, -2, 'wyr_wrong');
          break;
        }
        case 'book_truck':
          bookTruck = true;
          break;
        case 'consignment': {
          if (rng.chance(2 / 3)) {
            emit(p.id, 'consignment', { result: 'powerup' });
            if (!grantPowerup(p, 'consignment')) movePassive(p, 3, 'consignment_bonus');
          } else {
            p.curse = { kind: 'lame_steer', daysLeft: 2 };
            emit(p.id, 'consignment', { result: 'curse', curse: p.curse.kind });
          }
          break;
        }
        case 'devils_deal':
          p.devilMarked = true;
          emit(p.id, 'devils_deal', {});
          movePassive(p, 10, 'devils_deal');
          break;
      }
    }

    if (p.finishedOn) {
      updateStreak(p, manual);
      continue;
    }

    // 2. Hell: one roll, a six escapes to square 1.
    if (p.inHell) {
      const d = prng.die();
      const escaped = d === 6;
      emit(p.id, 'hell_roll', { die: d, escaped });
      if (escaped) {
        p.inHell = false;
        p.position = 1;
        emit(p.id, 'move', { from: -1, to: 1, passive: true, reason: 'hell_escape' });
      }
      updateStreak(p, manual);
      continue;
    }

    // 3. Main move.
    // Shield is passive, so "playing" it does nothing. Swap is applied after the move.
    const played = manual && lock!.playPowerup && p.heldPowerup !== 'shield' ? p.heldPowerup : null;
    let usedPowerup: PowerUp | null = null;
    let move = 0;
    let dice: number[] = [];
    let stayPut = false;

    if (p.nextRoll === 'glass_ceiling') {
      // No main move at all today. Played power-ups are not used. Work From Home is wasted.
      p.nextRoll = null;
      stayPut = true;
      emit(p.id, 'glass_ceiling', { wastedTruck: bookTruck });
    } else if (bookTruck) {
      move = 4;
      emit(p.id, 'book_truck', { move });
    } else if (p.nextRoll === 'cpi') {
      // Exactly 4, no dice: no sixes, no Hell, no event or curse modifiers.
      p.nextRoll = null;
      move = 4;
      emit(p.id, 'cpi_roll', { move });
    } else {
      const start = startPos.get(p.id)!;
      const ctx: EventContext = { isLast: start === lowest, isLeader: start === highest };
      const rollPowerup = played === 'double_dice' || played === 'lucky_roll' ? played : null;
      const roll = rollMain(p, rollPowerup, event, ctx, prng);
      dice = roll.dice;
      usedPowerup = roll.usedPowerup;
      emit(p.id, 'dice', { dice, total: roll.hell ? null : roll.total, lucky: roll.luckyReroll, luckyFrom: roll.luckyFrom ?? null, double: usedPowerup === 'double_dice', event: event.key });
      if (usedPowerup) {
        p.heldPowerup = null;
        emit(p.id, 'powerup_used', { powerup: usedPowerup });
      }
      if (roll.hell) {
        p.inHell = true;
        p.hellVisits++;
        const from = p.position;
        p.position = 0;
        emit(p.id, 'hell_sent', { from, sixes: roll.sixes });
        updateStreak(p, manual);
        continue;
      }
      move = roll.total;
      if (p.curse) {
        const before = move;
        move = Math.ceil(move / 2);
        p.curse.daysLeft--;
        emit(p.id, 'curse', { kind: p.curse.kind, before, after: move, daysLeft: p.curse.daysLeft });
        if (p.curse.daysLeft <= 0) p.curse = null;
      }
    }

    // 4. Move and trigger the landing square.
    if (!stayPut) {
      const from = p.position;
      p.position = from + move;
      emit(p.id, 'move', { from, to: p.position, passive: false, amount: move });
      checkFinish(p);
      if (!p.finishedOn) landOn(p, squares[p.position - 1], move);
    }

    // 5. Swap (passive for both).
    if (played === 'swap' && input.config.swapEnabled && !p.finishedOn && !p.inHell) {
      p.heldPowerup = null;
      emit(p.id, 'powerup_used', { powerup: 'swap' });
      const ahead = active().filter((o) => o.id !== p.id && !o.inHell && o.position > p.position);
      if (ahead.length) {
        const nearest = Math.min(...ahead.map((o) => o.position));
        const target = rng.pick(ahead.filter((o) => o.position === nearest));
        const mine = p.position;
        emit(p.id, 'swap', { targetId: target.id, from: mine, to: target.position });
        const a = { from: mine, to: target.position };
        p.position = target.position;
        target.position = mine;
        emit(p.id, 'move', { ...a, passive: true, reason: 'swap' });
        emit(target.id, 'move', { from: a.to, to: mine, passive: true, reason: 'swapped' });
      } else {
        emit(p.id, 'swap', { targetId: null });
      }
    }

    // Host-granted bonus rolls: one die each, passive.
    while (p.bonusRolls > 0 && !p.finishedOn) {
      p.bonusRolls--;
      const d = rng.die();
      emit(p.id, 'bonus_roll', { die: d });
      movePassive(p, d, 'bonus_roll');
    }

    // 6. Streak.
    updateStreak(p, manual);
  }

  emit(null, 'day_end', {
    positions: Object.fromEntries(players.map((p) => [p.id, p.finishedOn ? boardSize + 1 : effectivePosition(p)])),
    winnerId,
  });

  return { players, squares, usedQuestionIds, log, winnerId };

  // ---- helpers that need closure state ----

  function landOn(p: PlayerState, sq: Square, move: number) {
    if (sq.type === 'trap') {
      if (event.trapsShut) {
        emit(p.id, 'trap_shut', { idx: sq.idx });
        return;
      }
      const firstReveal = !sq.revealed;
      sq.revealed = true;
      emit(p.id, 'trap', { idx: sq.idx, drop: sq.payload!.drop, text: sq.payload!.text, effect: sq.payload!.effect ?? null, firstReveal });
      if (p.heldPowerup === 'shield') {
        p.heldPowerup = null;
        emit(p.id, 'shield_block', { idx: sq.idx });
      } else if (sq.payload!.effect === 'glass_ceiling') {
        p.nextRoll = 'glass_ceiling';
      } else {
        movePassive(p, -sq.payload!.drop!, 'trap');
      }
    } else if (sq.type === 'boost') {
      const firstReveal = !sq.revealed;
      sq.revealed = true;
      emit(p.id, 'boost', { idx: sq.idx, gain: sq.payload!.gain, text: sq.payload!.text, effect: sq.payload!.effect ?? null, firstReveal });
      if (sq.payload!.effect === 'cpi') p.nextRoll = 'cpi';
      else movePassive(p, sq.payload!.gain!, 'boost');
    } else if (sq.type === 'survey') {
      const positive = rng.chance(0.5);
      emit(p.id, 'survey', { idx: sq.idx, positive, amount: SURVEY_MOVE });
      movePassive(p, positive ? SURVEY_MOVE : -SURVEY_MOVE, positive ? 'survey_good' : 'survey_bad');
    } else if (sq.type === 'powerup') {
      grantPowerup(p, 'square', sq.payload?.powerup);
    } else if (sq.type === 'decision') {
      const options = drawOffer();
      const pd: PendingDecision = { options, triggerMove: move, offeredOn: input.date };
      if (options.includes('wyr')) {
        const q = rng.pick(wyrPool);
        wyrPool.splice(wyrPool.indexOf(q), 1);
        usedQuestionIds.push(q.id);
        pd.wyr = q;
      }
      p.pendingDecision = pd;
      emit(p.id, 'decision_offer', { idx: sq.idx, options, questionId: pd.wyr?.id ?? null });
    }
  }

  function updateStreak(p: PlayerState, manual: boolean) {
    if (!manual) {
      if (p.streak > 0) emit(p.id, 'streak_reset', { was: p.streak });
      p.streak = 0;
      return;
    }
    p.streak++;
    if (p.streak % 5 === 0) {
      emit(p.id, 'streak_reward', { streak: p.streak });
      if (!grantPowerup(p, 'streak')) movePassive(p, 3, 'streak_bonus');
    }
  }
}

interface MainRoll {
  dice: number[];
  total: number;
  sixes: number;
  hell: boolean;
  luckyReroll: boolean;
  luckyFrom?: number | null;
  usedPowerup: PowerUp | null;
}

export function rollMain(
  p: PlayerState,
  played: PowerUp | null,
  event: DailyEvent,
  ctx: EventContext,
  rng: Rng,
): MainRoll {
  const face = event.face ?? ((d: number) => d);
  const finish = (dice: number[], extra: Partial<MainRoll>): MainRoll => {
    let total = dice.reduce((s, d) => s + face(d), 0);
    if (event.total) total = event.total(total, ctx);
    return { dice, total, sixes: 0, hell: false, luckyReroll: false, usedPowerup: played, ...extra };
  };

  if (played === 'double_dice') {
    return finish([rng.die(), rng.die()], {});
  }

  const hellAt = p.devilMarked ? 2 : 3;
  const rerollSixes = event.sixesRollAgain !== false;
  const dice: number[] = [];
  let luckyReroll = false;
  let luckyFrom: number | null = null;
  let run = 0;
  for (;;) {
    let d = rng.die();
    if (played === 'lucky_roll' && dice.length === 0 && d <= 2) {
      luckyFrom = d;
      luckyReroll = true;
      d = rng.die();
    }
    dice.push(d);
    if (d === 6 && rerollSixes) {
      run++;
      if (run >= hellAt) {
        return { dice, total: 0, sixes: run, hell: true, luckyReroll, luckyFrom, usedPowerup: played };
      }
      continue;
    }
    break;
  }
  return finish(dice, { luckyReroll, luckyFrom, sixes: run });
}
