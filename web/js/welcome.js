// First-day welcome: a short paged onboarding pack shown once per season,
// and again any time from the "How to play" button.
import { paintAvatar } from './sprites.js';
import { POWERUP_NAMES } from './replay.js';

// Edit these two lines to change the team intro and when the season wraps up.
export const TEAM_LINE = "Welcome to the Data and Integration team! We're still working on the name, don't worry.";
export const SEASON_END = 'Christmas Eve';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function pages(st, blurbs) {
  const me = st.players.find((p) => p.isMe) ?? {};
  const size = st.season.boardSize;
  const pus = ['double_dice', 'shield', 'lucky_roll', ...(st.season.swapEnabled ? ['swap'] : [])];
  return [
    {
      kicker: 'Day one', title: 'Welcome aboard!', avatar: me,
      body: `<p class="wlead">${esc(TEAM_LINE)}</p>
        <p>Your lanyard is at reception and your laptop is still being set up. While IT sorts that out, here's how things work around here.</p>
        <p class="note">That's you on the left, ${esc(me.nickname ?? 'new starter')}. Everyone else is on the board too.</p>`,
    },
    {
      kicker: 'Your day', title: 'One tap a day',
      body: `<div class="wsteps">
        <div class="wstep"><b>BEFORE 4PM</b><span>Open your turn and lock in. It takes ten seconds.</span></div>
        <div class="wstep"><b>4PM</b><span>Everyone's dice roll at once.</span></div>
        <div class="wstep"><b>AFTER 4PM</b><span>Come back and watch the replay to see who got lucky.</span></div>
      </div>
      <p class="note">Forgot to lock in? Your dice still roll, but any decision is passed and power-ups stay in your pocket. Lock in 5 days in a row and you earn a free power-up.</p>`,
    },
    {
      kicker: 'The goal', title: 'Long Service Leave',
      body: `<p>Get from your first day to Long Service Leave, ${size} squares away. First one there wins.</p>
        <p>On the way you'll work through Onboarding, Open Plan, Meeting Rooms, Dedicated Desk and the Dedicated Car Space.</p>
        <p class="note">We play weekdays until ${esc(SEASON_END)}.</p>`,
    },
    {
      kicker: 'Know your squares', title: "What's on the board",
      body: `<div class="wkey">
        <div class="wk k-pu"><b>Power-up</b><span>Finish your roll here to pick one up.</span></div>
        <div class="wk k-dec"><b>Decision</b><span>Choose a gamble at your next lock-in, or play it safe.</span></div>
        <div class="wk k-sv"><b>Engagement survey</b><span>A coin toss: forward 5 or back 5.</span></div>
        <div class="wk k-hid"><b>Hidden squares</b><span>Trap doors send you back, good surprises push you on. Nobody knows where they are until someone lands on one.</span></div>
      </div>`,
    },
    {
      kicker: 'Handle with care', title: 'Power-ups and Meeting Hell',
      body: `<div class="wkey">${pus.map((k) => `<div class="wk k-pu"><b>${esc(POWERUP_NAMES[k])}</b><span>${esc(blurbs[k])}</span></div>`).join('')}</div>
        <p class="note">A 6 earns another roll, but three 6s in a row and you're far too keen: you get dragged into <b class="hell">Meeting Hell</b>. Only a 6 gets you out.</p>`,
    },
    {
      kicker: 'Onboarding complete', title: "You're all set",
      body: `<p>Tap any player or square on the board to see what it is.</p>
        <p>Each day has an event that shakes things up, shown at the top of the page and in your turn box.</p>
        <p class="wlead">Good luck, and see you on Long Service Leave.</p>`,
      last: true,
    },
  ];
}

/** Shows the welcome pack. Resolves when it's closed. */
export function showWelcome(st, blurbs) {
  const ps = pages(st, blurbs);
  const ov = document.getElementById('welcome');
  let i = 0;
  return new Promise((resolve) => {
    const close = () => { ov.classList.add('hidden'); document.removeEventListener('keydown', onKey); resolve(); };
    const go = (n) => { i = Math.max(0, Math.min(ps.length - 1, n)); draw(); };
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); ps[i].last ? close() : go(i + 1); }
      else if (e.key === 'ArrowLeft') go(i - 1);
      else if (e.key === 'Escape') close();
    };
    function draw() {
      const p = ps[i];
      const av = p.avatar?.avatarKey;
      ov.innerHTML = `<div class="cardbox wbox">
        <div class="cardhead">
          ${av ? '<canvas id="wAvatar"></canvas>' : ''}
          <div><div class="kicker">${esc(p.kicker)}</div><h2>${esc(p.title)}</h2></div>
        </div>
        <div class="wbody">${p.body}</div>
        <div class="wdots">${ps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="row wnav">
          ${i > 0 ? '<button class="btn small ghost" data-w="back">&lt; Back</button>' : '<button class="btn small ghost" data-w="skip">Skip intro</button>'}
          <button class="btn gold" data-w="next">${p.last ? 'START MY FIRST DAY' : 'NEXT'}</button>
        </div>
      </div>`;
      if (av) { try { paintAvatar(ov.querySelector('#wAvatar'), av, 0, { scale: 6 }); } catch { /* placeholder */ } }
      ov.querySelector('[data-w="next"]').onclick = () => (p.last ? close() : go(i + 1));
      ov.querySelector('[data-w="back"]')?.addEventListener('click', () => go(i - 1));
      ov.querySelector('[data-w="skip"]')?.addEventListener('click', close);
    }
    document.addEventListener('keydown', onKey);
    ov.classList.remove('hidden');
    draw();
  });
}
