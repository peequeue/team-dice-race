import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueDates, lockInDate, msUntilReveal, planResolution, revealPassed, sydneyNow } from '../../supabase/functions/_shared/engine/index.ts';

test('4pm Sydney in standard time (AEST, UTC+10) is 06:00 UTC', () => {
  // Fri 2 Oct 2026, before DST starts on Sun 4 Oct
  assert.equal(revealPassed('2026-10-02', new Date('2026-10-02T05:59:00Z')), false);
  assert.equal(revealPassed('2026-10-02', new Date('2026-10-02T06:00:00Z')), true);
});

test('DST boundary: 4pm Sydney in daylight time (AEDT, UTC+11) is 05:00 UTC', () => {
  // Mon 5 Oct 2026, the first weekday after DST starts
  assert.equal(revealPassed('2026-10-05', new Date('2026-10-05T04:59:00Z')), false);
  assert.equal(revealPassed('2026-10-05', new Date('2026-10-05T05:00:00Z')), true);
  // DST ends Sun 4 Apr 2027: Mon 5 Apr back to 06:00 UTC
  assert.equal(revealPassed('2027-04-05', new Date('2027-04-05T05:30:00Z')), false);
  assert.equal(revealPassed('2027-04-05', new Date('2027-04-05T06:00:00Z')), true);
});

test('Sydney date can differ from the UTC date', () => {
  // 14:00 UTC Sunday is 01:00 Monday in Sydney (AEDT)
  assert.equal(sydneyNow(new Date('2026-11-29T14:00:00Z')).date, '2026-11-30');
});

test('weekends are never due', () => {
  const due = dueDates('2026-11-27', new Set(), new Date('2026-11-30T06:00:00Z')); // Mon 5pm Sydney
  assert.deepEqual(due, ['2026-11-27', '2026-11-30']);
});

test('idempotent re-run: resolved dates are not resolved again', () => {
  const now = new Date('2026-12-01T05:30:00Z'); // Tue 4:30pm
  const first = planResolution('2026-11-30', new Set(), false, false, now);
  assert.deepEqual(first.resolve, ['2026-11-30', '2026-12-01']);
  const again = planResolution('2026-11-30', new Set(first.resolve), false, false, now);
  assert.deepEqual(again.resolve, []);
});

test('missed-day catch-up resolves outstanding dates oldest first', () => {
  const now = new Date('2026-12-07T05:30:00Z'); // Mon 4:30pm, nothing since last Wed
  const plan = planResolution('2026-11-30', new Set(['2026-11-30', '2026-12-01', '2026-12-02']), false, false, now);
  assert.deepEqual(plan.resolve, ['2026-12-03', '2026-12-04', '2026-12-07']);
});

test('paused season records due dates as skipped, finished season does nothing', () => {
  const now = new Date('2026-12-01T05:30:00Z');
  const paused = planResolution('2026-12-01', new Set(), true, false, now);
  assert.deepEqual(paused, { resolve: [], skip: ['2026-12-01'] });
  assert.deepEqual(planResolution('2026-12-01', new Set(), false, true, now), { resolve: [], skip: [] });
});

test('before 4pm today counts as today, after 4pm or weekend rolls to the next weekday', () => {
  assert.equal(lockInDate(new Date('2026-12-01T04:00:00Z')), '2026-12-01'); // Tue 3pm
  assert.equal(lockInDate(new Date('2026-12-01T05:00:00Z')), '2026-12-02'); // Tue 4pm
  assert.equal(lockInDate(new Date('2026-12-04T06:00:00Z')), '2026-12-07'); // Fri 5pm -> Mon
  assert.equal(lockInDate(new Date('2026-12-05T01:00:00Z')), '2026-12-07'); // Sat
});

test('countdown to reveal', () => {
  assert.equal(msUntilReveal(new Date('2026-12-01T04:00:00Z')), 60 * 60 * 1000);
});
