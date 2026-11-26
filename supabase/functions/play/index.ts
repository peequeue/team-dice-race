// Player endpoint. Every call carries the player's personal key (from the URL
// fragment). Actions: state, lockin, replay, hall.
// Never returns: unrevealed trap doors, WYR answers, unresolved rolls, or
// other players' lock-in choices or held power-ups.
import { serve, HttpError, clientIp } from '../_shared/http.ts';
import { sql, hashKey, rateLimit } from '../_shared/db.ts';
import { currentSeason, runResolution, toPlayer, type Season } from '../_shared/store.ts';
import {
  DECISION_NAMES, DECISION_TEXT, POWERUP_NAMES, POWERUP_TEXT, dueDates, getEvent, lockInDate, msUntilReveal,
} from '../_shared/engine/index.ts';
import type { DecisionChoice } from '../_shared/engine/index.ts';

serve(async (body, req) => {
  const key = String(body.key ?? '');
  if (key.length < 20) throw new HttpError(401, 'This link is not valid');
  const hash = await hashKey(key);
  const [me] = await sql`select * from players where key_hash = ${hash}`;
  if (!me) {
    await rateLimit(`badkey:${clientIp(req)}`, 10);
    throw new HttpError(401, 'This link is not valid. Ask the host for a new one.');
  }
  await rateLimit(`play:${hash}`, 40);
  const [season] = await sql`select * from seasons where id = ${me.season_id}`;

  switch (body.action) {
    case 'state':
      return await state(season as Season, me.id);
    case 'lockin':
      return await lockIn(season as Season, me.id, body);
    case 'replay':
      return await replay(season as Season, String(body.date ?? ''));
    case 'hall':
      return { hall: await sql`select season_name, award, player_nickname, detail from hall_of_fame where published order by id` };
    default:
      throw new HttpError(400, 'Unknown action');
  }
});

async function outstanding(season: Season, now: Date): Promise<string[]> {
  if (season.status !== 'active' || season.paused) return [];
  const rows = await sql`select game_date from resolutions where season_id = ${season.id}`;
  return dueDates(season.start_date, new Set(rows.map((r) => r.game_date as string)), now);
}

async function state(seasonIn: Season, myId: string) {
  const now = new Date();
  // If 4pm has passed and the cron job hasn't run yet, resolve now. Idempotent.
  if ((await outstanding(seasonIn, now)).length) await runResolution(now);
  const season = (await currentSeason()) ?? seasonIn;

  const players = await sql`select * from players where season_id = ${season.id} order by sort_order`;
  const squares = await sql`select idx, type, payload, revealed from squares where season_id = ${season.id} order by idx`;
  const date = lockInDate(now);
  const [ev] = await sql`select event_key from daily_events where season_id = ${season.id} and game_date = ${date}`;
  const locked = await sql`select player_id, play_powerup, decision_choice from lock_ins where season_id = ${season.id} and game_date = ${date}`;
  const resolved = await sql`select game_date from resolutions where season_id = ${season.id} and status = 'resolved' order by game_date`;
  const mine = locked.find((l) => l.player_id === myId);
  const meRow = players.find((p) => p.id === myId)!;
  const me = toPlayer(meRow);
  const event = getEvent(ev?.event_key ?? 'quiet');

  return {
    season: {
      name: season.name, status: season.status, paused: season.paused, boardSize: season.board_size,
      startDate: season.start_date, swapEnabled: !!season.config?.swapEnabled,
    },
    players: players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatarKey: p.avatar_key,
      position: p.position,
      inHell: p.in_hell,
      hellVisits: p.hell_visits,
      devilMarked: p.devil_marked,
      streak: p.streak,
      heldPowerup: p.held_powerup, // public: knowing it doesn't change anyone's options
      curse: p.curse,
      nextRoll: p.next_roll,
      hasDecision: !!p.pending_decision, // the options and any WYR question stay private
      finishedOn: p.finished_on,
      isMe: p.id === myId,
      lockedIn: locked.some((l) => l.player_id === p.id),
    })),
    // Hidden squares (trap doors and good surprises not yet found) look like ordinary squares.
    squares: squares.map((s) =>
      !s.revealed
        ? { idx: s.idx, type: 'normal' }
        : { idx: s.idx, type: s.type, payload: s.type === 'trap' || s.type === 'boost' ? s.payload : undefined }),
    me: {
      id: me.id,
      heldPowerup: me.heldPowerup && { key: me.heldPowerup, name: POWERUP_NAMES[me.heldPowerup], text: POWERUP_TEXT[me.heldPowerup] },
      pendingDecision: me.pendingDecision && {
        options: me.pendingDecision.options.map((o) => ({ key: o, name: DECISION_NAMES[o], text: DECISION_TEXT[o] })),
        wyr: me.pendingDecision.wyr ?? null, // question and options only, never the answer
      },
      streak: me.streak,
      curse: me.curse,
      nextRoll: me.nextRoll,
      lockIn: mine ? { playPowerup: mine.play_powerup, decision: mine.decision_choice } : null,
    },
    today: {
      gameDate: date,
      event: { key: event.key, name: event.name, text: event.text },
      msUntilReveal: msUntilReveal(now),
    },
    resolvedDates: resolved.map((r) => r.game_date),
    winnerId: season.winner_player_id,
  };
}

async function lockIn(season: Season, myId: string, body: Record<string, unknown>) {
  const now = new Date();
  if (season.status !== 'active') throw new HttpError(409, 'The season is not running');
  if (season.paused) throw new HttpError(409, 'The game is paused');
  if ((await outstanding(season, now)).length) {
    await runResolution(now);
    throw new HttpError(409, "Today's results have just come in. Have a look, then lock in again.");
  }
  const [p] = await sql`select * from players where id = ${myId}`;
  const me = toPlayer(p);
  if (me.finishedOn) throw new HttpError(409, "You've already finished");

  const playPowerup = body.playPowerup === true && !!me.heldPowerup && me.heldPowerup !== 'shield';
  let decision: { choice: DecisionChoice; wyrPick?: 'a' | 'b'; coinCall?: 'heads' | 'tails' } | null = null;
  if (me.pendingDecision) {
    const choice = String(body.decisionChoice ?? 'pass') as DecisionChoice;
    if (choice !== 'pass' && !me.pendingDecision.options.includes(choice)) throw new HttpError(400, 'That option is not on offer');
    decision = { choice };
    if (choice === 'wyr') {
      const pick = body.wyrPick;
      if (pick !== 'a' && pick !== 'b') throw new HttpError(400, 'Pick A or B for Would You Rather');
      decision.wyrPick = pick;
    }
    if (choice === 'two_up') {
      const call = body.coinCall;
      if (call !== 'heads' && call !== 'tails') throw new HttpError(400, 'Call heads or tails for Two-Up');
      decision.coinCall = call;
    }
  }

  const date = lockInDate(now);
  const rows = await sql`
    insert into lock_ins (season_id, player_id, game_date, play_powerup, decision_choice)
    values (${season.id}, ${myId}, ${date}, ${playPowerup}, ${decision ? sql.json(decision) : null})
    on conflict (player_id, game_date) do nothing
    returning game_date`;
  if (!rows.length) throw new HttpError(409, "You're already locked in for today");
  return { ok: true, gameDate: date, playPowerup, decision };
}

async function replay(season: Season, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Bad date');
  const [r] = await sql`select status from resolutions where season_id = ${season.id} and game_date = ${date}`;
  if (!r || r.status !== 'resolved') throw new HttpError(404, 'No replay for that day');
  const log = await sql`
    select seq, player_id, kind, data from event_log
    where season_id = ${season.id} and game_date = ${date} order by seq`;
  const [ev] = await sql`select event_key from daily_events where season_id = ${season.id} and game_date = ${date}`;
  const event = getEvent(ev?.event_key ?? 'quiet');
  return {
    date,
    event: { key: event.key, name: event.name, text: event.text },
    log: log.map((e) => ({ seq: e.seq, playerId: e.player_id, kind: e.kind, data: e.data })),
  };
}
