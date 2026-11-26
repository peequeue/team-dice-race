// Animated replay, rendered entirely from a day's event log.
import { sfx } from './sound.js';

export const POWERUP_NAMES = { double_dice: 'All FY KPIs Met!', shield: 'Time in lieu', lucky_roll: 'Ctrl+Z', swap: 'Hot Desk Swap' };
export const DECISION_NAMES = {
  two_up: 'Two-Up', wyr: '1:1 time', book_truck: 'Work From Home', consignment: 'Submitted project to PRC', devils_deal: "Devil's Deal", pass: 'Pass',
};
const A_POWERUP = { double_dice: 'the All FY KPIs Met! power-up', shield: 'some time in lieu', lucky_roll: 'a Ctrl+Z', swap: 'a Hot Desk Swap' };
const EVENT_FOOT = {
  gates_shut: 'Trap doors are back in business tomorrow. Good surprises still work today.',
  fair_dinkum: "It only affects today's main rolls. Anyone already in Meeting Hell still needs a 6 to escape.",
  back_of_mob: 'Last place is judged on where everyone stood before today started.',
  audit: 'The leader is whoever was furthest along the board when today started.',
};
export const POWERUP_TEXT = {
  double_dice: "All FY KPIs Met! Play it to roll two dice and add them together. Sixes don't roll again with it, so there's no risk of Meeting Hell.",
  shield: "Time in lieu: it works on its own. You're off when the next trap door lands, so it can't touch you. Then it's used up.",
  lucky_roll: 'Ctrl+Z: play it and, if the roll comes up a 1 or 2, it gets undone and rolled again automatically.',
  swap: 'Hot Desk Swap: play it and, after moving, swap desks with whoever is just ahead.',
};
export const DECISION_TEXT = {
  two_up: 'Call heads or tails. Right, and you move forward x2 the roll that got you here. Wrong, and you go back the same amount.',
  wyr: 'In your 1:1, guess which way the boss answered a this-or-that question. Right, and a random player ahead of you goes back 3. Wrong, and you go back 2.',
  book_truck: "Skip today's roll and move exactly 4 squares instead. No sixes, so no risk of Meeting Hell.",
  consignment: "Put your project in front of the Project Review Committee. Two times in three it's approved and you get a power-up (or 3 squares if your hands are full). Otherwise it's sent back for rework, which halves your next two rolls.",
  devils_deal: 'Jump forward 10 squares straight away. The catch: for the rest of the season, two sixes in a row sends you to Meeting Hell instead of three.',
};
const REASONS = {
  trap: null, two_up: null, wyr_hit: null, wyr_wrong: null, boost: null, survey_good: null, survey_bad: null,
  consignment_bonus: "Hands are already full, so it's 3 bonus squares instead", devils_deal: null, hell_escape: null,
  swap: null, swapped: null, bonus_roll: null, streak_bonus: null,
};

/** Event text with the leader named on Performance Review days. names: nicknames of the leader(s). */
export function eventText(ev, names = [], total = 0) {
  if (ev?.key !== 'audit' || !names.length) return ev?.text ?? '';
  if (names.length > 1 && names.length === total) return "Nobody has submitted their quarterly check-in! Everyone loses 2 squares off their roll today, but always moves at least one.";
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return ev.text.replace("The leader hasn't submitted their quarterly check-in", `${who} ${names.length === 1 ? "hasn't" : "haven't"} submitted their quarterly check-in`);
}

export class Replay {
  /**
   * @param board Board instance
   * @param ui { caption(text|null), dice(values|null, {tumble, six}), standings(view) }
   */
  constructor(board, ui) {
    this.board = board;
    this.ui = ui;
    this.running = false;
    this.skipping = false;
  }

  sleep(ms) {
    if (this.skipping) return Promise.resolve();
    return new Promise((r) => setTimeout(r, ms));
  }

  skip() {
    this.skipping = true;
    this.cardDone?.();
    this.ui.card?.(null);
  }

  /** Nicknames of whoever led the on-board players at the start of the day (ties included). */
  leadersAtStart(positions = {}) {
    const on = Object.entries(positions).filter(([, p]) => p >= 0 && p <= this.board.size);
    if (!on.length) return [];
    const top = Math.max(...on.map(([, p]) => p));
    this.onBoardAtStart = on.length;
    return on.filter(([, p]) => p === top).map(([id]) => this.nick[id]).filter(Boolean);
  }

  /** Big explainer card. Waits for the timer or the viewer. Not shown when skipping. */
  async card(c) {
    if (this.skipping || !this.ui.card) return;
    this.ui.caption(null);
    await new Promise((resolve) => {
      this.cardDone = resolve;
      this.ui.card(c, resolve);
    });
    this.cardDone = null;
  }

  note(text) { this.ui.line?.({ playerId: this.current, text }); }

  /** players: [{id, nickname, avatarKey, devilMarked, isMe}] (current state), log: event rows */
  async play(log, players, eventInfo, squares, { instant = false } = {}) {
    this.running = true;
    this.skipping = instant;
    this.current = null;
    this.mergedReward = false;
    this.nick = Object.fromEntries(players.map((p) => [p.id, p.nickname]));
    this.avatar = Object.fromEntries(players.map((p) => [p.id, p.avatarKey]));
    const start = log.find((e) => e.kind === 'day_start');
    const dealsToday = new Set(log.filter((e) => e.kind === 'devils_deal').map((e) => e.playerId));
    // board as it was before the day: traps revealed today start hidden
    const revealedToday = new Set(log.filter((e) => e.kind === 'trap' && e.data.firstReveal).map((e) => e.data.idx));
    this.board.squares = squares.map((s) => (revealedToday.has(s.idx) ? { idx: s.idx, type: 'normal' } : s));
    this.squares = squares;
    this.view = new Map(players.map((p) => {
      const pos = start?.data.positions?.[p.id] ?? 0;
      return [p.id, {
        id: p.id, avatarKey: p.avatarKey, me: p.isMe, pos: pos === -1 ? 0 : pos, inHell: pos === -1,
        devil: p.devilMarked && !dealsToday.has(p.id), walking: false, focus: false,
      }];
    }));
    this.sync();
    try {
      for (const [i, e] of log.entries()) {
        this.next = log[i + 1];
        await this.step(e, eventInfo);
      }
    } finally {
      for (const t of this.view.values()) { t.walking = false; t.focus = false; }
      this.board.squares = squares;
      this.sync();
      this.ui.caption(null);
      this.ui.dice(null);
      this.running = false;
    }
  }

  sync() {
    this.board.tokens = [...this.view.values()];
    this.ui.standings(this.view);
  }

  async say(text, ms = 1300, { record = true } = {}) {
    if (record) this.ui.line?.({ playerId: this.current, text });
    if (this.skipping) return;
    this.ui.caption(text);
    await this.sleep(ms);
  }

  async rollDice(values, opts = {}) {
    if (this.skipping) return;
    sfx('dice');
    this.ui.dice(values.map(() => 1 + Math.floor(Math.random() * 6)), { tumble: true });
    for (let k = 0; k < 5; k++) {
      await this.sleep(90);
      this.ui.dice(values.map(() => 1 + Math.floor(Math.random() * 6)), { tumble: true });
    }
    this.ui.dice(values, opts);
    await this.sleep(500);
  }

  async walk(t, from, to, passive) {
    const size = this.board.size;
    const target = Math.min(to, size + 1);
    if (this.skipping) { t.pos = target; this.sync(); return; }
    const dir = target > from ? 1 : -1;
    t.walking = true;
    for (let p = from; p !== target; ) {
      p += dir;
      t.pos = p;
      this.sync();
      sfx(passive ? 'slide' : 'step');
      await this.sleep(passive ? 70 : 150);
    }
    t.walking = false;
    this.sync();
    await this.sleep(150);
  }

  async step(e, eventInfo) {
    const t = e.playerId ? this.view.get(e.playerId) : null;
    const who = e.playerId ? this.nick[e.playerId] ?? 'Someone' : '';
    const d = e.data;
    switch (e.kind) {
      case 'day_start':
        if (eventInfo?.key && eventInfo.key !== 'quiet') {
          await this.card({ kicker: "Today's event", title: eventInfo.name, tone: 'gold', body: eventText(eventInfo, this.leadersAtStart(d.positions), this.onBoardAtStart),
            foot: EVENT_FOOT[eventInfo.key] ?? "It applies to everyone's main roll today, but not to Work From Home, Meeting Hell rolls or bonus rolls." });
        } else {
          await this.say('Business as usual. Everyone rolls as normal.', 1400, { record: false });
        }
        break;
      case 'turn_start':
        this.current = e.playerId;
        this.ui.line?.({ playerId: e.playerId, turn: true, text: `${who}${d.manual ? '' : ' (auto-roll)'}`, from: d.position });
        for (const o of this.view.values()) o.focus = false;
        if (t) t.focus = true;
        this.sync();
        this.ui.dice(null);
        await this.say(`${who}'s turn${d.manual ? '' : ' (auto-roll)'}${d.inHell ? ', rolling from Meeting Hell' : ''}`, 900, { record: false });
        break;
      case 'decision':
        if (d.choice === 'pass') await this.say(d.auto ? `${who} didn't lock in, so the decision passes` : `${who} decides to play it safe and pass`);
        else await this.say(`${who} goes for ${DECISION_NAMES[d.choice]}`);
        break;
      case 'two_up': {
        sfx('coin');
        const landed = d.heads ? 'heads' : 'tails';
        await this.say(`${who} calls ${d.call}. Come in spinner...`, 1300, { record: false });
        this.note(`Two-Up: called ${d.call}, came up ${landed}. ${d.won ? 'Forward' : 'Back'} ${d.amount}`);
        await this.card({ playerId: e.playerId, kicker: 'Two-Up', title: d.won ? 'Called it!' : 'Wrong call', tone: d.won ? 'gold' : 'red',
          titleBefore: `${who} calls ${d.call}...`, anim: { kind: 'coin', heads: d.heads, call: d.call },
          body: `${who} called ${d.call} and the coin came down ${landed}. ${d.won ? `That's ${d.amount} squares forward.` : `That's ${d.amount} squares back.`}`,
          foot: `The stake is always double the roll that landed ${who} on the decision square, which was ${d.amount / 2}.` });
        break;
      }
      case 'wyr': {
        const opt = (k) => (k === 'a' ? d.optionA : d.optionB);
        const target = d.targetId ? this.nick[d.targetId] : null;
        const outcome = d.correct
          ? (target ? `As a reward, ${target}, who was ahead, gets sent back 3 squares.` : `That would normally knock someone ahead back 3, but nobody is ahead of ${who}.`)
          : `A wrong guess costs 2 squares, so ${who} goes back 2.`;
        this.note(`1:1 time: "${d.question}" Guessed ${d.pick ? opt(d.pick) : 'nothing'}, the boss picked ${opt(d.answer)}. ${outcome}`);
        await this.card({ playerId: e.playerId, kicker: '1:1 time', title: d.correct ? 'Read the boss perfectly' : 'Misread the boss', tone: d.correct ? 'gold' : 'red',
          titleBefore: 'What did the boss say?', anim: { kind: 'pick', question: d.question, a: d.optionA, b: d.optionB, answer: d.answer, pick: d.pick,
            roulette: d.correct && d.targetId ? { target: d.targetId, people: (d.candidates?.length ? d.candidates : [d.targetId]).map((id) => ({ id, name: this.nick[id] ?? 'Someone', avatar: this.avatar[id] })) } : null },
          body: `In their 1:1, ${who} guessed the boss would say ${d.pick ? opt(d.pick) : 'nothing at all'}. The boss actually said ${opt(d.answer)}.`,
          foot: outcome });
        break;
      }
      case 'consignment':
        if (d.result === 'powerup') {
          const reward = this.next?.kind === 'powerup_gain' ? this.next.data.powerup : null;
          if (reward) this.mergedReward = true; // the power-up card is folded into this one
          this.note(reward ? `Submitted project to PRC: approved, with ${POWERUP_NAMES[reward]}` : 'Submitted project to PRC: approved');
          await this.card({ playerId: e.playerId, kicker: 'Submitted project to PRC', title: 'Approved!', tone: 'gold',
            titleBefore: 'The PRC is reviewing...', anim: { kind: 'stamp', approved: true },
            body: reward
              ? `The Project Review Committee approved ${who}'s project, and it comes with ${A_POWERUP[reward]}.\n\n${POWERUP_TEXT[reward]}`
              : `The Project Review Committee approved ${who}'s project. ${who}'s hands are already full, so it's 3 bonus squares instead.`,
            foot: reward ? (reward === 'shield' ? 'Nothing to do. It works automatically.' : 'Play it by ticking it at lock-in before pressing Roll.') : '' });
        } else {
          this.note('Submitted project to PRC: sent back for rework. Half movement for the next 2 rolls');
          await this.card({ playerId: e.playerId, kicker: 'Submitted project to PRC', title: 'Sent back for rework', tone: 'red',
            titleBefore: 'The PRC is reviewing...', anim: { kind: 'stamp', approved: false },
            body: `The Project Review Committee has sent ${who}'s project back for rework. Bad luck.`,
            foot: `For the next two rolls, ${who} only moves half the number rolled, rounded up.` });
        }
        break;
      case 'devils_deal':
        if (t) { t.devil = true; this.sync(); }
        sfx('trap');
        this.note("Devil's Deal: forward 10 now, but two sixes in a row means Meeting Hell from here on");
        await this.card({ playerId: e.playerId, devil: true, kicker: "Devil's Deal", title: 'A deal with the Devil', tone: 'red',
          body: `${who} takes the Devil's offer and jumps forward 10 squares on the spot.`,
          foot: `The price is permanent. From now on, just two sixes in a row will drag ${who} into Meeting Hell, not three. The horns are there so everyone knows.` });
        break;
      case 'book_truck':
        this.note('Work From Home: no dice, exactly 4 squares');
        await this.card({ playerId: e.playerId, kicker: 'Work From Home', title: 'Working from home', tone: 'blue',
          body: `${who} skips the dice today, works from home and gets exactly 4 squares done.`,
          foot: `No dice means no sixes, so no chance of Meeting Hell. Wherever ${who} ends up still counts, trap doors and all.` });
        break;
      case 'dice': {
        await this.rollDice(d.dice, {});
        if (d.lucky) await this.say(`Ctrl+Z: the ${d.luckyFrom} is undone and rolled again`);
        const sixes = d.dice.filter((x) => x === 6).length;
        if (d.total !== null) {
          const raw = d.dice.reduce((s, x) => s + x, 0);
          const list = d.dice.length > 1 ? `${d.dice.slice(0, -1).join(', ')} and ${d.dice.at(-1)}` : `${d.dice[0]}`;
          let msg;
          if (d.double) msg = `All FY KPIs Met! Two dice, ${d.dice.join(' + ')} = ${raw}`;
          else if (sixes === 1) msg = `Rolled a 6, which earns another roll, then a ${d.dice.at(-1)}. That's ${raw}`;
          else if (sixes >= 2) msg = `Rolled ${list}. Two sixes in a row, each earning another roll (a third would have meant Meeting Hell). That's ${raw}`;
          else msg = `Rolled a ${raw}`;
          if (d.total !== raw) msg += `, and today's event makes it ${d.total}`;
          await this.say(msg, sixes ? 2000 : 1200);
        }
        break;
      }
      case 'hell_sent': {
        sfx('hell');
        const devil = d.sixes === 2;
        this.note(`${d.sixes} sixes in a row: dragged into Meeting Hell. The whole move is cancelled`);
        if (t) { t.inHell = true; t.pos = 0; this.sync(); }
        await this.sleep(500);
        await this.card({ playerId: e.playerId, hell: true, kicker: devil ? "The Devil collects" : 'Three sixes', title: 'Dragged into Meeting Hell!', tone: 'red',
          body: devil
            ? `${who} rolled two sixes in a row, and the Devil's Deal comes due. Everything moved this turn is cancelled and ${who} is dragged into back-to-back meetings.`
            : `${who} rolled three sixes in a row. Far too keen. Everything moved this turn is cancelled and ${who} is dragged into back-to-back meetings.`,
          foot: `To get out, ${who} rolls once a day and needs a 6. Escaping puts them back on square 1. Any power-up stays safe in the pocket until then.` });
        break;
      }
      case 'hell_roll':
        await this.rollDice([d.die]);
        if (d.escaped && t) { t.inHell = false; t.pos = 1; this.sync(); }
        if (d.escaped) {
          this.note('Rolled the 6 needed to escape Meeting Hell. Back on square 1');
          await this.card({ playerId: e.playerId, kicker: 'Out of Meeting Hell', title: 'Escaped!', tone: 'gold',
            body: `${who} finally rolled the 6 they needed, said "let's take this offline" and walked out. Back on the board at square 1.`,
            foot: `${who} rolls normally from tomorrow, and wears the Meeting Hell Survivor badge for the rest of the season.` });
        } else await this.say(`Rolled a ${d.die}. ${who} needs a 6 to escape, so it's another meeting`, 1400);
        break;
      case 'curse':
        await this.say(`Still reworking that project: ${who}'s ${d.before} becomes ${d.after}`);
        break;
      case 'move': {
        if (!t || d.reason === 'hell_escape') break;
        if (REASONS[d.reason] && d.reason !== 'consignment_bonus') await this.say(REASONS[d.reason], 1000);
        if (d.reason === 'swap' || d.reason === 'swapped') {
          t.pos = Math.min(d.to, this.board.size + 1);
          this.sync();
          await this.sleep(300);
        } else {
          await this.walk(t, d.from, d.to, d.passive);
        }
        this.ui.line?.({ playerId: this.current, move: true, text: d.to > this.board.size ? `${e.playerId !== this.current ? `${who} is ` : ''}Off on Long Service Leave`
          : e.playerId !== this.current ? `${who} now on square ${d.to}` : `${d.passive ? 'Now on' : 'Lands on'} square ${d.to}` });
        break;
      }
      case 'trap': {
        sfx('trap');
        this.board.squares = this.board.squares.map((s) => (s.idx === d.idx ? this.squares[d.idx - 1] : s));
        this.board.flash = { idx: d.idx, until: performance.now() + 900, color: 'rgba(232,74,74,0.7)' };
        this.lastTrap = d;
        if (this.next?.kind === 'shield_block') break; // the time in lieu card tells this story
        if (d.effect === 'glass_ceiling') {
          this.note(`Consult with industry on square ${d.idx}. No move on the next roll`);
          await this.sleep(500);
          await this.card({ playerId: e.playerId, kicker: 'Trap door', title: 'Consult with industry', tone: 'red',
            body: `${who} landed on square ${d.idx} and now has to consult with industry first. No squares lost today, but ${who} won't move at all on their next roll while they wait for feedback.`,
            foot: `${d.firstReveal ? "Nobody knew it was there. It's now marked on the board for everyone. " : ''}Time in lieu would have dodged it.` });
          break;
        }
        const to = Math.max(0, d.idx - d.drop);
        this.note(`Trap door on square ${d.idx}: ${d.text}. Back ${d.drop} to square ${to}`);
        await this.sleep(500);
        await this.card({ playerId: e.playerId, kicker: 'Trap door', title: d.text, tone: 'red',
          body: `${who} landed on square ${d.idx} and fell straight through a trap door. That's ${d.drop} squares back, to square ${to}.`,
          foot: d.firstReveal
            ? "Nobody knew it was there. It's now marked on the board for everyone. Time in lieu would have dodged it."
            : 'This one was already marked, but there is no steering a dice roll. Time in lieu would have dodged it.' });
        break;
      }
      case 'shield_block': {
        sfx('coin');
        const tr = this.lastTrap ?? {};
        this.note(`Trap door on square ${tr.idx}: ${tr.text}. Dodged with time in lieu`);
        await this.card({ playerId: e.playerId, kicker: 'Trap door', title: 'Saved by time in lieu!', tone: 'gold',
          body: `${who} landed on square ${tr.idx} and stepped onto a trap door: ${tr.text}. ${tr.effect === 'glass_ceiling' ? `That would have frozen ${who} for a turn` : `That would have cost ${tr.drop} squares`}, but ${who} was conveniently off on time in lieu.`,
          foot: `The time in lieu is now used up.${tr.firstReveal ? ' The trap door is marked on the board for everyone from here on.' : ''}` });
        break;
      }
      case 'boost': {
        sfx('powerup');
        this.board.squares = this.board.squares.map((s) => (s.idx === d.idx ? this.squares[d.idx - 1] : s));
        this.board.flash = { idx: d.idx, until: performance.now() + 900, color: 'rgba(92,207,106,0.7)' };
        if (d.effect === 'cpi') {
          this.note(`Agreed in principle on square ${d.idx}. Next roll is exactly 4`);
          await this.sleep(400);
          await this.card({ playerId: e.playerId, kicker: 'Good surprise (sort of)', title: 'Agreed in principle', tone: 'gold',
            body: `${who} landed on square ${d.idx}. Industry agrees in principle, but won't put it in writing. No jump today, and ${who}'s next roll is a guaranteed 4: steady, safe and not very exciting.`,
            foot: `${d.firstReveal ? "It's now marked on the board for everyone. " : ''}No dice on that roll means no sixes, so no risk of Meeting Hell. Daily events don't change it.` });
          break;
        }
        const to = Math.min(d.idx + d.gain, this.board.size + 1);
        this.note(`Good surprise on square ${d.idx}: ${d.text}. Forward ${d.gain} to square ${to}`);
        await this.sleep(400);
        await this.card({ playerId: e.playerId, kicker: 'Good surprise', title: d.text, tone: 'gold',
          body: `${who} landed on square ${d.idx} and found a hidden bonus: ${d.text}! That's ${d.gain} squares forward, to square ${to}.`,
          foot: d.firstReveal ? "Nobody knew it was there. It's now marked on the board for everyone." : 'This one was already marked. Nice to land on it again.' });
        break;
      }
      case 'survey': {
        sfx(d.positive ? 'powerup' : 'trap');
        this.note(d.positive ? `Engagement survey: great results. Forward ${d.amount}` : `Engagement survey: poor results. Engagement improvement session, back ${d.amount}`);
        await this.say(`${who} fills in the engagement survey...`, 1200, { record: false });
        await this.card({ playerId: e.playerId, kicker: 'Engagement survey', title: d.positive ? 'Results are in: great!' : 'Results are in: not great', tone: d.positive ? 'gold' : 'red',
          titleBefore: 'Counting the results...', anim: { kind: 'meter', positive: d.positive },
          body: d.positive
            ? `Engagement came back at 80%! ${who}'s team is fired up, and that's ${d.amount} squares forward.`
            : `Engagement came back at 40%. Ouch. ${who}'s team is booked into a two hour engagement improvement session. That's ${d.amount} squares back.`,
          foot: "Survey squares are a coin toss: 50/50 between good results and bad. Either way, the move doesn't trigger the square you end up on." });
        break;
      }
      case 'glass_ceiling':
        this.note(d.wastedTruck ? 'Still waiting on industry: no move today, even working from home' : 'Still waiting on industry: no move today');
        await this.say(d.wastedTruck ? `${who} is still waiting on industry feedback. Not even working from home helps. No move today` : `${who} is still waiting on industry feedback. No move today`, 1600);
        break;
      case 'cpi_roll':
        this.note('Agreed in principle: exactly 4, no dice');
        await this.say(`${who}'s agreement in principle comes through: exactly 4 squares, no dice`, 1500);
        break;
      case 'trap_shut':
        await this.say("There's a hidden trap door here, but it's a change freeze today. Lucky.", 1500);
        break;
      case 'powerup_gain': {
        if (this.mergedReward && d.source === 'consignment') { this.mergedReward = false; break; }
        sfx('powerup');
        const name = POWERUP_NAMES[d.powerup];
        const how = d.source === 'streak'
          ? `${who} has locked in ${this.lastStreak ?? 5} days in a row and earns ${A_POWERUP[d.powerup]} as a reward.`
          : d.source === 'consignment' ? `The PRC approved ${who}'s project, and it comes with ${A_POWERUP[d.powerup]}.`
          : `${who} landed on a power-up square and picked up ${A_POWERUP[d.powerup]}.`;
        this.note(`Picked up ${name}${d.source === 'streak' ? ' (streak reward)' : d.source === 'consignment' ? ' (project approved by the PRC)' : ''}`);
        await this.card({ playerId: e.playerId, kicker: d.source === 'streak' ? 'Streak reward' : d.source === 'consignment' ? 'Project approved' : 'Power-up', title: name, tone: 'gold',
          body: `${how}\n\n${POWERUP_TEXT[d.powerup]}`,
          foot: d.powerup === 'shield' ? 'Nothing to do. It works automatically.' : 'Players can hold one power-up at a time, and play it by ticking it at lock-in before pressing Roll.' });
        break;
      }
      case 'powerup_full':
        if (d.source === 'square') await this.say(`${who} already holds a power-up, so this one stays on the square`, 1300);
        break;
      case 'powerup_used':
        await this.say(`${who} plays ${POWERUP_NAMES[d.powerup]}`, 1000);
        break;
      case 'decision_offer':
        sfx('powerup');
        this.note(`Decision square: ${d.options.map((o) => DECISION_NAMES[o]).join(' or ')}, or pass`);
        await this.card({ playerId: e.playerId, kicker: 'Decision square', title: `${who} has a choice to make`, tone: 'blue',
          body: `${who} landed on a decision square and gets to choose at the next lock-in. On offer:\n\n${d.options.map((o) => `${DECISION_NAMES[o]}. ${DECISION_TEXT[o]}`).join('\n\n')}`,
          foot: "Whatever they choose plays out at 4pm tomorrow, before their normal roll. If they don't lock in, it's an automatic pass." });
        break;
      case 'swap':
        if (d.targetId) {
          this.note(`Hot Desk Swap: trades desks with ${this.nick[d.targetId]}`);
          await this.card({ playerId: e.playerId, kicker: 'Hot Desk Swap', title: 'Desk swap!', tone: 'blue',
            body: `${who} played Hot Desk Swap and takes ${this.nick[d.targetId]}'s desk, just ahead. ${this.nick[d.targetId]} gets ${who}'s old one.`,
            foot: "Swapping doesn't trigger the square either of them ends up on." });
        } else await this.say(`${who} played Hot Desk Swap, but there's nobody ahead to swap with`, 1300);
        break;
      case 'streak_reward':
        sfx('powerup');
        this.lastStreak = d.streak;
        this.note(`${d.streak} lock-ins in a row: streak reward`);
        if (this.next?.kind !== 'powerup_gain') await this.say(`${d.streak} lock-ins in a row! Hands are full, so it's 3 bonus squares instead`, 1500, { record: false });
        break;
      case 'bonus_roll':
        await this.rollDice([d.die]);
        await this.say(`A bonus roll from the host: ${d.die} more squares`, 1200);
        break;
      case 'finish':
        sfx('win');
        this.note(d.winner ? 'First to Long Service Leave. WINNER!' : 'Off on Long Service Leave too');
        await this.card({ playerId: e.playerId, kicker: d.winner ? 'Season winner' : 'Finished', title: d.winner ? `${who} wins!` : 'Long Service Leave', tone: 'gold',
          body: d.winner ? `${who} is first to Long Service Leave and wins the season. Out of office, indefinitely.` : `${who} is off on Long Service Leave too.`,
          foot: d.winner ? 'Awards are worked out from the whole season and will appear in the Hall of Fame.' : '' });
        break;
      case 'day_end':
        for (const o of this.view.values()) o.focus = false;
        this.sync();
        this.current = null;
        this.ui.line?.({ playerId: null, end: true, positions: d.positions });
        await this.say("That's the day. Lock in again before 4pm tomorrow", 1500, { record: false });
        break;
    }
  }
}
