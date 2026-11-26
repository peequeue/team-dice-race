// Host-only endpoint. Authenticated by the admin key (same personal-link pattern).
import { serve, HttpError, clientIp } from '../_shared/http.ts';
import { sql, hashKey, newKey, newSeed, rateLimit, safeEqual, type Sql } from '../_shared/db.ts';
import { currentSeason, recordAwards, runResolution, type Season } from '../_shared/store.ts';
import {
  createRng, generateBoard, generateEventSequence, lockInDate, weekdaysBetween, addDays,
} from '../_shared/engine/index.ts';

serve(async (body, req) => {
  const ip = clientIp(req);
  await rateLimit(`admin:${ip}`, 60);

  if (body.action === 'bootstrap') return await bootstrap(String(body.token ?? ''));

  const key = String(body.key ?? '');
  const [admin] = await sql`select key_hash from admin where id = 1`;
  if (!admin || key.length < 20 || !safeEqual(await hashKey(key), admin.key_hash)) {
    await rateLimit(`badadmin:${ip}`, 5);
    throw new HttpError(401, 'Not the host key');
  }

  const season = await currentSeason();
  const live = season && season.status !== 'finished' ? season : null;
  const needLive = () => {
    if (!live) throw new HttpError(409, 'No season set up');
    return live;
  };

  switch (body.action) {
    case 'overview':
      return await overview(season);

    case 'create_season':
      return await createSeason(body, live);

    case 'start_season': {
      const s = needLive();
      if (s.status !== 'setup') throw new HttpError(409, 'Season already started');
      await sql`update seasons set status = 'active' where id = ${s.id}`;
      return { ok: true };
    }

    case 'end_season': {
      const s = needLive();
      await sql.begin(async (tx) => {
        await tx`update seasons set status = 'finished' where id = ${s.id}`;
        await recordAwards(tx as unknown as Sql, s, s.winner_player_id);
      });
      return { ok: true };
    }

    case 'set_paused': {
      const s = needLive();
      await sql`update seasons set paused = ${body.paused === true} where id = ${s.id}`;
      return { ok: true, paused: body.paused === true };
    }

    case 'set_swap': {
      const s = needLive();
      await sql`update seasons set config = config || ${sql.json({ swapEnabled: body.enabled === true })} where id = ${s.id}`;
      return { ok: true };
    }

    case 'regenerate_link': {
      const s = needLive();
      const k = newKey();
      const rows = await sql`
        update players set key_hash = ${await hashKey(k)}
        where id = ${String(body.playerId)} and season_id = ${s.id} returning nickname`;
      if (!rows.length) throw new HttpError(404, 'No such player');
      return { nickname: rows[0].nickname, key: k };
    }

    case 'grant_bonus': {
      const s = needLive();
      const n = Math.max(1, Math.min(5, Number(body.rolls ?? 1)));
      await sql`update players set bonus_rolls = bonus_rolls + ${n} where id = ${String(body.playerId)} and season_id = ${s.id}`;
      return { ok: true };
    }

    case 'edit_player': {
      const s = needLive();
      const nickname = body.nickname ? String(body.nickname).trim().slice(0, 24) : null;
      const avatar = body.avatarKey ? String(body.avatarKey).slice(0, 40) : null;
      await sql`
        update players set
          nickname = coalesce(${nickname}, nickname),
          avatar_key = coalesce(${avatar}, avatar_key)
        where id = ${String(body.playerId)} and season_id = ${s.id}`;
      return { ok: true };
    }

    case 'wyr_add':
      return await wyrAdd(body);

    case 'wyr_answer': {
      const ans = String(body.answer ?? '');
      if (!['a', 'b'].includes(ans)) throw new HttpError(400, 'Answer must be a or b');
      await sql`update wyr_questions set answer = ${ans} where id = ${String(body.id)} and used_season_id is null`;
      return { ok: true };
    }

    case 'wyr_delete':
      await sql`delete from wyr_questions where id = ${String(body.id)} and used_season_id is null`;
      return { ok: true };

    case 'board_regenerate': {
      const s = needLive();
      if (s.status !== 'setup') throw new HttpError(409, 'The board is locked once the season starts');
      await writeBoard(sql, s.id, s.board_size);
      return { ok: true };
    }

    case 'resolve_now':
      return { done: await runResolution() };

    case 'publish_awards': {
      if (!season) throw new HttpError(409, 'No season');
      await sql`update hall_of_fame set published = ${body.publish !== false} where season_id = ${season.id}`;
      return { ok: true };
    }

    default:
      throw new HttpError(400, 'Unknown action');
  }
});

async function bootstrap(token: string) {
  const expected = Deno.env.get('ADMIN_BOOTSTRAP_TOKEN') ?? '';
  if (!expected || !safeEqual(token, expected)) throw new HttpError(401, 'Bad setup token');
  const [existing] = await sql`select 1 from admin where id = 1`;
  if (existing) throw new HttpError(409, 'The host key already exists');
  const key = newKey();
  await sql`insert into admin (id, key_hash) values (1, ${await hashKey(key)})`;
  return { key };
}

async function overview(season: Season | null) {
  const wyr = await sql`select id, question, option_a, option_b, answer, used_date from wyr_questions order by created_at`;
  if (!season) return { season: null, wyr };
  const players = await sql`select * from players where season_id = ${season.id} order by sort_order`;
  const squares = await sql`select idx, type, payload, revealed from squares where season_id = ${season.id} order by idx`;
  const date = lockInDate(new Date());
  const locks = await sql`select player_id from lock_ins where season_id = ${season.id} and game_date = ${date}`;
  const hall = await sql`select award, player_nickname, detail, published from hall_of_fame where season_id = ${season.id} order by id`;
  const days = await sql`select game_date, status from resolutions where season_id = ${season.id} order by game_date`;
  return {
    season,
    players: players.map(({ key_hash: _k, ...p }) => ({ ...p, lockedIn: locks.some((l) => l.player_id === p.id) })),
    squares,
    wyr,
    hall,
    days,
    nextGameDate: date,
  };
}

async function createSeason(body: Record<string, unknown>, live: Season | null) {
  if (live) throw new HttpError(409, 'Finish or end the current season first');
  const name = String(body.name ?? '').trim() || 'Season';
  const start = String(body.startDate ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new HttpError(400, 'Start date must be YYYY-MM-DD');
  const size = Math.max(20, Math.min(300, Number(body.boardSize ?? 90)));
  const nicknames = (Array.isArray(body.nicknames) ? body.nicknames : [])
    .map((n) => String(n).trim().slice(0, 24)).filter(Boolean);
  if (nicknames.length < 2 || nicknames.length > 12) throw new HttpError(400, 'Between 2 and 12 nicknames');
  if (new Set(nicknames.map((n) => n.toLowerCase())).size !== nicknames.length) throw new HttpError(400, 'Nicknames must be different');
  // Optional avatar per nickname, in the same order. Anything odd falls back to a placeholder.
  const avatars = (Array.isArray(body.avatars) ? body.avatars : []).map((a) => (/^[a-z0-9_]{1,40}$/.test(String(a)) ? String(a) : null));

  return await sql.begin(async (tx) => {
    const [s] = await tx`
      insert into seasons (name, start_date, board_size, config)
      values (${name}, ${start}, ${size}, ${tx.json({ swapEnabled: body.swapEnabled === true, devilsDealOfferRate: 0.125 })})
      returning id`;
    await writeBoard(tx as unknown as Sql, s.id, size);
    // a year of events is plenty, including pauses
    const dates = weekdaysBetween(start, addDays(start, 365));
    const seq = generateEventSequence(dates, createRng(newSeed()));
    const evRows = dates.map((d) => ({ season_id: s.id, game_date: d, event_key: seq[d] }));
    await tx`insert into daily_events ${tx(evRows, 'season_id', 'game_date', 'event_key')}`;
    const links: { nickname: string; key: string }[] = [];
    for (const [i, nickname] of nicknames.entries()) {
      const key = newKey();
      await tx`
        insert into players (season_id, nickname, avatar_key, key_hash, sort_order)
        values (${s.id}, ${nickname}, ${avatars[i] ?? `placeholder_${(i % 6) + 1}`}, ${await hashKey(key)}, ${i})`;
      links.push({ nickname, key });
    }
    return { seasonId: s.id, links };
  });
}

async function writeBoard(db: Sql, seasonId: string, size: number) {
  const squares = generateBoard(createRng(newSeed()), { size });
  await db`delete from squares where season_id = ${seasonId}`;
  const rows = squares.map((q) => ({
    season_id: seasonId, idx: q.idx, type: q.type, payload: q.payload ?? null, revealed: q.revealed,
  }));
  await db`insert into squares ${db(rows as never, 'season_id', 'idx', 'type', 'payload', 'revealed')}`;
}

async function wyrAdd(body: Record<string, unknown>) {
  // Accepts one question, or many lines of "question | option A | option B | a or b"
  const items: { q: string; a: string; b: string; ans: string }[] = [];
  if (typeof body.bulk === 'string') {
    for (const line of body.bulk.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const [q, a, b, ans] = line.split('|').map((x) => x.trim());
      if (/^question$/i.test(q ?? '') && /^option a$/i.test(a ?? '')) continue; // the format line, pasted by mistake
      items.push({ q, a, b, ans: (ans ?? '').toLowerCase().replace(/[^ab]/g, '').slice(0, 1) });
    }
  } else {
    items.push({
      q: String(body.question ?? ''), a: String(body.optionA ?? ''), b: String(body.optionB ?? ''),
      ans: String(body.answer ?? '').toLowerCase(),
    });
  }
  // The answer is optional here: anything but a or b is left blank, to be picked in the table.
  const bad = items.findIndex((i) => !i.q || !i.a || !i.b);
  if (bad >= 0) throw new HttpError(400, `Line ${bad + 1} needs at least: question | option A | option B`);
  for (const i of items) {
    await sql`insert into wyr_questions (question, option_a, option_b, answer) values (${i.q}, ${i.a}, ${i.b}, ${i.ans || null})`;
  }
  return { added: items.length, unanswered: items.filter((i) => !i.ans).length };
}
