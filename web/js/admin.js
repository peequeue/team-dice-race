// Host page.
import { readKey, adminApi, bootstrapAdmin } from './api.js';
import { Board } from './board.js';
import { AVATAR_KEYS, avatarLabel } from './sprites.js';

/** One row of the new-season form: nickname plus avatar, defaulting to a different avatar per row. */
function nickRow(i) {
  const opts = AVATAR_KEYS.map((k, j) => `<option value="${k}" ${j === i % AVATAR_KEYS.length ? 'selected' : ''}>${avatarLabel(k)}</option>`).join('');
  return `<div class="row nickrow" style="margin:0 0 4px"><input type="text" class="nick" placeholder="Player ${i + 1}" style="flex:2"><select class="nickav" style="flex:1">${opts}</select></div>`;
}
import { POWERUP_NAMES, DECISION_NAMES } from './replay.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const key = readKey();
const call = key ? adminApi(key) : null;
let data = null;
let board = null;

function playerLink(k) {
  return `${new URL('index.html', location.href).href.split('#')[0]}#k=${k}`;
}

async function act(action, body = {}, { confirmText } = {}) {
  if (confirmText && !confirm(confirmText)) return null;
  try {
    const r = await call(action, body);
    await load();
    return r;
  } catch (e) {
    toast(e.message);
    return null;
  }
}

async function load() {
  try {
    data = await call('overview');
  } catch (e) {
    toast(e.message);
    if (/host key/i.test(e.message)) { $('app').classList.add('hidden'); $('login').classList.remove('hidden'); }
    return;
  }
  render();
}

function render() {
  const s = data.season;
  const live = s && s.status !== 'finished';
  $('status').textContent = !s ? 'No season' : `${s.name}: ${s.status}${s.paused ? ' (paused)' : ''}`;
  renderSeason(s, live);
  renderPlayers(live ? data.players ?? [] : []);
  renderBoard(s);
  renderWyr();
  renderDays();
}

function renderSeason(s, live) {
  const box = $('seasonBox');
  if (!live) {
    const start = nextWeekday();
    box.innerHTML = `<h2>New season</h2>
      ${s ? `<p class="note">Last season: ${esc(s.name)} (finished)</p>` : ''}
      <div class="row"><label style="flex:1">Name<input type="text" id="sName" value="${s ? '' : 'Pilot season'}"></label></div>
      <div class="row">
        <label style="flex:1">First game day<input type="date" id="sStart" value="${start}"></label>
        <label style="flex:1">Board squares<input type="number" id="sSize" value="90" min="20" max="300"></label>
      </div>
      <label class="note"><input type="checkbox" id="sSwap"> Include the Hot Desk Swap power-up</label>
      <h3 style="margin-top:8px">Players and avatars</h3>
      <div id="nickRows">${Array.from({ length: 8 }, (_, i) => nickRow(i)).join('')}</div>
      <div class="row"><button id="addNick" class="btn small ghost">Add another player</button></div>
      <div class="row"><button id="create" class="btn gold">Create season</button></div>
      <p class="note">Creating a season builds a fresh board and the daily events, then shows each player's link. Nothing starts until you press Start.</p>`;
    $('addNick').onclick = () => {
      const n = document.querySelectorAll('.nickrow').length;
      if (n < 12) $('nickRows').insertAdjacentHTML('beforeend', nickRow(n));
    };
    $('create').onclick = async () => {
      const rows = [...document.querySelectorAll('.nickrow')].map((r) => ({ nickname: r.querySelector('.nick').value.trim(), avatarKey: r.querySelector('.nickav').value })).filter((r) => r.nickname);
      const nicknames = rows.map((r) => r.nickname);
      const r = await act('create_season', {
        name: $('sName').value, startDate: $('sStart').value, boardSize: Number($('sSize').value),
        swapEnabled: $('sSwap').checked, nicknames, avatars: rows.map((r) => r.avatarKey),
      });
      if (r) showLinks(r.links);
    };
    return;
  }
  const swap = !!s.config?.swapEnabled;
  box.innerHTML = `<h2>${esc(s.name)}</h2>
    <div class="stat"><span>Status</span><b>${s.status}${s.paused ? ', paused' : ''}</b></div>
    <div class="stat"><span>First game day</span><b>${s.start_date}</b></div>
    <div class="stat"><span>Next game day</span><b>${data.nextGameDate}</b></div>
    <div class="stat"><span>Board</span><b>${s.board_size} squares</b></div>
    <div class="stat"><span>Hot Desk Swap</span><b>${swap ? 'On' : 'Off'}</b></div>
    <div class="row" style="margin-top:10px">
      ${s.status === 'setup' ? '<button id="start" class="btn gold">Start season</button><button id="regen" class="btn ghost">New board</button>' : ''}
      ${s.status === 'active' ? `<button id="pause" class="btn ${s.paused ? 'green' : 'ghost'}">${s.paused ? 'Resume' : 'Pause'}</button>
        <button id="resolve" class="btn ghost">Resolve due days now</button>` : ''}
      <button id="swap" class="btn ghost small">Hot Desk Swap ${swap ? 'off' : 'on'}</button>
      <button id="end" class="btn red small">End season</button>
    </div>
    <p class="note">Pause for the Christmas shutdown or public holidays. Days that pass while paused are skipped, and nobody loses their streak.</p>`;
  const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  on('start', () => act('start_season', {}, { confirmText: 'Start the season? Players can lock in straight away.' }));
  on('regen', () => act('board_regenerate'));
  on('pause', () => act('set_paused', { paused: !s.paused }));
  on('resolve', async () => { const r = await act('resolve_now'); if (r) toast(r.done.length ? `Done: ${r.done.map((d) => `${d.date} ${d.status}`).join(', ')}` : 'Nothing due yet'); });
  on('swap', () => act('set_swap', { enabled: !swap }));
  on('end', () => act('end_season', {}, { confirmText: 'End the season now? Awards are worked out from the log so far. This cannot be undone.' }));
}

function showLinks(links) {
  $('linksOut').innerHTML = links.map((l) => `
    <div style="margin-bottom:8px"><b>${esc(l.nickname)}</b>
      <div class="linkout">${esc(playerLink(l.key))}</div>
      <button class="btn small" data-copy="${esc(playerLink(l.key))}">Copy</button></div>`).join('');
  $('linksOut').querySelectorAll('[data-copy]').forEach((b) => (b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; } catch { toast('Copy failed. Select the link and copy it by hand.'); }
  }));
}

function renderPlayers(players) {
  if (!players.length) { $('players').innerHTML = '<p class="note">No players yet.</p>'; return; }
  const avatarOpts = (cur) => AVATAR_KEYS.map((k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${avatarLabel(k)}</option>`).join('');
  $('players').innerHTML = `<table><tr><th>Nickname</th><th>Avatar</th><th>Where</th><th>Holding</th><th>Pending</th><th>Streak</th><th>Today</th><th></th></tr>
    ${players.map((p) => `<tr>
      <td><input type="text" data-nick="${p.id}" value="${esc(p.nickname)}"></td>
      <td><select data-av="${p.id}">${avatarOpts(p.avatar_key)}</select></td>
      <td>${p.in_hell ? 'Meeting Hell' : p.finished_on ? 'On LSL' : p.position}${p.devil_marked ? ' (devil)' : ''}${p.bonus_rolls ? ` +${p.bonus_rolls} bonus` : ''}</td>
      <td>${p.held_powerup ? POWERUP_NAMES[p.held_powerup] : '-'}</td>
      <td>${p.pending_decision ? p.pending_decision.options.map((o) => DECISION_NAMES[o]).join(' / ') : '-'}</td>
      <td>${p.streak}</td>
      <td>${p.lockedIn ? '<span class="ok">Locked</span>' : '-'}</td>
      <td><button class="btn small" data-save="${p.id}">Save</button>
        <button class="btn small ghost" data-link="${p.id}">New link</button>
        <button class="btn small ghost" data-bonus="${p.id}">+1 roll</button></td>
    </tr>`).join('')}</table>`;
  const q = (sel) => [...$('players').querySelectorAll(sel)];
  q('[data-save]').forEach((b) => (b.onclick = () => act('edit_player', {
    playerId: b.dataset.save,
    nickname: $('players').querySelector(`[data-nick="${b.dataset.save}"]`).value,
    avatarKey: $('players').querySelector(`[data-av="${b.dataset.save}"]`).value,
  })));
  q('[data-link]').forEach((b) => (b.onclick = async () => {
    const r = await act('regenerate_link', { playerId: b.dataset.link }, { confirmText: 'Make a new link? The old one stops working immediately.' });
    if (r) showLinks([r]);
  }));
  q('[data-bonus]').forEach((b) => (b.onclick = () => act('grant_bonus', { playerId: b.dataset.bonus, rolls: 1 })));
}

function renderBoard(s) {
  if (!s || !data.squares?.length) return;
  if (!board) { board = new Board($('board'), s.board_size); board.showHidden = true; }
  if (board.size !== s.board_size) board.setSize(s.board_size);
  board.squares = data.squares;
  board.tokens = (data.players ?? []).map((p) => ({ id: p.id, avatarKey: p.avatar_key, pos: p.in_hell ? 0 : p.position, inHell: p.in_hell, devil: p.devil_marked }));
}

function renderWyr() {
  const unused = data.wyr.filter((q) => !q.used_date);
  const todo = unused.filter((q) => !q.answer).length;
  $('wyrCount').innerHTML = `${unused.length - todo} ready${todo ? `, <b class="warn">${todo} need your answer</b>` : ''}`;
  const pick = (q, side) => q.used_date
    ? (q.answer === side ? '&#10003;' : '')
    : `<button class="btn small ${q.answer === side ? 'gold' : 'ghost'}" data-ans="${side}" data-id="${q.id}">${side === 'a' ? 'A' : 'B'}</button>`;
  $('wyrList').innerHTML = `<table><tr><th>Question</th><th>A</th><th>B</th><th>Pick</th><th>Used</th><th></th></tr>
    ${data.wyr.map((q) => `<tr><td>${esc(q.question)}</td><td>${esc(q.option_a)}</td><td>${esc(q.option_b)}</td>
      <td style="white-space:nowrap">${pick(q, 'a')} ${pick(q, 'b')}</td><td>${q.used_date ?? '-'}</td>
      <td>${q.used_date ? '' : `<button class="btn small red" data-del="${q.id}">X</button>`}</td></tr>`).join('')}</table>`;
  $('wyrList').querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => act('wyr_delete', { id: b.dataset.del })));
  $('wyrList').querySelectorAll('[data-ans]').forEach((b) => (b.onclick = () => act('wyr_answer', { id: b.dataset.id, answer: b.dataset.ans })));
  $('wyrAdd').onclick = async () => {
    const r = await act('wyr_add', { bulk: $('wyrBulk').value });
    if (r) { $('wyrBulk').value = ''; toast(r.unanswered ? `Added ${r.added}. Pick your answer (A or B) for each in the table.` : `Added ${r.added}`); }
  };
}

function renderDays() {
  const days = data.days ?? [];
  $('days').innerHTML = days.length
    ? `<table><tr><th>Date</th><th>Result</th></tr>${days.map((d) => `<tr><td>${d.game_date}</td><td>${d.status}</td></tr>`).join('')}</table>`
    : '<p class="note">Nothing resolved yet.</p>';
  const hall = data.hall ?? [];
  $('awards').innerHTML = hall.length
    ? `<table><tr><th>Award</th><th>Player</th><th>Detail</th></tr>${hall.map((a) => `<tr><td>${esc(a.award)}</td><td>${esc(a.player_nickname)}</td><td>${esc(a.detail)}</td></tr>`).join('')}</table>
      <div class="row"><button id="pub" class="btn ${hall[0].published ? 'ghost' : 'gold'}">${hall[0].published ? 'Unpublish' : 'Publish to players'}</button></div>`
    : '<p class="note">Awards appear here when the season ends.</p>';
  const pub = $('pub');
  if (pub) pub.onclick = () => act('publish_awards', { publish: !hall[0].published });
}

function nextWeekday() {
  const d = new Date();
  do d.setDate(d.getDate() + 1); while ([0, 6].includes(d.getDay()));
  return d.toLocaleDateString('en-CA');
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 5000);
}

if (!key) {
  $('login').classList.remove('hidden');
  $('bootBtn').onclick = async () => {
    try {
      const r = await bootstrapAdmin($('bootToken').value.trim());
      const link = `${location.href.split('#')[0]}#k=${r.key}`;
      $('bootOut').innerHTML = `<p class="ok">Done. Bookmark this host link now. It is only shown once.</p><div class="linkout">${esc(link)}</div>
        <div class="row"><a class="btn gold" href="${esc(link)}" onclick="setTimeout(() => location.reload(), 0)">Open host page</a></div>`;
    } catch (e) { toast(e.message); }
  };
} else {
  $('app').classList.remove('hidden');
  $('refresh').onclick = load;
  load();
}
