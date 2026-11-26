// Player page.
import { readKey, functionsUrl, realApi, demoApi } from './api.js';
import { Board } from './board.js';
import { Replay, eventText, POWERUP_NAMES, POWERUP_TEXT, DECISION_NAMES, DECISION_TEXT } from './replay.js';
import { paintAvatar, avatarColour } from './sprites.js';
import { isMuted, setMuted, sfx } from './sound.js';
import { pixelText } from './pixelfont.js';
import { showWelcome } from './welcome.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const key = readKey();
const demoMode = !key && (location.hash.includes('demo') || !functionsUrl());

let api;
let st = null;
let sel = { decision: null, wyrPick: null, coinCall: null, play: false };
let deadline = null;
let waitingForReveal = false;
let holdBack = false; // hide new results until the replay has shown them

const board = new Board($('board'));
const replay = new Replay(board, {
  caption: (text) => {
    const c = $('caption');
    if (text) { c.textContent = text; c.classList.add('show'); } else c.classList.remove('show');
  },
  dice: (values, opts = {}) => renderDice(values, opts),
  line: (entry) => addLine(liveDate, entry),
  card: (c, done) => showCard(c, done),
  standings: (view) => renderStandings([...view.values()].map((t) => ({ ...playerById(t.id), pos: t.pos, inHell: t.inHell, devil: t.devil }))),
});

// ---------- click for info ----------

const ZONE_NAMES = new Proxy({}, { get: (_, k) => String(k) }); // board zones already carry display names
const DECISION_TAGLINE = {
  two_up: 'Call heads or tails', wyr: "Guess the boss's answer", book_truck: 'Move exactly 4, no dice',
  consignment: 'Usually a power-up, sometimes rework', devils_deal: '+10 now, but at a price', pass: 'Play it safe',
};
const POWERUP_BLURB = {
  double_dice: "Roll two dice and add them together. Sixes don't roll again, so there's no risk of Meeting Hell.",
  shield: "You have paid time off when the next trap door lands, so it can't touch you. Works on its own.",
  lucky_roll: 'If your roll comes up a 1 or 2, it gets undone and rolled again automatically.',
  swap: 'After you move, swap desks with whoever is just ahead of you.',
};
const row = (k, v) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`;

function setupBoardClicks() {
  const cv = $('board');
  const hit = (ev) => (!replay.running && st ? board.hitTest(ev.clientX, ev.clientY) : null);
  cv.addEventListener('click', (ev) => { const h = hit(ev); if (h) showInfo(h); });
  cv.addEventListener('mousemove', (ev) => { cv.style.cursor = hit(ev) ? 'pointer' : 'default'; });
  $('info').onclick = (ev) => { if (ev.target.id === 'info' || ev.target.id === 'infoClose') $('info').classList.add('hidden'); };
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') $('info').classList.add('hidden'); });
  const openFrom = (ev) => {
    const c = ev.target.closest('[data-pid]');
    if (c && !replay.running && st) showInfo({ kind: 'player', id: c.dataset.pid });
  };
  $('ranks').addEventListener('click', openFrom);
  $('track').addEventListener('click', openFrom);
}

function rankOf(p) {
  const pos = (x) => (x.finishedOn ? 1e6 : x.inHell ? -1 : x.position);
  return 1 + st.players.filter((o) => pos(o) > pos(p)).length;
}

function showInfo(h) {
  const size = st.season.boardSize;
  let kicker = '';
  let title = '';
  let body = '';
  let avatar = null;
  const here = (idx) => st.players.filter((p) => !p.inHell && !p.finishedOn && p.position === idx).map((p) => esc(p.nickname));
  const pool = ['double_dice', 'shield', 'lucky_roll', ...(st.season.swapEnabled ? ['swap'] : [])];

  if (h.kind === 'player') {
    const p = st.players.find((x) => x.id === h.id);
    if (!p) return;
    avatar = p;
    kicker = p.isMe ? 'That\'s you' : `Currently ${ordinal(rankOf(p))}`;
    title = p.nickname;
    const where = p.finishedOn ? 'On Long Service Leave' : p.inHell ? 'In Meeting Hell, needs a 6 to escape'
      : p.position === 0 ? 'Still on their first day' : `Square ${p.position}, ${ZONE_NAMES[board.zone(p.position).name]}. ${size - p.position + 1} to go`;
    const pu = p.heldPowerup;
    body = `<p>${esc(where)}</p>`
      + row('Power-up', pu ? esc(POWERUP_NAMES[pu]) : 'None')
      + (pu ? `<p class="note">${esc(POWERUP_BLURB[pu])}</p>` : '')
      + row('Streak', `${p.streak} lock-in${p.streak === 1 ? '' : 's'} in a row`)
      + row('Today', p.lockedIn ? 'Locked in' : 'Not locked in yet')
      + (p.hasDecision ? row('Decision', 'Has a choice to make (kept secret)') : '')
      + (p.nextRoll === 'cpi' ? row('Next roll', 'Exactly 4 (agreed in principle)') : p.nextRoll === 'glass_ceiling' ? row('Next roll', 'No move (consulting with industry)') : '')
      + (p.curse ? row('Curse', `Sent back for rework, ${p.curse.daysLeft} more roll${p.curse.daysLeft === 1 ? '' : 's'} at half speed`) : '')
      + (p.devilMarked ? row("Devil's Deal", 'Two sixes in a row means Meeting Hell') : '')
      + (p.hellVisits ? row('Badge', `Meeting Hell Survivor${p.hellVisits > 1 ? ` (${p.hellVisits} trips)` : ''}`) : '');
  } else if (h.kind === 'square') {
    const sq = st.squares[h.idx - 1] ?? { type: 'normal' };
    const zone = ZONE_NAMES[board.zone(h.idx).name];
    kicker = `Square ${h.idx}, ${zone}`;
    const people = here(h.idx);
    const who = people.length ? `<p class="note">Here now: ${people.join(', ')}</p>` : '';
    if (sq.type === 'powerup') {
      title = 'Power-up square';
      body = `<p>Finish your roll here to pick up a power-up, chosen at random at 4pm. Each is equally likely:</p>`
        + pool.map((k) => `<div class="opt"><b>${esc(POWERUP_NAMES[k])}</b><br>${esc(POWERUP_BLURB[k])}</div>`).join('')
        + `<p class="note">You can only hold one at a time. If your hands are already full, landing here does nothing.</p>` + who;
    } else if (sq.type === 'decision') {
      title = 'Decision square';
      body = `<p>Finish your roll here and two of these are offered at random, plus Pass. You choose at your next lock-in.</p>`
        + ['two_up', 'wyr', 'book_truck', 'consignment', 'devils_deal'].map((k) =>
          `<div class="opt"><b>${esc(DECISION_NAMES[k])}${k === 'devils_deal' ? ' (rare, about 1 offer in 8)' : ''}</b><br>${esc(DECISION_TEXT[k])}</div>`).join('') + who;
    } else if (sq.type === 'trap') {
      const drop = sq.payload?.drop ?? 0;
      title = sq.payload?.text ?? 'Trap door';
      if (sq.payload?.effect === 'glass_ceiling') {
        body = `<p>A trap door, found the hard way. Finish a roll here and you have to consult with industry: you don't lose any squares, but you don't move at all on your next roll while you wait.</p>
          <p class="note">Time in lieu dodges it. Being moved onto it by anything other than your own roll is safe.</p>` + who;
      } else body = `<p>A trap door, found the hard way. Finish a roll here and you drop back ${drop} squares, to square ${Math.max(0, h.idx - drop)}.</p>
        <p class="note">Time in lieu dodges it. Being moved onto it by anything other than your own roll is safe.</p>` + who;
    } else if (sq.type === 'boost') {
      const gain = sq.payload?.gain ?? 0;
      title = sq.payload?.text ?? 'Good surprise';
      if (sq.payload?.effect === 'cpi') {
        body = `<p>A good surprise, found by someone lucky. Finish a roll here and industry agrees in principle (but won't put it in writing). Your next roll is a guaranteed 4: no dice, no sixes, no Meeting Hell risk.</p>
          <p class="note">Like trap doors, good surprises stay hidden until someone lands on one.</p>` + who;
      } else body = `<p>A good surprise, found by someone lucky. Finish a roll here and you move forward ${gain} squares, to square ${Math.min(size, h.idx + gain)}.</p>
        <p class="note">Like trap doors, good surprises stay hidden until someone lands on one.</p>` + who;
    } else if (sq.type === 'survey') {
      title = 'Engagement survey';
      body = `<p>Finish a roll here and you fill in the engagement survey. It's a coin toss:</p>
        <div class="opt"><b>Great results (80% engaged)</b><br>Morale is high. Forward 5 squares.</div>
        <div class="opt"><b>Poor results (40% engaged)</b><br>Two hour engagement improvement session. Back 5 squares.</div>` + who;
    } else {
      title = 'Ordinary square';
      body = `<p>Nothing to see here. As far as anyone knows.</p>
        <p class="note">Trap doors and good surprises stay hidden until someone lands on one, and there are a few of each on every board.</p>` + who;
    }
  } else if (h.kind === 'hell') {
    kicker = 'Off the board';
    title = 'Meeting Hell';
    const inHell = st.players.filter((p) => p.inHell).map((p) => esc(p.nickname));
    body = `<p>Roll three sixes in a row (two, if you've done a Devil's Deal) and you're far too keen. You get dragged into back-to-back meetings, and that whole turn's movement is cancelled.</p>
      <p>In Meeting Hell you roll once a day. Only a 6 gets you out, back to square 1. Power-ups can't be played here, but they stay safe in your pocket.</p>
      <p class="note">${inHell.length ? `Stuck in meetings now: ${inHell.join(', ')}` : 'Nobody in there at the moment.'}</p>`;
  } else if (h.kind === 'start') {
    kicker = 'Square 0';
    title = 'First day';
    body = `<p>Everyone starts at reception with a lanyard and a laptop that isn't set up yet. ${size} squares to Long Service Leave.</p>${here(0).length ? `<p class="note">Still here: ${here(0).join(', ')}</p>` : ''}`;
  } else if (h.kind === 'export') {
    kicker = 'The finish';
    title = 'Long Service Leave';
    const done = st.players.filter((p) => p.finishedOn).map((p) => esc(p.nickname));
    body = `<p>The ultimate goal. Get past square ${size} to finish, no exact roll needed. The first player here wins the season and goes on extended leave.</p>${done.length ? `<p class="note">On leave: ${done.join(', ')}</p>` : ''}`;
  }

  const av = $('infoAvatar');
  av.classList.toggle('none', !avatar);
  if (avatar) paintAvatar(av, avatar.avatarKey, 0, { scale: 6, devil: avatar.devilMarked, hell: avatar.inHell });
  $('infoKicker').textContent = kicker;
  $('infoTitle').textContent = title;
  $('infoBody').innerHTML = body;
  $('info').classList.remove('hidden');
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------- explainer cards ----------

let cardTimer = null;
let cardDone = null;
let waitForMe = false;
try { waitForMe = localStorage.getItem('tdr-wait') === 'on'; } catch { /* ignore */ }

let cardAnimating = false;
let animFinish = null;
let animCancel = null;

function showCard(c, done) {
  const ov = $('card');
  clearTimeout(cardTimer);
  animCancel?.();
  animCancel = null;
  animFinish = null;
  cardAnimating = false;
  if (!c) { ov.classList.add('hidden'); cardDone = null; return; }
  cardDone = done;
  ov.className = `cardov tone-${c.tone ?? 'gold'}`;
  const p = c.playerId ? st.players.find((x) => x.id === c.playerId) : null;
  const av = $('cardAvatar');
  av.classList.toggle('none', !p);
  if (p) paintAvatar(av, p.avatarKey, 0, { scale: 6, devil: c.devil || p.devilMarked, hell: c.hell });
  $('cardKicker').textContent = c.kicker ?? '';
  $('cardBody').textContent = c.body ?? '';
  $('cardFoot').textContent = c.foot ?? '';
  $('waitForMe').checked = waitForMe;
  const bar = $('cardTimer');
  bar.style.transition = 'none';
  bar.style.width = '0';
  const stage = $('cardAnim');
  stage.innerHTML = '';

  const startTimer = () => {
    if (waitForMe) return;
    const ms = Math.min(11000, 4000 + 30 * ((c.body ?? '').length + (c.foot ?? '').length));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bar.style.transition = `width ${ms}ms linear`;
      bar.style.width = '100%';
    }));
    cardTimer = setTimeout(nextCard, ms);
  };
  const reveal = () => {
    cardAnimating = false;
    animFinish = null;
    $('cardTitle').textContent = c.title ?? '';
    $('cardBody').style.visibility = '';
    $('cardFoot').style.visibility = '';
    startTimer();
  };

  if (c.anim) {
    // The outcome plays out first; the words appear once it lands.
    stage.classList.remove('hidden');
    $('cardTitle').textContent = c.titleBefore ?? '...';
    $('cardBody').style.visibility = 'hidden';
    $('cardFoot').style.visibility = 'hidden';
    cardAnimating = true;
    const a = runAnim(stage, c.anim, reveal);
    animFinish = a.finish;
    animCancel = a.cancel;
  } else {
    stage.classList.add('hidden');
    $('cardTitle').textContent = c.title ?? '';
    $('cardBody').style.visibility = '';
    $('cardFoot').style.visibility = '';
    startTimer();
  }
  $('cardNext').focus({ preventScroll: true });
}

function nextCard() {
  if (cardAnimating && animFinish) { animFinish(); return; } // first press jumps to the result
  clearTimeout(cardTimer);
  animCancel?.();
  $('card').classList.add('hidden');
  const d = cardDone;
  cardDone = null;
  d?.();
}

// ---------- outcome animations ----------
// Each returns { finish() jumps to the end, cancel() stops it }. onDone is called once, when it lands.

function runAnim(stage, anim, onDone) {
  let finished = false;
  const timers = [];
  let raf = 0;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const stop = () => { timers.forEach(clearTimeout); cancelAnimationFrame(raf); };
  const land = (finalise) => { if (finished) return; finished = true; stop(); finalise(); onDone(); };

  if (anim.kind === 'coin') {
    stage.innerHTML = '<canvas class="coin" width="32" height="40"></canvas><div class="animlabel"></div>';
    const cv = stage.querySelector('canvas');
    const g = cv.getContext('2d');
    const label = stage.querySelector('.animlabel');
    const turns = 7;
    const finalAngle = turns * 2 * Math.PI + (anim.heads ? 0 : Math.PI);
    const dur = 1900;
    const t0 = performance.now();
    const draw = (angle, hop) => coinFrame(g, angle, hop);
    const finalise = () => {
      draw(finalAngle, 0);
      const won = (anim.heads ? 'heads' : 'tails') === anim.call;
      label.innerHTML = `<span class="${won ? 'good' : 'bad'}">${anim.heads ? 'HEADS' : 'TAILS'}</span><br><span class="small">Called ${anim.call}: ${won ? 'WIN' : 'LOSE'}</span>`;
    };
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - (1 - p) ** 3;
      draw(finalAngle * e, Math.sin(p * Math.PI) * 6);
      if (p < 1) raf = requestAnimationFrame(step); else land(finalise);
    };
    raf = requestAnimationFrame(step);
    sfxSafe('coin');
    return { finish: () => land(finalise), cancel: stop };
  }

  if (anim.kind === 'pick') {
    stage.innerHTML = `<div class="animq">${esc(anim.question)}</div>
      <div class="picks"><div class="pickbox" data-k="a">${esc(anim.a)}</div><div class="pickbox" data-k="b">${esc(anim.b)}</div></div>
      <div class="animlabel"></div>`;
    const boxes = [...stage.querySelectorAll('.pickbox')];
    const target = anim.answer === 'a' ? 0 : 1;
    // gaps grow so the highlight slows down, and the count is set so it stops on the answer
    const gaps = [];
    for (let gap = 70; gap < 520; gap *= 1.16) gaps.push(gap);
    if ((gaps.length - 1) % 2 !== target) gaps.push(560);
    const show = (i) => boxes.forEach((bx, k) => bx.classList.toggle('lit', k === i));
    const finalise = () => {
      show(target);
      boxes[target].classList.add('answer');
      boxes.forEach((bx) => {
        const tags = [];
        if (bx.dataset.k === anim.answer) tags.push('THE BOSS');
        if (bx.dataset.k === anim.pick) tags.push('YOUR GUESS');
        if (tags.length) bx.insertAdjacentHTML('beforeend', `<span class="tag">${tags.join(' + ')}</span>`);
      });
      const right = anim.pick === anim.answer;
      stage.querySelector('.animlabel').innerHTML = `<span class="${right ? 'good' : 'bad'}">${right ? 'RIGHT!' : 'WRONG'}</span>`;
    };
    // Right answer: spin through everyone ahead, slow down and stop on who gets sent back 3
    const r = anim.roulette;
    let tiles = null;
    const rTarget = r ? Math.max(0, r.people.findIndex((x) => x.id === r.target)) : 0;
    const buildRoulette = () => {
      if (tiles) return;
      stage.insertAdjacentHTML('beforeend', `<div class="rlabel">WHO GETS SENT BACK 3?</div><div class="roulette">${r.people.map((x) =>
        `<div class="rtile"><canvas width="32" height="32"></canvas><span>${esc(x.name)}</span></div>`).join('')}</div><div class="rresult"></div>`);
      tiles = [...stage.querySelectorAll('.rtile')];
      tiles.forEach((t, i) => { try { paintAvatar(t.querySelector('canvas'), r.people[i].avatar, 0, { scale: 2 }); } catch { /* placeholder */ } });
    };
    const showR = (i) => tiles.forEach((t, k) => t.classList.toggle('lit', k === i));
    const finaliseAll = () => {
      finalise();
      if (!r) return;
      buildRoulette();
      showR(rTarget);
      tiles[rTarget].classList.add('hit');
      stage.querySelector('.rresult').innerHTML = `<span class="bad">${esc(r.people[rTarget].name)} goes back 3</span>`;
    };
    const roulette = () => {
      buildRoulette();
      const n = tiles.length;
      const rg = [];
      // fast spin that slows down: ~2.5s, padded so the last step lands on the target
      for (let gap = 45; gap < 330; gap *= 1.14) rg.push(gap);
      if (n > 1) { while ((rg.length - 1) % n !== rTarget) rg.push(rg.at(-1) + 25); } else rg.splice(4);
      let t = 400;
      rg.forEach((gap, i) => { t += gap; later(() => { showR(i % n); sfxSafe('step'); if (i === rg.length - 1) later(() => land(finaliseAll), 350); }, t); });
    };
    let at = 0;
    gaps.forEach((gap, i) => { at += gap; later(() => {
      show(i % 2); sfxSafe('step');
      if (i === gaps.length - 1) { if (r) { finalise(); roulette(); } else land(finaliseAll); }
    }, at); });
    return { finish: () => land(finaliseAll), cancel: stop };
  }

  if (anim.kind === 'meter') {
    stage.innerHTML = `<div class="meter"><div class="needle"></div></div>
      <div class="meterlabels"><span>POOR</span><span>GREAT</span></div><div class="animlabel"></div>`;
    const needle = stage.querySelector('.needle');
    const end = anim.positive ? 82 : 18;
    const swings = [50, 85, 15, 75, 30, anim.positive ? 90 : 10, end];
    const finalise = () => {
      needle.style.transition = 'none';
      needle.style.left = `${end}%`;
      stage.querySelector('.animlabel').innerHTML = `<span class="${anim.positive ? 'good' : 'bad'}">${anim.positive ? 'GREAT RESULTS' : 'POOR RESULTS'}</span>`;
    };
    let at = 0;
    swings.forEach((pos, i) => {
      at += i === 0 ? 0 : 320 + i * 40;
      later(() => { needle.style.left = `${pos}%`; if (i === swings.length - 1) later(() => land(finalise), 450); }, at);
    });
    return { finish: () => land(finalise), cancel: stop };
  }

  if (anim.kind === 'stamp') {
    stage.innerHTML = `<div class="paper"><div class="ptitle">PROJECT SUBMISSION</div>
      <i></i><i></i><i class="short"></i><i></i><i class="short"></i>
      <div class="stamp ${anim.approved ? 'ok' : 'no'}">${anim.approved ? 'APPROVED' : 'SENT BACK'}</div></div>`;
    const stamp = stage.querySelector('.stamp');
    const finalise = () => { stamp.classList.add('down', 'instant'); };
    later(() => { stamp.classList.add('down'); sfxSafe(anim.approved ? 'powerup' : 'trap'); }, 900);
    later(() => land(finalise), 1500);
    return { finish: () => land(finalise), cancel: stop };
  }

  // unknown animation: just show the result
  later(() => land(() => {}), 0);
  return { finish: () => land(() => {}), cancel: stop };
}

/** A pixel coin seen edge-on as it spins: width follows the cosine of the angle. */
function coinFrame(g, angle, hop) {
  g.clearRect(0, 0, 32, 40);
  const c = Math.cos(angle);
  const w = Math.max(2, Math.round(Math.abs(c) * 13));
  const cy = 22 - Math.round(hop);
  const heads = c >= 0;
  const rim = '#8a5a12';
  const face = heads ? '#f2b632' : '#d9a441';
  const lite = heads ? '#ffe27a' : '#f0c870';
  for (let y = -13; y <= 13; y++) {
    const half = Math.round(Math.sqrt(Math.max(0, 169 - y * y)) * (w / 13));
    if (half <= 0) continue;
    g.fillStyle = rim; g.fillRect(16 - half - 1, cy + y, half * 2 + 2, 1);
    g.fillStyle = face; g.fillRect(16 - half, cy + y, half * 2, 1);
  }
  if (w > 8) {
    g.fillStyle = lite; g.fillRect(16 - Math.round(w * 0.6), cy - 9, 2, 6);
    pixelText(g, heads ? 'H' : 'T', 16, cy - 3, '#6b4410', { align: 'center' });
  }
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(9, 37, 14, 2);
}

function sfxSafe(name) { try { sfx(name); } catch { /* muted or unavailable */ } }

function setupCards() {
  $('cardNext').onclick = nextCard;
  $('card').onclick = (ev) => { if (ev.target.id === 'card') nextCard(); };
  $('waitForMe').onchange = (ev) => {
    waitForMe = ev.target.checked;
    try { localStorage.setItem('tdr-wait', waitForMe ? 'on' : 'off'); } catch { /* ignore */ }
    if (waitForMe) { clearTimeout(cardTimer); $('cardTimer').style.transition = 'none'; $('cardTimer').style.width = '0'; }
    else nextCard();
  };
  document.addEventListener('keydown', (ev) => {
    if (!cardDone) return;
    if ([' ', 'Enter', 'ArrowRight'].includes(ev.key)) { ev.preventDefault(); nextCard(); }
  });
}

// ---------- play by play ----------

const history = new Map(); // date -> { event, lines: [] }
let liveDate = null;
let shownDays = 3;
const narrator = new Replay(
  { size: 100, squares: [], tokens: [], flash: null },
  { caption() {}, dice() {}, standings() {}, line: (entry) => history.get(narratingDate)?.lines.push(entry) },
);
let narratingDate = null;

function addLine(date, entry) {
  const h = history.get(date);
  if (!h) return;
  h.lines.push(entry);
  renderHistory(date);
}

/** Fill in text for recent days instantly, without touching the board. Skips a day that is about to play fresh. */
async function narrateRecent(except) {
  const want = [...st.resolvedDates].reverse().filter((d) => d !== except).slice(0, shownDays);
  for (const d of want) {
    if (history.has(d)) continue;
    const r = await api.replay(d).catch(() => null);
    if (!r) continue;
    narrator.board.size = st.season.boardSize;
    narratingDate = d;
    history.set(d, { event: r.event, lines: [] });
    await narrator.play(r.log, st.players, r.event, st.squares, { instant: true });
    narratingDate = null;
  }
  renderHistory();
}

function renderHistory(liveOnly) {
  const el = $('history');
  const dates = [...history.keys()].sort().reverse();
  $('moreDays').classList.toggle('hidden', st.resolvedDates.length <= shownDays);
  if (!dates.length) return;
  const colour = (id) => avatarColour(st.players.find((p) => p.id === id)?.avatarKey);
  const isMe = (id) => st.players.find((p) => p.id === id)?.isMe;
  const nameOf = (id) => st.players.find((p) => p.id === id)?.nickname ?? '?';
  const dayHtml = (d, i) => {
    const h = history.get(d);
    let html = '';
    let open = false;
    h.lines.forEach((l, k) => {
      const last = d === liveDate && replay.running && k === h.lines.length - 1;
      if (l.turn) {
        if (open) html += '</div>';
        html += `<div class="turn${isMe(l.playerId) ? ' me' : ''}" style="--c:${colour(l.playerId)}"><span class="who">${esc(l.text)}</span>`;
        open = true;
      } else if (l.end) {
        if (open) html += '</div>';
        open = false;
        const pos = Object.entries(l.positions ?? {}).sort((a, b) => b[1] - a[1])
          .map(([id, p]) => `${esc(nameOf(id))} ${p < 0 ? 'Meeting Hell' : p > st.season.boardSize ? 'LSL' : p}`).join(', ');
        html += `<div class="end">End of day: ${pos}</div>`;
      } else {
        html += `<div class="ln${l.move ? ' mv' : ''}${last ? ' now' : ''}">${esc(l.text)}</div>`;
      }
    });
    if (open) html += '</div>';
    const ev = h.event && h.event.key !== 'quiet' ? `${esc(h.event.name)}: ${esc(h.event.text)}` : 'Business as Usual: everyone rolls as normal';
    return `<details ${i === 0 ? 'open' : ''} data-day="${d}"><summary>${fmtDate(d)}${d === liveDate && replay.running ? ' (playing)' : ''}</summary>
      <div class="ev">${ev}</div>${html || '<p class="note">Waiting for the first turn...</p>'}</details>`;
  };
  if (liveOnly && el.querySelector(`[data-day="${liveOnly}"]`)) {
    // Only scroll inside the panel, never the page, and only if the reader is following along at the bottom.
    const follow = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    const box = el.querySelector(`[data-day="${liveOnly}"]`);
    const tmp = document.createElement('div');
    tmp.innerHTML = dayHtml(liveOnly, dates.indexOf(liveOnly));
    box.replaceWith(tmp.firstElementChild);
    const now = el.querySelector('.ln.now');
    if (follow && now) {
      const bottom = now.offsetTop + now.offsetHeight + 8;
      if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
    }
    return;
  }
  el.innerHTML = dates.map(dayHtml).join('');
}

// ---------- boot ----------

async function boot() {
  if (!key && !demoMode) {
    $('nolink').classList.remove('hidden');
    $('game').classList.add('hidden');
    $('standingsBox').classList.add('hidden');
    return;
  }
  api = key ? realApi(key) : await demoApi();
  if (api.demo) setupDemo();
  setupSound();
  setupCards();
  setupBoardClicks();
  $('turnLater').onclick = () => { turnLaterFor = st.today.gameDate; showTurnBox(false); };
  $('turnFab').onclick = () => { turnLaterFor = null; renderTurn(); };
  $('howto').onclick = () => openWelcome();
  $('watch').onclick = () => watch($('days').value);
  $('skip').onclick = () => replay.skip();
  $('moreDays').onclick = async () => { shownDays += 5; await narrateRecent(liveDate); };
  await load({ autoplay: true });
  setInterval(tickCountdown, 1000);
}

async function load({ autoplay = false } = {}) {
  try {
    st = await api.state();
  } catch (e) {
    toast(e.message);
    return;
  }
  render();
  if (autoplay && !welcomed()) await openWelcome();
  const latest = st.resolvedDates.at(-1);
  const fresh = autoplay && latest && !watched(latest) ? latest : null;
  await narrateRecent(fresh ?? (replay.running ? liveDate : null));
  if (fresh) await watch(fresh);
}

// Scoped to the season, so a new season (or a new demo) never inherits old progress.
const watchKey = () => `tdr-watched:${key ? key.slice(0, 8) : 'demo'}:${st?.season.startDate ?? ''}:${st?.season.name ?? ''}`;
// First visit of each season shows the welcome pack.
const welcomeKey = () => watchKey().replace('tdr-watched', 'tdr-welcomed');
function welcomed() {
  try { return !!localStorage.getItem(welcomeKey()); } catch { return true; }
}
let welcomeOpen = false;
async function openWelcome() {
  if (welcomeOpen) return;
  welcomeOpen = true;
  showTurnBox(false);
  try { await showWelcome(st, POWERUP_BLURB); } finally {
    welcomeOpen = false;
    try { localStorage.setItem(welcomeKey(), '1'); } catch { /* ignore */ }
    render();
  }
}

function watched(date) {
  try { return (localStorage.getItem(watchKey()) ?? '') >= date; } catch { return false; }
}
function markWatched(date) {
  try { if (!watched(date)) localStorage.setItem(watchKey(), date); } catch { /* ignore */ }
}

async function watch(date) {
  if (!date || replay.running) return;
  const r = await api.replay(date).catch((e) => { toast(e.message); return null; });
  if (!r) return;
  watching = true;
  holdBack = !watched(date) && date === st.resolvedDates.at(-1);
  $('info').classList.add('hidden');
  showTurnBox(false);
  liveDate = date;
  history.set(date, { event: r.event, lines: [] });
  renderHistory();
  $('replayNote').textContent = `Replaying ${fmtDate(date)}`;
  render();
  try {
    await replay.play(r.log, st.players, r.event, st.squares);
  } finally {
    markWatched(date);
    holdBack = false;
    watching = false;
    $('replayNote').textContent = '';
    liveDate = null;
    renderHistory();
    render();
  }
}

// ---------- rendering ----------

function playerById(id) {
  const p = st.players.find((x) => x.id === id) ?? {};
  return { id, nickname: p.nickname, avatarKey: p.avatarKey, me: p.isMe, lockedIn: p.lockedIn, finished: !!p.finishedOn, devil: p.devilMarked, hellVisits: p.hellVisits };
}

function render() {
  const size = st.season.boardSize;
  if (board.size !== size) board.setSize(size);
  $('season').textContent = st.season.name + (st.season.paused ? ' (PAUSED)' : '');
  $('event').textContent = `${fmtDate(st.today.gameDate)}: ${st.today.event.name}`;
  $('event').title = todayEventText();

  if (!replay.running) {
    board.squares = board.showHidden && api.peek ? api.peek() : st.squares;
    board.tokens = st.players.map((p) => ({
      id: p.id, avatarKey: p.avatarKey, me: p.isMe, pos: p.inHell ? 0 : p.position, inHell: p.inHell, devil: p.devilMarked,
    }));
    renderStandings(st.players.map((p) => ({ ...playerById(p.id), pos: p.inHell ? 0 : p.position, inHell: p.inHell })));
  }
  if (holdBack) {
    const me = st.players.find((p) => p.isMe);
    paintAvatar($('meAvatar'), me.avatarKey, 1, { scale: 4 });
    $('meName').textContent = me.nickname;
    $('meWhere').textContent = 'New results are in...';
    $('meStats').innerHTML = '';
    $('turn').innerHTML = '<h2>Results are in</h2><p>Watch the replay, or press Skip to jump to the end.</p>';
    showTurnBox(false);
  } else {
    renderMe();
    renderTurn();
  }
  renderDays();
  deadline = st.today.msUntilReveal == null ? null : Date.now() + st.today.msUntilReveal;
  tickCountdown();
}

const runners = new Map();
function renderStandings(list) {
  const size = st.season.boardSize;
  const track = $('track');
  for (const p of list) {
    let el = runners.get(p.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'runner';
      el.dataset.pid = p.id;
      el.appendChild(document.createElement('canvas'));
      track.appendChild(el);
      runners.set(p.id, el);
    }
    el.classList.toggle('me', !!p.me);
    el.title = p.nickname;
    paintAvatar(el.firstChild, p.avatarKey, 1, { devil: p.devil, hell: p.inHell });
    el.style.left = p.inHell ? '-32px' : `${(Math.min(p.pos, size + 1) / (size + 1)) * 100}%`;
  }
  const ranked = [...list].sort((a, b) => score(b) - score(a));
  $('ranks').innerHTML = ranked.map((p, i) => `
    <span class="chip${p.me ? ' me' : ''}" data-pid="${p.id}" role="button" tabindex="0">${i + 1}. ${esc(p.nickname)}
      ${p.inHell ? '<span class="badge hell">HELL</span>' : p.pos > size ? ' LSL' : ` ${p.pos}`}
      ${p.hellVisits && !p.inHell ? '<span class="badge hell" title="Meeting Hell Survivor">HS</span>' : ''}
      ${p.devil ? '<span class="badge devil" title="Devil\'s Deal">666</span>' : ''}
      ${p.lockedIn ? '<span class="tick" title="Locked in">*</span>' : ''}
    </span>`).join('');
}
const score = (p) => (p.inHell ? -1 : p.pos);

function renderMe() {
  const me = st.players.find((p) => p.isMe);
  paintAvatar($('meAvatar'), me.avatarKey, 1, { scale: 4, devil: me.devilMarked, hell: me.inHell });
  $('meName').textContent = me.nickname;
  const size = st.season.boardSize;
  $('meWhere').innerHTML = me.inHell ? '<span class="warn">In Meeting Hell. Roll a 6 to escape.</span>'
    : me.finishedOn ? 'On Long Service Leave!' : me.position === 0 ? `First day. ${size} squares to Long Service Leave.` : `Square ${me.position} of ${size}. ${size - me.position + 1} to Long Service Leave.`;
  const m = st.me;
  const toBonus = 5 - (m.streak % 5);
  $('meStats').innerHTML = `
    <div class="stat"><span>Power-up</span><b>${m.heldPowerup ? esc(m.heldPowerup.name) : 'None'}</b></div>
    ${m.heldPowerup ? `<p class="note">${esc(m.heldPowerup.text)}</p>` : ''}
    <div class="stat"><span>Streak</span><b>${m.streak} (bonus in ${toBonus})</b></div>
    ${m.curse ? `<div class="stat"><span>Curse</span><b class="warn">Your paper is sent back for rework, ${m.curse.daysLeft} day${m.curse.daysLeft === 1 ? '' : 's'}</b></div>` : ''}
    ${m.nextRoll === 'cpi' ? '<div class="stat"><span>Next roll</span><b>Exactly 4 (agreed in principle)</b></div>' : ''}
    ${m.nextRoll === 'glass_ceiling' ? '<div class="stat"><span>Next roll</span><b class="warn">No move (consulting with industry)</b></div>' : ''}
    ${me.hellVisits ? '<div class="stat"><span>Badge</span><b>Meeting Hell Survivor</b></div>' : ''}
    ${me.devilMarked ? '<div class="stat"><span>Mark</span><b class="warn">Devil\'s Deal: 2 sixes = Meeting Hell</b></div>' : ''}`;
}

// The day's action lives in a box over the board ("Your turn"); the sidebar keeps a short status.
/** Today's event text, naming today's leader on Performance Review days. */
function todayEventText() {
  const on = st.players.filter((p) => !p.inHell && !p.finishedOn);
  const top = on.length ? Math.max(...on.map((p) => p.position)) : 0;
  return eventText(st.today.event, on.filter((p) => p.position === top).map((p) => p.nickname), on.length);
}

let turnView = 'main'; // 'main', or the decision option being looked at
let turnLaterFor = null; // game date for which the player chose "Look at the board first"
let watching = false; // a replay is loading or playing

function showTurnBox(show) {
  $('turnOv').classList.toggle('hidden', !show);
  $('turnFab').classList.toggle('hidden', show || !turnActionable());
}

function turnActionable() {
  if (!st || watching || welcomeOpen || replay.running || holdBack) return false;
  const me = st.players.find((p) => p.isMe);
  return st.season.status === 'active' && !st.season.paused && !me.finishedOn && !st.me.lockIn;
}

function renderTurn() {
  const el = $('turn');
  el.classList.remove('dim');
  const me = st.players.find((p) => p.isMe);
  const m = st.me;
  const ev = st.today.event;
  const eventLine = `<p><span class="event">${esc(ev.name)}</span><br><span class="note">${esc(todayEventText())}</span></p>`;
  const head = `<h2>${fmtDate(st.today.gameDate)}</h2>${eventLine}`;

  if (!turnActionable()) showTurnBox(false);
  if (st.season.status === 'finished') {
    const w = st.players.find((p) => p.id === st.winnerId);
    el.innerHTML = `<h2>Season over</h2><p>${w ? `${esc(w.nickname)} made it to Long Service Leave first.` : 'The host has wrapped up the season.'}</p>`;
    return;
  }
  if (st.season.status === 'setup') { el.innerHTML = '<h2>Not started</h2><p>The host hasn\'t started the season yet.</p>'; return; }
  if (st.season.paused) { el.innerHTML = '<h2>Paused</h2><p>The game is paused. See you when it\'s back.</p>'; return; }
  if (me.finishedOn) { el.innerHTML = `${head}<p class="ok">You're on Long Service Leave. Sit back and watch.</p>`; return; }

  if (m.lockIn) {
    const parts = [];
    if (m.lockIn.playPowerup && m.heldPowerup) parts.push(`Playing ${esc(m.heldPowerup.name)}`);
    const d = m.lockIn.decision;
    if (d?.choice) parts.push(d.choice === 'pass' ? 'Passing the decision' : `Taking ${esc(m.pendingDecision?.options.find((o) => o.key === d.choice)?.name ?? d.choice)}${d.coinCall ? `, calling ${d.coinCall}` : ''}${d.wyrPick && m.pendingDecision?.wyr ? `, guessing ${esc(d.wyrPick === 'a' ? m.pendingDecision.wyr.optionA : m.pendingDecision.wyr.optionB)}` : ''}`);
    el.innerHTML = `${head}<p class="ok">LOCKED IN</p><p>${api.demo ? 'Press Skip to 4pm to roll.' : 'The dice roll at 4pm.'}</p>
      ${parts.length ? `<p class="note">${parts.join('. ')}.</p><p class="note">It all plays out at 4pm, in that order: your choice first, then your roll.</p>` : ''}`;
    return;
  }

  // Sidebar: a short status that points at the box.
  const pd = m.pendingDecision;
  el.innerHTML = `<h2>Your turn</h2><p>${fmtDate(st.today.gameDate)}: lock in before 4pm.</p>
    ${pd ? '<p class="warn">You have a decision to make.</p>' : ''}
    ${m.heldPowerup && m.heldPowerup.key !== 'shield' && !me.inHell ? `<p class="note">You can play ${esc(m.heldPowerup.name)} today.</p>` : ''}
    <button id="openTurn" class="btn gold">Open your turn</button>`;
  $('openTurn').onclick = () => { turnLaterFor = null; renderTurn(); };

  // The box itself: a main screen, and one detail screen per decision option.
  paintAvatar($('turnAvatar'), me.avatarKey, 0, { scale: 4, devil: me.devilMarked, hell: me.inHell });
  $('turnTitle').textContent = fmtDate(st.today.gameDate);
  const options = pd ? [...pd.options.map((o) => o.key), 'pass'] : [];
  if (!options.includes(turnView)) turnView = 'main';
  const optionInfo = (key) => (key === 'pass'
    ? { key, name: 'Pass', text: "Play it safe. Nothing happens, and your roll goes ahead as normal." }
    : pd.options.find((o) => o.key === key));
  const canPlay = m.heldPowerup && m.heldPowerup.key !== 'shield' && !me.inHell;
  let html = '';

  if (turnView === 'main') {
    html += `<p class="intro">${me.inHell
      ? "You're in Meeting Hell. Lock in and you'll roll once at 4pm: a 6 gets you out."
      : 'Lock in before 4pm. The dice roll for everyone at 4pm.'}</p>
      <div class="evline"><span class="event">${esc(ev.name)}:</span> ${esc(todayEventText())}</div>`;
    if (canPlay) {
      html += `<button class="btn ghost puline${sel.play ? ' on' : ''}" id="playPu">
        <span class="pubox">${sel.play ? 'X' : ''}</span>
        <span><span class="puname">Play ${esc(m.heldPowerup.name)} today</span><br><span class="note">${esc(POWERUP_BLURB[m.heldPowerup.key] ?? '')}</span></span></button>`;
    } else if (m.heldPowerup?.key === 'shield') {
      html += '<p class="note">Your time in lieu works by itself on the next trap door.</p>';
    } else if (m.heldPowerup && me.inHell) {
      html += "<p class=\"note\">Power-ups don't work in Meeting Hell. It stays in your pocket.</p>";
    }
    if (pd) {
      html += `<h3>Your decision</h3><p class="intro">Pick one to see how it works. It plays out at 4pm today, before your roll.</p>
        <div class="tiles">${options.map((k) => {
          const o = optionInfo(k);
          return `<button class="btn ghost tile" data-open="${k}"><span class="tname">${esc(o.name)}</span><span class="note">${esc(DECISION_TAGLINE[k] ?? '')}</span></button>`;
        }).join('')}</div>`;
    } else {
      html += `<div style="margin-top:12px"><button class="btn roll gold" id="roll">ROLL</button></div>
        <p class="note" style="text-align:center">Locks in your turn.</p>`;
    }
  } else {
    const o = optionInfo(turnView);
    sel.decision = turnView;
    html += `<button class="btn small ghost" id="turnBack">&lt; Back to your options</button>
      <h3 class="optname">${esc(o.name)}</h3>
      <p class="intro">${esc(o.text)}</p>
      <p class="note">When: 4pm today, before your roll.${turnView === 'devils_deal' ? ' The catch lasts for the rest of the season.' : ''}</p>`;
    if (turnView === 'two_up') {
      html += `<p class="intro">Call it:</p><div class="row">
        <button class="btn ${sel.coinCall === 'heads' ? 'gold' : 'ghost'}" data-coin="heads">Heads</button>
        <button class="btn ${sel.coinCall === 'tails' ? 'gold' : 'ghost'}" data-coin="tails">Tails</button></div>`;
    }
    if (turnView === 'wyr' && pd.wyr) {
      html += `<p class="intro">${esc(pd.wyr.question)}</p><p class="note">Which way do you think the boss went?</p><div class="row">
        <button class="btn ${sel.wyrPick === 'a' ? 'gold' : 'ghost'}" data-wyr="a">${esc(pd.wyr.optionA)}</button>
        <button class="btn ${sel.wyrPick === 'b' ? 'gold' : 'ghost'}" data-wyr="b">${esc(pd.wyr.optionB)}</button></div>`;
    }
    if (sel.play && canPlay) html += `<p class="note">You're also playing ${esc(m.heldPowerup.name)} today.</p>`;
    const needPick = (turnView === 'wyr' && !sel.wyrPick) || (turnView === 'two_up' && !sel.coinCall);
    html += `<div style="margin-top:12px"><button class="btn roll gold" id="roll" ${needPick ? 'disabled' : ''}>LOCK IN</button></div>
      <p class="note" style="text-align:center">${needPick ? (turnView === 'two_up' ? 'Call heads or tails first.' : 'Pick an answer first.') : `Locks in ${esc(o.name)} and your roll for today.`}</p>`;
  }

  const body = $('turnBody');
  body.innerHTML = html;
  body.querySelectorAll('[data-open]').forEach((bt) => (bt.onclick = () => {
    turnView = bt.dataset.open; sel.decision = turnView; sel.wyrPick = null; sel.coinCall = null; renderTurn();
  }));
  body.querySelectorAll('[data-wyr]').forEach((bt) => (bt.onclick = () => { sel.wyrPick = bt.dataset.wyr; renderTurn(); }));
  body.querySelectorAll('[data-coin]').forEach((bt) => (bt.onclick = () => { sel.coinCall = bt.dataset.coin; renderTurn(); }));
  const back = $('turnBack');
  if (back) back.onclick = () => { turnView = 'main'; sel.decision = null; renderTurn(); };
  const pu = $('playPu');
  if (pu) pu.onclick = () => { sel.play = !sel.play; renderTurn(); };
  const roll = $('roll');
  if (roll) roll.onclick = lockIn;
  showTurnBox(turnActionable() && turnLaterFor !== st.today.gameDate);
}

async function lockIn() {
  const btn = $('roll');
  btn.disabled = true;
  try {
    await api.lockin({ playPowerup: sel.play, decisionChoice: st.me.pendingDecision ? sel.decision : null, wyrPick: sel.wyrPick, coinCall: sel.coinCall });
    sel = { decision: null, wyrPick: null, coinCall: null, play: false };
    turnView = 'main';
    await load();
  } catch (e) {
    toast(e.message);
    btn.disabled = false;
    await load();
  }
}

function renderDays() {
  const sel = $('days');
  const days = [...st.resolvedDates].reverse(); // newest first, newest selected
  sel.innerHTML = days.length ? days.map((d) => `<option value="${d}">${fmtDate(d)}</option>`).join('') : '<option value="">No days yet</option>';
  $('watch').disabled = !days.length;
}

function renderDice(values, opts = {}) {
  const bar = $('dice');
  if (!values) { bar.innerHTML = ''; return; }
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  bar.innerHTML = values.map((v) => `<div class="die${opts.tumble ? ' tumble' : ''}${v === 6 && !opts.tumble ? ' six' : ''}">
    ${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[v].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`).join('');
}

// ---------- countdown ----------

function tickCountdown() {
  const el = $('countdown');
  if (!st) return;
  if (api.demo) { el.textContent = 'DEMO MODE'; return; }
  if (deadline == null || st.season.status !== 'active' || st.season.paused) { el.textContent = ''; return; }
  const ms = deadline - Date.now();
  if (ms > 0) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    el.textContent = `4PM IN ${h}:${mm}:${ss}`;
  } else {
    el.textContent = 'ROLLING...';
    if (!waitingForReveal) {
      waitingForReveal = true;
      const before = st.resolvedDates.length;
      const poll = async () => {
        await load({ autoplay: true });
        if (st.resolvedDates.length > before) waitingForReveal = false;
        else setTimeout(poll, 15000);
      };
      setTimeout(poll, 3000);
    }
  }
}

// ---------- misc ----------

function setupDemo() {
  $('demoBox').classList.remove('hidden');
  $('advance').onclick = async () => {
    if (replay.running) return;
    await api.advance();
    $('labNote').textContent = '';
    await load({ autoplay: true });
  };
  $('advance').disabled = false;
  $('newDemo').onclick = async () => {
    replay.skip();
    api.reset('Rookie', $('demoSwap').checked);
    sel = { decision: null, wyrPick: null, coinCall: null, play: false };
    turnView = 'main';
    try { localStorage.removeItem(watchKey()); } catch { /* ignore */ }
    history.clear();
    $('history').innerHTML = '<p class="note">Nothing yet. Lock in, then Skip to 4pm.</p>';
    await load();
  };
  // Test lab
  const groups = [...new Set(api.scenarios.map((x) => x.group))];
  $('labPick').innerHTML = groups.map((g) => `<optgroup label="${esc(g)}">${api.scenarios.filter((x) => x.group === g)
    .map((x) => `<option value="${x.key}">${esc(x.label)}</option>`).join('')}</optgroup>`).join('');
  $('labEvent').innerHTML = api.events.map((e) => `<option value="${e.key}">${esc(e.name)}</option>`).join('');
  $('labGo').onclick = async () => {
    if (replay.running) return;
    try {
      const then = api.scenario($('labPick').value);
      sel = { decision: null, wyrPick: null, coinCall: null, play: false };
      turnView = 'main';
      $('labNote').textContent = `Ready (today's event reset to Business as Usual). ${then}`;
      await load();
    } catch (e) { toast(e.message); }
  };
  $('labEventGo').onclick = async () => {
    if (replay.running) return;
    api.setEvent($('labEvent').value);
    $('labNote').textContent = `Today's event is now ${$('labEvent').selectedOptions[0].text}. Lock in, then Skip to 4pm.`;
    await load();
  };
  $('peek').onchange = () => {
    board.showHidden = $('peek').checked;
    if (board.showHidden) board.squares = api.peek();
    else board.squares = st.squares;
  };
}

function setupSound() {
  const b = $('sound');
  const label = () => (b.textContent = `Sound: ${isMuted() ? 'off' : 'on'}`);
  label();
  b.onclick = () => { setMuted(!isMuted()); label(); };
}

function fmtDate(d) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 4000);
}

boot();
