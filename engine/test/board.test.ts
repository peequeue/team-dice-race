import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, generateBoard, generateEventSequence, weekdaysBetween, zonesFor } from '../../supabase/functions/_shared/engine/index.ts';

test('board: counts, no early traps, every zone has one of each, traps hidden', () => {
  for (const size of [100, 125]) {
    for (let i = 0; i < 200; i++) {
      const b = generateBoard(createRng(`b${i}`), { size });
      const count = (t: string) => b.filter((s) => s.type === t).length;
      assert.equal(b.length, size);
      assert.equal(count('trap'), 6);
      assert.equal(count('powerup'), 6);
      assert.equal(count('decision'), 10);
      assert.equal(count('boost'), 5);
      assert.equal(count('survey'), 4);
      assert.ok(b.slice(0, 5).every((s) => s.type !== 'trap' && s.type !== 'boost'));
      assert.ok(b.filter((s) => s.type === 'boost' && !s.payload!.effect).every((s) => !s.revealed && s.payload!.gain! >= 3 && s.payload!.gain! <= 6));
      assert.equal(b.filter((s) => s.payload?.effect === 'cpi').length, 1);
      assert.equal(b.filter((s) => s.payload?.effect === 'glass_ceiling').length, 1);
      const texts = b.filter((s) => s.type === 'trap').map((s) => s.payload!.text);
      assert.equal(new Set(texts).size, texts.length, 'trap texts are unique per board');
      assert.equal(b[size - 1].type, 'normal');
      for (const z of zonesFor(size)) {
        const inZone = b.filter((s) => s.idx >= z.from && s.idx <= z.to);
        for (const t of ['trap', 'powerup', 'decision']) assert.ok(inZone.some((s) => s.type === t), `${z.key} lacks ${t}`);
      }
      for (const t of b.filter((s) => s.type === 'trap')) {
        assert.equal(t.revealed, false);
        if (!t.payload!.effect) assert.ok(t.payload!.drop! >= 5 && t.payload!.drop! <= 10);
      }
    }
  }
});

test('events: quiet is common, no special event two days running', () => {
  const dates = weekdaysBetween('2026-12-01', '2027-06-30');
  const seq = generateEventSequence(dates, createRng('ev'));
  const keys = dates.map((d) => seq[d]);
  for (let i = 1; i < keys.length; i++) if (keys[i] !== 'quiet') assert.notEqual(keys[i], keys[i - 1]);
  const quiet = keys.filter((k) => k === 'quiet').length / keys.length;
  assert.ok(quiet > 0.3 && quiet < 0.55, `quiet share ${quiet}`);
});
