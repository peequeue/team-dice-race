// Demo backend: runs the real engine in the browser against seven bots, with a
// "skip to 4pm" button instead of a clock. Same response shapes as the `play` function.
import {
  createRng, generateBoard, generateEventSequence, getEvent, newPlayer, nextWeekday, resolveDay,
  lockInDate, weekdaysBetween, addDays, DEFAULT_CONFIG, DEFAULT_SPEC, DECISION_NAMES, DECISION_TEXT, POWERUP_NAMES, POWERUP_TEXT, EVENTS,
} from '../../supabase/functions/_shared/engine/index.ts';
import type {
  DecisionChoice, DecisionOption, LockIn, LogEntry, PendingDecision, PlayerState, Square, WyrQuestion,
} from '../../supabase/functions/_shared/engine/index.ts';

const STORE = 'tdr-demo-v5';
const BOTS = ['Dusty', 'Banjo', 'Maz', 'Tex', 'Kel', 'Shazza', 'Robbo'];
const DEMO_AVATARS = ['viking', 'boot', 'bulldozer', 'sailboat', 'racecar', 'heeler', 'platypus', 'angus'];
const SAMPLE_WYR: [string, string, string][] = [
  ['Would you rather: ice cream or fries?', 'Ice cream', 'Fries'],
  ['Would you rather: no more meetings or no more email?', 'No meetings', 'No email'],
  ['Would you rather: early start or late finish?', 'Early start', 'Late finish'],
  ['Would you rather: tomato sauce in the fridge or the cupboard?', 'Fridge', 'Cupboard'],
  ['Would you rather: camera on or camera off?', 'Camera on', 'Camera off'],
  ['Would you rather: Friday drinks or Monday breakfast?', 'Friday drinks', 'Monday breakfast'],
  ['Would you rather: window seat or aisle seat?', 'Window seat', 'Aisle seat'],
  ['Would you rather: Vegemite or peanut butter?', 'Vegemite', 'Peanut butter'],
  ['Would you rather: work from home or the office?', 'Home', 'Office'],
  ['Would you rather: present to the board or write the board paper?', 'Present', 'Write it'],
];

interface DemoState {
  date: string;
  startDate: string;
  players: PlayerState[];
  avatars: Record<string, string>;
  squares: Square[];
  events: Record<string, string>;
  logs: Record<string, LogEntry[]>;
  lockIns: Record<string, LockIn>; // for the current date
  wyrAvailable: WyrQuestion[];
  answers: Record<string, 'a' | 'b'>;
  winnerId: string | null;
  swapEnabled: boolean;
  seasonTag?: string;
  rigged?: Record<string, number[]>; // test lab: your next dice
}

/** Test lab scenarios. Each sets up the demo player (Rookie) so a mechanic happens at the next 4pm. */
export const SCENARIOS: { key: string; group: string; label: string; then: string }[] = [
  { key: 'dec_twoup_wyr', group: 'Decisions', label: 'Offer: Two-Up or 1:1 time', then: 'Pick one (call heads or tails, or guess the boss), press ROLL, then Skip to 4pm.' },
  { key: 'dec_wfh_prc', group: 'Decisions', label: 'Offer: Work From Home or Submitted project to PRC', then: 'Pick one, press ROLL, then Skip to 4pm.' },
  { key: 'dec_devil', group: 'Decisions', label: "Offer: Devil's Deal or Two-Up", then: "Pick Devil's Deal, press ROLL, then Skip to 4pm. Watch for the horns." },
  { key: 'pu_kpi', group: 'Power-ups', label: 'Hold All FY KPIs Met!', then: 'Tick it on the lock-in panel, press ROLL, then Skip to 4pm.' },
  { key: 'pu_lucky', group: 'Power-ups', label: 'Hold Ctrl+Z (and your first die will be a 1)', then: 'Tick it, press ROLL, then Skip to 4pm. The 1 gets undone and re-rolled.' },
  { key: 'pu_til_trap', group: 'Power-ups', label: 'Hold Time in lieu, about to land on a trap door', then: 'Press ROLL (nothing to tick), then Skip to 4pm.' },
  { key: 'pu_swap', group: 'Power-ups', label: 'Hold Hot Desk Swap (turns Swap on)', then: 'Tick it, press ROLL, then Skip to 4pm. You swap with whoever is just ahead.' },
  { key: 'sq_trap', group: 'Squares', label: 'Land on a trap door', then: 'Press ROLL, then Skip to 4pm.' },
  { key: 'sq_consult', group: 'Squares', label: 'Land on Consult with industry', then: 'Press ROLL, then Skip to 4pm. Then lock in and skip again to see the frozen turn.' },
  { key: 'sq_boost', group: 'Squares', label: 'Land on a good surprise', then: 'Press ROLL, then Skip to 4pm.' },
  { key: 'sq_agreed', group: 'Squares', label: 'Land on Agreed in principle', then: 'Press ROLL, then Skip to 4pm. Lock in and skip again to see the guaranteed 4.' },
  { key: 'sq_survey', group: 'Squares', label: 'Land on an engagement survey', then: 'Press ROLL, then Skip to 4pm. It is 50/50, so try it a few times.' },
  { key: 'sq_powerup', group: 'Squares', label: 'Land on a power-up square', then: 'Press ROLL, then Skip to 4pm.' },
  { key: 'sq_decision', group: 'Squares', label: 'Land on a decision square', then: 'Press ROLL, then Skip to 4pm. Your choice appears on the lock-in panel for the next day.' },
  { key: 'dice_two_sixes', group: 'Dice', label: 'Roll 6, 6, then 2', then: 'Press ROLL, then Skip to 4pm.' },
  { key: 'dice_hell', group: 'Dice', label: 'Roll three sixes (Meeting Hell)', then: 'Press ROLL, then Skip to 4pm.' },
  { key: 'hell_escape', group: 'Dice', label: 'Start in Meeting Hell and roll a 6', then: 'Press ROLL, then Skip to 4pm.' },
  { key: 'hell_stay', group: 'Dice', label: 'Start in Meeting Hell and roll a 2', then: 'Press ROLL, then Skip to 4pm.' },
  { key: 'streak', group: 'Other', label: 'Next lock-in is your 5th in a row', then: 'Press ROLL, then Skip to 4pm. Streak reward.' },
  { key: 'finish', group: 'Other', label: '3 squares from Long Service Leave', then: 'Press ROLL, then Skip to 4pm. You win the season.' },
];

function fresh(myName: string, swapEnabled: boolean): DemoState {
  const rng = createRng(crypto.randomUUID());
  const start = lockInDate(new Date());
  const names = [myName, ...BOTS];
  const players = names.map((n, i) => newPlayer(`p${i}`, n));
  const questions = SAMPLE_WYR.map(([q, a, b], i) => ({ id: `q${i}`, question: q, optionA: a, optionB: b }));
  return {
    date: start,
    startDate: start,
    players,
    avatars: Object.fromEntries(players.map((p, i) => [p.id, DEMO_AVATARS[i % DEMO_AVATARS.length]])),
    squares: generateBoard(rng),
    events: generateEventSequence(weekdaysBetween(start, addDays(start, 365)), rng),
    logs: {},
    lockIns: {},
    wyrAvailable: questions,
    answers: Object.fromEntries(questions.map((q) => [q.id, rng.chance(0.5) ? 'a' : 'b'])),
    winnerId: null,
    swapEnabled,
    seasonTag: `#${Math.floor(Math.random() * 900) + 100}`,
  };
}

let memory: DemoState | null = null;
function load(): DemoState | null {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return JSON.parse(raw);
  } catch { /* storage unavailable */ }
  return memory;
}
function save(s: DemoState) {
  memory = s;
  try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* ignore */ }
}

export function createDemoApi() {
  let s = load() ?? fresh('Rookie', false);
  save(s);
  const me = () => s.players[0];

  const api = {
    demo: true,
    async state() {
      const ev = getEvent(s.events[s.date] ?? 'quiet');
      const m = me();
      const mine = s.lockIns[m.id];
      return {
        season: { name: `Demo season ${s.seasonTag ?? ''}`.trim(), status: s.winnerId ? 'finished' : 'active', paused: false, boardSize: DEFAULT_SPEC.size, startDate: s.startDate, swapEnabled: s.swapEnabled },
        players: s.players.map((p) => ({
          id: p.id, nickname: p.nickname, avatarKey: s.avatars[p.id], position: p.position, inHell: p.inHell,
          hellVisits: p.hellVisits, devilMarked: p.devilMarked, streak: p.streak, finishedOn: p.finishedOn,
          heldPowerup: p.heldPowerup, curse: p.curse, nextRoll: p.nextRoll, hasDecision: !!p.pendingDecision,
          isMe: p.id === m.id, lockedIn: !!s.lockIns[p.id],
        })),
        squares: s.squares.map((q) => (!q.revealed
          ? { idx: q.idx, type: 'normal' }
          : { idx: q.idx, type: q.type, payload: q.type === 'trap' || q.type === 'boost' ? q.payload : undefined })),
        me: {
          id: m.id,
          heldPowerup: m.heldPowerup && { key: m.heldPowerup, name: POWERUP_NAMES[m.heldPowerup], text: POWERUP_TEXT[m.heldPowerup] },
          pendingDecision: m.pendingDecision && {
            options: m.pendingDecision.options.map((o) => ({ key: o, name: DECISION_NAMES[o], text: DECISION_TEXT[o] })),
            wyr: m.pendingDecision.wyr ?? null,
          },
          streak: m.streak,
          curse: m.curse,
          nextRoll: m.nextRoll,
          lockIn: mine ? { playPowerup: mine.playPowerup, decision: mine.decisionChoice ? { choice: mine.decisionChoice, wyrPick: mine.wyrPick, coinCall: mine.coinCall } : null } : null,
        },
        today: { gameDate: s.date, event: { key: ev.key, name: ev.name, text: ev.text }, msUntilReveal: null },
        resolvedDates: Object.keys(s.logs).sort(),
        winnerId: s.winnerId,
      };
    },

    async lockin(body: { playPowerup?: boolean; decisionChoice?: DecisionChoice | null; wyrPick?: 'a' | 'b'; coinCall?: 'heads' | 'tails' }) {
      const m = me();
      if (s.winnerId) throw new Error('The season is over. Start a new demo.');
      if (s.lockIns[m.id]) throw new Error("You're already locked in for today");
      let choice: DecisionChoice | null = null;
      if (m.pendingDecision) {
        choice = (body.decisionChoice ?? 'pass') as DecisionChoice;
        if (choice === 'wyr' && body.wyrPick !== 'a' && body.wyrPick !== 'b') throw new Error('Pick A or B');
        if (choice === 'two_up' && body.coinCall !== 'heads' && body.coinCall !== 'tails') throw new Error('Call heads or tails');
      }
      s.lockIns[m.id] = {
        playerId: m.id,
        playPowerup: !!body.playPowerup && !!m.heldPowerup && m.heldPowerup !== 'shield',
        decisionChoice: choice,
        wyrPick: choice === 'wyr' ? body.wyrPick : undefined,
        coinCall: choice === 'two_up' ? body.coinCall : undefined,
      };
      save(s);
      return { ok: true };
    },

    async replay(date: string) {
      const ev = getEvent(s.events[date] ?? 'quiet');
      return { date, log: s.logs[date] ?? [], event: { key: ev.key, name: ev.name, text: ev.text } };
    },

    async hall() { return { hall: [] }; },

    /** Demo only: bots lock in, then the 4pm reveal runs. */
    async advance() {
      if (s.winnerId) return { date: null };
      const rng = createRng(crypto.randomUUID());
      for (const p of s.players.slice(1)) {
        if (p.finishedOn || !rng.chance(0.85)) continue;
        s.lockIns[p.id] = {
          playerId: p.id,
          playPowerup: rng.chance(0.7),
          decisionChoice: p.pendingDecision ? (rng.chance(0.25) ? 'pass' : rng.pick(p.pendingDecision.options)) : null,
          wyrPick: rng.chance(0.5) ? 'a' : 'b',
          coinCall: rng.chance(0.5) ? 'heads' : 'tails',
        };
      }
      const date = s.date;
      const r = resolveDay({
        date,
        eventKey: s.events[date] ?? 'quiet',
        config: { ...DEFAULT_CONFIG, swapEnabled: s.swapEnabled },
        players: s.players,
        squares: s.squares,
        lockIns: Object.values(s.lockIns),
        wyrAvailable: s.wyrAvailable,
        wyrAnswers: s.answers,
        riggedDice: s.rigged ?? {},
      }, rng);
      s.rigged = {};
      s.players = r.players;
      s.squares = r.squares;
      s.wyrAvailable = s.wyrAvailable.filter((q) => !r.usedQuestionIds.includes(q.id));
      s.logs[date] = r.log;
      s.lockIns = {};
      s.winnerId = r.winnerId;
      s.date = nextWeekday(date);
      save(s);
      return { date };
    },

    reset(name = 'Rookie', swapEnabled = false) {
      s = fresh(name, swapEnabled);
      save(s);
    },

    /** Test lab: set Rookie up so a mechanic happens at the next 4pm. Returns what to do next. */
    scenario(key: string) {
      const sc = SCENARIOS.find((x) => x.key === key);
      if (!sc) throw new Error('Unknown scenario');
      if (s.winnerId) s = fresh('Rookie', s.swapEnabled);
      const m = s.players[0];
      delete s.lockIns[m.id];
      m.inHell = false;
      m.finishedOn = null;
      m.pendingDecision = null;
      m.nextRoll = null;
      m.curse = null;
      if (m.position < 10) m.position = 10;
      s.rigged = {};
      // A daily event could change the rigged roll (or switch trap doors off), so reset it.
      // The person can still pick an event afterwards with "Set today's event".
      s.events[s.date] = 'quiet';
      const offer = (options: [DecisionOption, DecisionOption]) => {
        const pd: PendingDecision = { options, triggerMove: 4, offeredOn: s.date };
        if (options.includes('wyr')) {
          if (!s.wyrAvailable.length) s.wyrAvailable = SAMPLE_WYR.map(([q, a, b], i) => ({ id: `q${i}r${Date.now()}`, question: q, optionA: a, optionB: b }));
          for (const q of s.wyrAvailable) if (!s.answers[q.id]) s.answers[q.id] = Math.random() < 0.5 ? 'a' : 'b';
          pd.wyr = s.wyrAvailable.shift();
        }
        m.pendingDecision = pd;
      };
      const landOn = (pred: (q: Square) => boolean) => {
        const target = s.squares.find((q) => q.idx >= 5 && pred(q));
        if (!target) throw new Error('No such square on this board');
        m.position = target.idx - 3;
        s.rigged = { [m.id]: [3] };
      };
      switch (key) {
        case 'dec_twoup_wyr': offer(['two_up', 'wyr']); break;
        case 'dec_wfh_prc': offer(['book_truck', 'consignment']); break;
        case 'dec_devil': m.devilMarked = false; offer(['devils_deal', 'two_up']); break;
        case 'pu_kpi': m.heldPowerup = 'double_dice'; break;
        case 'pu_lucky': m.heldPowerup = 'lucky_roll'; s.rigged = { [m.id]: [1] }; break;
        case 'pu_til_trap': m.heldPowerup = 'shield'; landOn((q) => q.type === 'trap' && !q.payload?.effect); break;
        case 'pu_swap': s.swapEnabled = true; m.heldPowerup = 'swap'; m.position = Math.min(...s.players.slice(1).filter((p) => !p.finishedOn).map((p) => p.position), 60); m.position = Math.max(0, m.position - 8); break;
        case 'sq_trap': m.heldPowerup = m.heldPowerup === 'shield' ? null : m.heldPowerup; landOn((q) => q.type === 'trap' && !q.payload?.effect); break;
        case 'sq_consult': m.heldPowerup = m.heldPowerup === 'shield' ? null : m.heldPowerup; landOn((q) => q.payload?.effect === 'glass_ceiling'); break;
        case 'sq_boost': landOn((q) => q.type === 'boost' && !q.payload?.effect); break;
        case 'sq_agreed': landOn((q) => q.payload?.effect === 'cpi'); break;
        case 'sq_survey': landOn((q) => q.type === 'survey'); break;
        case 'sq_powerup': m.heldPowerup = null; landOn((q) => q.type === 'powerup'); break;
        case 'sq_decision': landOn((q) => q.type === 'decision'); break;
        case 'dice_two_sixes': m.devilMarked = false; s.rigged = { [m.id]: [6, 6, 2] }; break;
        case 'dice_hell': s.rigged = { [m.id]: [6, 6, 6] }; break;
        case 'hell_escape': m.inHell = true; m.position = 0; s.rigged = { [m.id]: [6] }; break;
        case 'hell_stay': m.inHell = true; m.position = 0; s.rigged = { [m.id]: [2] }; break;
        case 'streak': m.streak = 4; break;
        case 'finish': m.position = DEFAULT_SPEC.size - 2; s.rigged = { [m.id]: [4] }; break;
      }
      save(s);
      return sc.then;
    },

    /** Test lab: set today's daily event. */
    setEvent(key: string) {
      getEvent(key);
      s.events[s.date] = key;
      save(s);
    },

    scenarios: SCENARIOS,
    events: EVENTS.map((e) => ({ key: e.key, name: e.name })),

    /** Demo only: the full board, hidden traps included. */
    peek() { return s.squares; },
  };
  return api;
}

(globalThis as Record<string, unknown>).TDR_DEMO = { createDemoApi };
