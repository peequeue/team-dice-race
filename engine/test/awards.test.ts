import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateSeason } from '../sim/simulate.ts';
import { computeAwards } from '../../supabase/functions/_shared/engine/index.ts';

test('every player gets at least one award', () => {
  for (let i = 0; i < 20; i++) {
    const s = simulateSeason(`awards-${i}`);
    const awards = computeAwards(s.playerIds, s.log, s.winnerId);
    for (const id of s.playerIds) assert.ok(awards.some((a) => a.playerId === id), `${id} missed out in run ${i}`);
    assert.equal(awards.filter((a) => a.award === 'Winner').length, 1);
  }
});
