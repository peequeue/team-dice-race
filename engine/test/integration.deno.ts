// End-to-end check against locally served functions and a local Postgres.
// Not run in CI. Usage: start the three functions on ports 8001-8003, then
//   deno run -A engine/test/integration.deno.ts
const call = async (port: number, body: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(`http://127.0.0.1:${port}`, { method: 'POST', body: JSON.stringify(body), headers });
  return { status: r.status, body: await r.json() };
};
const admin = (b: Record<string, unknown>) => call(8003, { key: adminKey, ...b });
const play = (key: string, b: Record<string, unknown>) => call(8002, { key, ...b });
const ok = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok  ${msg}`);
};

const boot = await call(8003, { action: 'bootstrap', token: 'boot-token-xyz' });
const adminKey: string = boot.body.key;
ok(adminKey?.length > 30, 'bootstrap issues a host key');
ok((await call(8003, { action: 'bootstrap', token: 'boot-token-xyz' })).status === 409, 'bootstrap only works once');
ok((await call(8003, { action: 'overview', key: 'x'.repeat(43) })).status === 401, 'wrong host key rejected');

const add = await admin({ action: 'wyr_add', bulk: 'Beach or bush? | Beach | Bush | b\nTea or coffee? | Tea | Coffee | a\nBad line' });
ok(add.status === 400, 'bad WYR line rejected with a helpful error');
ok((await admin({ action: 'wyr_add', bulk: 'Beach or bush? | Beach | Bush | b\nTea or coffee? | Tea | Coffee | a' })).body.added === 2, 'WYR bulk add');

const created = await admin({
  action: 'create_season', name: 'Pilot', startDate: '2026-11-23',
  nicknames: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'],
});
ok(created.body.links?.length === 6, 'season created with 6 personal links');
const links: { nickname: string; key: string }[] = created.body.links;
ok((await admin({ action: 'start_season' })).body.ok, 'season started');

// Opening the page after 4pm on past days triggers catch-up resolution.
const s1 = await play(links[0].key, { action: 'state' });
ok(s1.status === 200, 'player state loads');
const raw = JSON.stringify(s1.body);
ok(!raw.includes('"answer"'), 'no WYR answers in player state');
ok(!raw.includes('key_hash'), 'no key hashes in player state');
const over = await admin({ action: 'overview' });
const hiddenTraps = over.body.squares.filter((q: { type: string; revealed: boolean }) => q.type === 'trap' && !q.revealed);
const shownTrapIdx = new Set(s1.body.squares.filter((q: { type: string }) => q.type === 'trap').map((q: { idx: number }) => q.idx));
ok(hiddenTraps.every((t: { idx: number }) => !shownTrapIdx.has(t.idx)), 'unrevealed trap doors are not exposed');
const hiddenAll = over.body.squares.filter((q: { revealed: boolean }) => !q.revealed).map((q: { idx: number }) => q.idx);
const shownTypes = new Map(s1.body.squares.map((q: { idx: number; type: string }) => [q.idx, q.type]));
ok(hiddenAll.length >= 10 && hiddenAll.every((i: number) => shownTypes.get(i) === 'normal'), 'hidden trap doors and good surprises (incl. CPI, glass ceiling) look like plain squares');
ok(!/glass_ceiling|"cpi"|"gain"|"drop"/.test(JSON.stringify(s1.body.squares.filter((q: { idx: number }) => hiddenAll.includes(q.idx)))), 'no hidden payloads leak');
ok(s1.body.players.every((p: Record<string, unknown>) => !('pendingDecision' in p) && !('wyr' in p)), "other players' decision options are not exposed");
console.log('    resolved dates:', s1.body.resolvedDates.join(', '), '| next game date:', s1.body.today.gameDate);
ok(s1.body.resolvedDates.length >= 2, 'missed days caught up');

const rep = await play(links[0].key, { action: 'replay', date: s1.body.resolvedDates[0] });
ok(rep.body.log?.[0]?.kind === 'day_start', 'replay log available for a resolved day');
ok((await play(links[0].key, { action: 'replay', date: '2030-01-01' })).status === 404, 'no replay for unresolved days');

// Lock in, including a decision if one is pending.
for (const l of links) {
  const st = (await play(l.key, { action: 'state' })).body;
  const pd = st.me.pendingDecision;
  const choice = pd ? pd.options[0].key : null;
  if (choice === 'two_up') {
    const noCall = await play(l.key, { action: 'lockin', decisionChoice: 'two_up' });
    ok(noCall.status === 400, 'Two-Up without heads or tails is rejected');
  }
  const res = await play(l.key, { action: 'lockin', playPowerup: true, decisionChoice: choice, wyrPick: 'a', coinCall: 'tails' });
  ok(res.status === 200, `${l.nickname} locks in${pd ? ` (decision: ${choice})` : ''}`);
}
ok((await play(links[0].key, { action: 'lockin' })).status === 409, 'second lock-in for the same day rejected');
const st2 = (await play(links[1].key, { action: 'state' })).body;
ok(st2.players.every((p: { lockedIn: boolean }) => p.lockedIn), 'everyone shows as locked in');
ok(!JSON.stringify(st2.players).includes('decision'), "others' lock-in choices not exposed");

const before = (await admin({ action: 'overview' })).body.days.length;
const rerun = await call(8001, {}, { 'x-cron-secret': 'cronsecret123' });
ok(rerun.status === 200 && (await admin({ action: 'overview' })).body.days.length === before, 'cron re-run is idempotent');
ok((await call(8001, {}, { 'x-cron-secret': 'nope' })).status === 401, 'cron endpoint needs the secret');

const regen = await admin({ action: 'regenerate_link', playerId: over.body.players[0].id });
ok((await play(links[0].key, { action: 'state' })).status === 401, 'old link stops working after regenerate');
ok((await play(regen.body.key, { action: 'state' })).status === 200, 'new link works');

ok((await admin({ action: 'set_paused', paused: true })).body.paused === true, 'pause works');
ok((await play(regen.body.key, { action: 'lockin' })).status === 409, 'no lock-ins while paused');
await admin({ action: 'set_paused', paused: false });
console.log('\nAll integration checks passed');
