// Mapping between database rows and engine types, plus the transactional
// resolver used by the `resolve` function (cron) and the admin "resolve now" action.
import { sql, newSeed, type Sql } from './db.ts';
import {
  computeAwards, createRng, planResolution, resolveDay, DEFAULT_CONFIG,
} from './engine/index.ts';
import type {
  DecisionChoice, LockIn, PlayerState, SeasonConfig, Square, WyrQuestion,
} from './engine/index.ts';
import type { SeasonLogEntry } from './engine/awards.ts';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export interface Season {
  id: string;
  name: string;
  start_date: string;
  status: 'setup' | 'active' | 'finished';
  paused: boolean;
  board_size: number;
  config: Partial<SeasonConfig>;
  winner_player_id: string | null;
}

export async function currentSeason(db: Sql = sql): Promise<Season | null> {
  const [s] = await db`
    select * from seasons
    order by (status in ('setup','active')) desc, created_at desc
    limit 1`;
  return (s as Season) ?? null;
}

export function seasonConfig(s: Season): SeasonConfig {
  return { ...DEFAULT_CONFIG, ...s.config, boardSize: s.board_size };
}

export function toPlayer(r: Row): PlayerState {
  return {
    id: r.id,
    nickname: r.nickname,
    position: r.position,
    inHell: r.in_hell,
    hellVisits: r.hell_visits,
    devilMarked: r.devil_marked,
    heldPowerup: r.held_powerup,
    curse: r.curse,
    streak: r.streak,
    pendingDecision: r.pending_decision,
    bonusRolls: r.bonus_rolls,
    nextRoll: r.next_roll ?? null,
    finishedOn: r.finished_on,
  };
}

export function toSquare(r: Row): Square {
  return { idx: r.idx, type: r.type, payload: r.payload ?? undefined, revealed: r.revealed };
}

export function toLockIn(r: Row): LockIn {
  const d = r.decision_choice as { choice?: DecisionChoice; wyrPick?: 'a' | 'b'; coinCall?: 'heads' | 'tails' } | null;
  return {
    playerId: r.player_id,
    playPowerup: r.play_powerup,
    decisionChoice: d?.choice ?? null,
    wyrPick: d?.wyrPick,
    coinCall: d?.coinCall,
  };
}

/** Resolve or skip every outstanding game date for the live season. Safe to call any time. */
export async function runResolution(now = new Date()) {
  const done: { date: string; status: string }[] = [];
  // One transaction per date, guarded by an advisory lock so overlapping runs can't double-resolve.
  for (;;) {
    const result = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(4242)`;
      const season = await currentSeason(tx as unknown as Sql);
      if (!season || season.status !== 'active') return null;
      const rows = await tx`select game_date from resolutions where season_id = ${season.id}`;
      const plan = planResolution(
        season.start_date, new Set(rows.map((r) => r.game_date as string)), season.paused, false, now,
      );
      if (plan.skip.length) {
        for (const d of plan.skip) {
          await tx`insert into resolutions (season_id, game_date, status) values (${season.id}, ${d}, 'skipped')`;
          done.push({ date: d, status: 'skipped' });
        }
        return null;
      }
      const date = plan.resolve[0];
      if (!date) return null;
      await resolveOne(tx as unknown as Sql, season, date);
      done.push({ date, status: 'resolved' });
      return date;
    });
    if (!result) break;
    const s = await currentSeason();
    if (!s || s.status !== 'active') break;
  }
  return done;
}

async function resolveOne(tx: Sql, season: Season, date: string) {
  const players = (await tx`select * from players where season_id = ${season.id} order by sort_order for update`).map(toPlayer);
  const squares = (await tx`select * from squares where season_id = ${season.id} order by idx`).map(toSquare);
  const lockIns = (await tx`select * from lock_ins where season_id = ${season.id} and game_date = ${date}`).map(toLockIn);
  const [ev] = await tx`select event_key from daily_events where season_id = ${season.id} and game_date = ${date}`;
  const available = (await tx`
    select id, question, option_a, option_b from wyr_questions where used_season_id is null and answer is not null`)
    .map((q): WyrQuestion => ({ id: q.id, question: q.question, optionA: q.option_a, optionB: q.option_b }));
  const pendingIds = players.map((p) => p.pendingDecision?.wyr?.id).filter((x): x is string => !!x);
  const answers: Record<string, 'a' | 'b'> = {};
  if (pendingIds.length) {
    for (const r of await tx`select id, answer from wyr_questions where id in ${tx(pendingIds)}`) answers[r.id] = r.answer;
  }

  const seed = newSeed();
  const result = resolveDay({
    date,
    eventKey: ev?.event_key ?? 'quiet',
    config: seasonConfig(season),
    players,
    squares,
    lockIns,
    wyrAvailable: available,
    wyrAnswers: answers,
  }, createRng(seed));

  for (const p of result.players) {
    await tx`
      update players set
        position = ${p.position}, in_hell = ${p.inHell}, hell_visits = ${p.hellVisits},
        devil_marked = ${p.devilMarked}, held_powerup = ${p.heldPowerup},
        curse = ${p.curse ? tx.json(p.curse as never) : null}, streak = ${p.streak},
        pending_decision = ${p.pendingDecision ? tx.json(p.pendingDecision as never) : null},
        bonus_rolls = ${p.bonusRolls}, next_roll = ${p.nextRoll}, finished_on = ${p.finishedOn}
      where id = ${p.id}`;
  }
  for (const s of result.squares.filter((s, i) => s.revealed && !squares[i].revealed)) {
    await tx`update squares set revealed = true where season_id = ${season.id} and idx = ${s.idx}`;
  }
  if (result.usedQuestionIds.length) {
    await tx`update wyr_questions set used_season_id = ${season.id}, used_date = ${date} where id in ${tx(result.usedQuestionIds)}`;
  }
  const logRows = result.log.map((e) => ({
    season_id: season.id, game_date: date, seq: e.seq, player_id: e.playerId, kind: e.kind, data: e.data,
  }));
  await tx`insert into event_log ${tx(logRows as never, 'season_id', 'game_date', 'seq', 'player_id', 'kind', 'data')}`;
  await tx`insert into resolutions (season_id, game_date, status, seed) values (${season.id}, ${date}, 'resolved', ${seed})`;

  if (result.winnerId) {
    await tx`update seasons set status = 'finished', winner_player_id = ${result.winnerId} where id = ${season.id}`;
    await recordAwards(tx, season, result.winnerId);
  }
}

export async function recordAwards(tx: Sql, season: Season, winnerId: string | null) {
  const players = await tx`select id, nickname from players where season_id = ${season.id} order by sort_order`;
  const log = (await tx`
    select game_date, seq, player_id, kind, data from event_log
    where season_id = ${season.id} order by game_date, seq`)
    .map((r): SeasonLogEntry => ({ gameDate: r.game_date, seq: r.seq, playerId: r.player_id, kind: r.kind, data: r.data }));
  const awards = computeAwards(players.map((p) => p.id), log, winnerId);
  const nick = new Map(players.map((p) => [p.id, p.nickname]));
  await tx`delete from hall_of_fame where season_id = ${season.id}`;
  for (const a of awards) {
    await tx`
      insert into hall_of_fame (season_id, season_name, award, player_nickname, detail)
      values (${season.id}, ${season.name}, ${a.award}, ${nick.get(a.playerId)}, ${a.detail})`;
  }
}
