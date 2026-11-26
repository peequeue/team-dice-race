import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, resolveDay, scriptedRng, DEFAULT_CONFIG } from '../../supabase/functions/_shared/engine/index.ts';
import type { PendingDecision } from '../../supabase/functions/_shared/engine/index.ts';
import { day, kinds, lock, plainBoard, player } from './helpers.ts';

const pending = (options: PendingDecision['options'], triggerMove = 3, extra: Partial<PendingDecision> = {}): PendingDecision =>
  ({ options, triggerMove, offeredOn: '2026-11-30', ...extra });

test('normal roll moves forward', () => {
  const r = resolveDay(day([player('a')]), scriptedRng([4]));
  assert.equal(r.players[0].position, 4);
});

test('a six rolls again and accumulates', () => {
  const r = resolveDay(day([player('a')]), scriptedRng([6, 6, 3]));
  assert.equal(r.players[0].position, 15);
});

test('three sixes in a row sends you to Hell and voids the move', () => {
  const r = resolveDay(day([player('a', { position: 40 })]), scriptedRng([6, 6, 6]));
  const a = r.players[0];
  assert.equal(a.inHell, true);
  assert.equal(a.position, 0);
  assert.equal(a.hellVisits, 1);
  assert.ok(kinds(r.log).includes('hell_sent'));
});

test("Devil's Deal mark: two sixes in a row is Hell", () => {
  const r = resolveDay(day([player('a', { position: 40, devilMarked: true })]), scriptedRng([6, 6]));
  assert.equal(r.players[0].inHell, true);
});

test('Hell: a six escapes to square 1 and ends the turn', () => {
  const rng = scriptedRng([6]);
  const r = resolveDay(day([player('a', { inHell: true })]), rng);
  assert.equal(r.players[0].inHell, false);
  assert.equal(r.players[0].position, 1);
  assert.equal(rng.remaining(), 0); // no main roll after escaping
});

test('Hell: anything but a six stays put', () => {
  const r = resolveDay(day([player('a', { inHell: true, heldPowerup: 'double_dice' })], {
    lockIns: [lock('a', { playPowerup: true })],
  }), scriptedRng([5]));
  assert.equal(r.players[0].inHell, true);
  assert.equal(r.players[0].heldPowerup, 'double_dice'); // not usable in Hell, kept
});

test('passive movement never triggers a square', () => {
  // Devil's Deal moves 0 -> 10 passively onto a trap door: not triggered, not revealed.
  const squares = plainBoard({ 10: { type: 'trap', revealed: false, payload: { drop: 5, text: 'Missing PIC' } } });
  const r = resolveDay(day([player('a', { pendingDecision: pending(['devils_deal', 'two_up']) })], {
    squares,
    lockIns: [lock('a', { decisionChoice: 'devils_deal' })],
  }), scriptedRng([1]));
  assert.equal(r.players[0].position, 11);
  assert.equal(r.players[0].devilMarked, true);
  assert.equal(r.squares[9].revealed, false);
  assert.ok(!kinds(r.log).includes('trap'));
});

test('trap door drop is passive and does not trigger the square it drops to', () => {
  const squares = plainBoard({
    12: { type: 'trap', revealed: false, payload: { drop: 7, text: 'Lost NLIS tag' } },
    5: { type: 'powerup', revealed: true },
  });
  const r = resolveDay(day([player('a', { position: 8 })], { squares }), scriptedRng([4]));
  assert.equal(r.players[0].position, 5);
  assert.equal(r.players[0].heldPowerup, null);
  assert.equal(r.squares[11].revealed, true);
});

test('Shield blocks one trap door, then is used up', () => {
  const squares = plainBoard({ 12: { type: 'trap', revealed: false, payload: { drop: 7, text: 'x' } } });
  const r = resolveDay(day([player('a', { position: 8, heldPowerup: 'shield' })], { squares }), scriptedRng([4]));
  assert.equal(r.players[0].position, 12);
  assert.equal(r.players[0].heldPowerup, null);
  assert.equal(r.squares[11].revealed, true);
  assert.ok(kinds(r.log).includes('shield_block'));
});

test('Book a Truck: no dice, move exactly 4, triggers the landing square', () => {
  const squares = plainBoard({ 14: { type: 'powerup', revealed: true, payload: { powerup: 'lucky_roll' } } });
  const rng = scriptedRng([]);
  const r = resolveDay(day([player('a', { position: 10, pendingDecision: pending(['book_truck', 'two_up']) })], {
    squares,
    lockIns: [lock('a', { decisionChoice: 'book_truck' })],
  }), rng);
  assert.equal(r.players[0].position, 14);
  assert.equal(r.players[0].heldPowerup, 'lucky_roll');
});

test('auto-roll: passes decisions, keeps power-ups, resets streak', () => {
  const r = resolveDay(day([player('a', {
    position: 10, streak: 3, heldPowerup: 'double_dice', pendingDecision: pending(['devils_deal', 'two_up']),
  })], { lockIns: [] }), scriptedRng([3]));
  const a = r.players[0];
  assert.equal(a.position, 13);
  assert.equal(a.devilMarked, false);
  assert.equal(a.heldPowerup, 'double_dice');
  assert.equal(a.streak, 0);
  assert.equal(a.pendingDecision, null);
});

test('auto-roll still triggers squares and can go to Hell', () => {
  const r = resolveDay(day([player('a', { position: 10 })], { lockIns: [] }), scriptedRng([6, 6, 6]));
  assert.equal(r.players[0].inHell, true);
});

test('Double Dice sums two dice and sixes do not roll again', () => {
  const rng = scriptedRng([6, 6]);
  const r = resolveDay(day([player('a', { heldPowerup: 'double_dice' })], {
    lockIns: [lock('a', { playPowerup: true })],
  }), rng);
  assert.equal(r.players[0].position, 12);
  assert.equal(r.players[0].inHell, false);
  assert.equal(r.players[0].heldPowerup, null);
});

test('Lucky Roll re-rolls a 1 or 2 once', () => {
  const r = resolveDay(day([player('a', { heldPowerup: 'lucky_roll' })], {
    lockIns: [lock('a', { playPowerup: true })],
  }), scriptedRng([2, 5]));
  assert.equal(r.players[0].position, 5);
});

test('Lucky Roll is used up even when the roll was fine', () => {
  const r = resolveDay(day([player('a', { heldPowerup: 'lucky_roll' })], {
    lockIns: [lock('a', { playPowerup: true })],
  }), scriptedRng([4]));
  assert.equal(r.players[0].position, 4);
  assert.equal(r.players[0].heldPowerup, null);
});

test('a held power-up not played stays held', () => {
  const r = resolveDay(day([player('a', { heldPowerup: 'lucky_roll' })]), scriptedRng([1]));
  assert.equal(r.players[0].position, 1);
  assert.equal(r.players[0].heldPowerup, 'lucky_roll');
});

test('streak: five manual lock-ins in a row earns a power-up, or 3 squares if full', () => {
  let r = resolveDay(day([player('a', { streak: 4 })]), scriptedRng([2]));
  assert.equal(r.players[0].streak, 5);
  assert.notEqual(r.players[0].heldPowerup, null);
  r = resolveDay(day([player('a', { streak: 4, heldPowerup: 'shield' })]), scriptedRng([2]));
  assert.equal(r.players[0].position, 5);
});

test('daily events modify the main roll', () => {
  const at = (eventKey: string, dice: number[], extra = {}) =>
    resolveDay(day([player('a', { position: 10, ...extra })], { eventKey }), scriptedRng(dice)).players[0].position;
  assert.equal(at('sale_day', [6, 2]), 24);
  assert.equal(at('drought', [1]), 11);
  assert.equal(at('drought', [4]), 13);
  assert.equal(at('muster', [3]), 15);
  assert.equal(at('fair_dinkum', [6]), 16);
  assert.equal(at('big_wet', [6, 5]), 16);
});

test('events do not apply to Book a Truck', () => {
  const r = resolveDay(day([player('a', { position: 10, pendingDecision: pending(['book_truck', 'two_up']) })], {
    eventKey: 'muster',
    lockIns: [lock('a', { decisionChoice: 'book_truck' })],
  }), scriptedRng([]));
  assert.equal(r.players[0].position, 14);
});

test('curse halves movement rounded up for 2 days', () => {
  const p = player('a', { position: 10, curse: { kind: 'lame_steer', daysLeft: 2 } });
  let r = resolveDay(day([p]), scriptedRng([5]));
  assert.equal(r.players[0].position, 13);
  assert.equal(r.players[0].curse?.daysLeft, 1);
  r = resolveDay(day(r.players), scriptedRng([5]));
  assert.equal(r.players[0].position, 16);
  assert.equal(r.players[0].curse, null);
});

test('resolution order is last place to first', () => {
  const r = resolveDay(day([player('lead', { position: 50 }), player('mid', { position: 20 }), player('hell', { inHell: true })]),
    scriptedRng([1, 1, 1]));
  assert.deepEqual(r.log[0].data.order, ['hell', 'mid', 'lead']);
});

test('Two-Up: call it right, forward double the trigger roll; wrong, back double', () => {
  for (const call of ['heads', 'tails'] as const) {
    for (let i = 0; i < 10; i++) {
      const r = resolveDay(day([player('a', { position: 30, pendingDecision: pending(['two_up', 'wyr'], 4) })], {
        lockIns: [lock('a', { decisionChoice: 'two_up', coinCall: call })],
      }), scriptedRng([1], `coin${i}`));
      const ev = r.log.find((e) => e.kind === 'two_up')!.data;
      assert.equal(ev.call, call);
      assert.equal(ev.won, (ev.heads ? 'heads' : 'tails') === call);
      assert.equal(r.players[0].position, (ev.won ? 38 : 22) + 1);
    }
  }
});

test('Would You Rather: correct sends a player ahead back 3, wrong sends you back 2', () => {
  const q = { id: 'q1', question: 'Q?', optionA: 'A', optionB: 'B' };
  const base = () => [
    player('a', { position: 20, pendingDecision: pending(['wyr', 'two_up'], 3, { wyr: q }) }),
    player('b', { position: 40 }),
  ];
  let r = resolveDay(day(base(), {
    lockIns: [lock('a', { decisionChoice: 'wyr', wyrPick: 'b' }), lock('b')],
    wyrAnswers: { q1: 'b' },
  }), scriptedRng([1, 1]));
  assert.equal(r.players.find((p) => p.id === 'b')!.position, 38);
  assert.equal(r.players.find((p) => p.id === 'a')!.position, 21);

  r = resolveDay(day(base(), {
    lockIns: [lock('a', { decisionChoice: 'wyr', wyrPick: 'a' }), lock('b')],
    wyrAnswers: { q1: 'b' },
  }), scriptedRng([1, 1]));
  assert.equal(r.players.find((p) => p.id === 'a')!.position, 19);
  assert.equal(r.players.find((p) => p.id === 'b')!.position, 41);
});

test('landing on a decision square offers two different options, WYR retires its question', () => {
  const squares = plainBoard({ 5: { type: 'decision', revealed: true } });
  const qs = [{ id: 'q1', question: 'Q?', optionA: 'A', optionB: 'B' }];
  for (let i = 0; i < 30; i++) {
    const r = resolveDay(day([player('a')], { squares, wyrAvailable: qs }), scriptedRng([5], `s${i}`));
    const pd = r.players[0].pendingDecision!;
    assert.notEqual(pd.options[0], pd.options[1]);
    if (pd.options.includes('wyr')) {
      assert.equal(pd.wyr?.id, 'q1');
      assert.deepEqual(r.usedQuestionIds, ['q1']);
    } else {
      assert.equal(pd.wyr, undefined);
    }
  }
});

test('no WYR offered once questions run out', () => {
  const squares = plainBoard({ 5: { type: 'decision', revealed: true } });
  for (let i = 0; i < 30; i++) {
    const r = resolveDay(day([player('a')], { squares }), scriptedRng([5], `t${i}`));
    assert.ok(!r.players[0].pendingDecision!.options.includes('wyr'));
  }
});

test('overshooting 100 finishes and the first finisher wins', () => {
  const r = resolveDay(day([player('a', { position: 98 }), player('b', { position: 99 })]), scriptedRng([5, 5]));
  assert.equal(r.winnerId, 'a'); // a is behind, so resolves first
  assert.ok(r.players.every((p) => p.finishedOn === '2026-12-01'));
});

test('Swap trades places with the player directly ahead (when enabled)', () => {
  const players = [
    player('a', { position: 10, heldPowerup: 'swap' }),
    player('b', { position: 30 }),
    player('c', { position: 60 }),
  ];
  const r = resolveDay(day(players, {
    config: { ...DEFAULT_CONFIG, swapEnabled: true },
    lockIns: [lock('a', { playPowerup: true }), lock('b'), lock('c')],
  }), scriptedRng([2, 1, 1]));
  const pos = Object.fromEntries(r.players.map((p) => [p.id, p.position]));
  // a moves 10 -> 12, swaps with b (still at 30), then b rolls 1 from 12
  assert.equal(pos.a, 30);
  assert.equal(pos.b, 13);
  assert.equal(pos.c, 61);
});

test('same seed, same day: identical result (safe to re-render)', () => {
  const squares = plainBoard({ 7: { type: 'decision', revealed: true } });
  const input = day([player('a'), player('b', { position: 3 }), player('c', { position: 9 })], { squares });
  const r1 = resolveDay(input, createRng('2026-12-01:abc'));
  const r2 = resolveDay(input, createRng('2026-12-01:abc'));
  assert.deepEqual(r1, r2);
  assert.equal(input.players[0].position, 0); // input not mutated
});

test('good surprise: hidden until landed on, moves forward passively', () => {
  const squares = plainBoard({
    12: { type: 'boost', revealed: false, payload: { gain: 4, text: 'R&R award' } },
    16: { type: 'trap', revealed: false, payload: { drop: 5, text: 'x' } },
  });
  const r = resolveDay(day([player('a', { position: 8 })], { squares }), scriptedRng([4]));
  assert.equal(r.players[0].position, 16); // landed on 12, moved to 16 passively: trap not triggered
  assert.equal(r.squares[11].revealed, true);
  assert.equal(r.squares[15].revealed, false);
  assert.ok(kinds(r.log).includes('boost'));
});

test('engagement survey: 50/50, forward or back 5, passively', () => {
  const squares = plainBoard({ 20: { type: 'survey', revealed: true } });
  const seen = new Set<boolean>();
  for (let i = 0; i < 20; i++) {
    const r = resolveDay(day([player('a', { position: 16 })], { squares }), scriptedRng([4], `survey${i}`));
    const ev = r.log.find((e) => e.kind === 'survey')!.data;
    seen.add(ev.positive as boolean);
    assert.equal(r.players[0].position, ev.positive ? 25 : 15);
  }
  assert.equal(seen.size, 2);
});

test('CPI pay rise: next main move is exactly 4, no dice', () => {
  const squares = plainBoard({ 12: { type: 'boost', revealed: false, payload: { gain: 0, text: 'CPI pay rise', effect: 'cpi' } } });
  let r = resolveDay(day([player('a', { position: 8 })], { squares }), scriptedRng([4]));
  assert.equal(r.players[0].position, 12); // no immediate move
  assert.equal(r.players[0].nextRoll, 'cpi');
  const rng = scriptedRng([]);
  r = resolveDay(day(r.players, { squares: r.squares, eventKey: 'muster' }), rng); // events don't apply
  assert.equal(r.players[0].position, 16);
  assert.equal(r.players[0].nextRoll, null);
});

test('Glass ceiling: no main move next turn, power-up kept; Out of Office blocks it', () => {
  const squares = plainBoard({ 12: { type: 'trap', revealed: false, payload: { drop: 0, text: 'Hit the glass ceiling', effect: 'glass_ceiling' } } });
  let r = resolveDay(day([player('a', { position: 8, heldPowerup: 'double_dice' })], { squares }), scriptedRng([4]));
  assert.equal(r.players[0].position, 12);
  assert.equal(r.players[0].nextRoll, 'glass_ceiling');
  r = resolveDay(day(r.players, { squares: r.squares, lockIns: [lock('a', { playPowerup: true })] }), scriptedRng([]));
  assert.equal(r.players[0].position, 12); // stayed put, square not re-triggered
  assert.equal(r.players[0].heldPowerup, 'double_dice');
  assert.equal(r.players[0].nextRoll, null);
  r = resolveDay(day([player('b', { position: 8, heldPowerup: 'shield' })], { squares }), scriptedRng([4]));
  assert.equal(r.players[0].nextRoll, null);
  assert.equal(r.players[0].heldPowerup, null);
});

test('rigged dice (demo test lab only) apply to one player and fall back to the RNG', () => {
  const r = resolveDay(day([player('a', { position: 10 }), player('b', { position: 20 })], {
    riggedDice: { a: [6, 6, 2] },
  }), scriptedRng([3]));
  assert.equal(r.players.find((p) => p.id === 'a')!.position, 24);
  assert.equal(r.players.find((p) => p.id === 'b')!.position, 23);
});
