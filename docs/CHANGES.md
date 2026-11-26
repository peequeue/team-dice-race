# Team Dice Race: changes from the original brief

**Purpose of this document:** a complete list of everything that differs from, or was added to, the original build brief, so it can be reviewed in one pass. Each item says what changed, why, and where it lives in the code. Items marked **[host decision]** were requested or approved by the host (Pete). Items marked **[builder call]** were judgement calls made during the build where the brief was silent or ambiguous. **Open questions for review** are at the end.

Status at the time of writing: built and tested, **not yet deployed**. 45 unit tests, 32 end-to-end server checks against a real Postgres database, and browser runs of the demo all pass.

---

## 1. Summary of the original brief (for context)

- A daily, 16-bit style board game race for 6 players, run by a non-playing host. Weekdays only, Australia/Sydney time.
- Players open a personal link before 4pm and press Roll to **lock in** (no dice yet). At 4pm the server rolls for everyone, resolves the day from last place to first, and players watch an animated replay.
- 100 squares plus a finish. One six-sided die; a six rolls again; three sixes in a row sends you to Hell (escape with a 6, back to square 1).
- Hidden trap doors (back 5 to 10), visible power-up squares (Double Dice, Shield, Lucky Roll, optional Swap), and decision squares (Two-Up, Would You Rather, Book a Truck, Unmarked Consignment, Devil's Deal).
- Daily events, streak rewards, end-of-season awards, Hall of Fame.
- Only the main roll triggers the square you land on. Every other movement is passive.
- Stack: static front end on GitHub Pages, Supabase (Postgres, Edge Functions, pg_cron). Personal links with hashed keys, no personal information, all randomness server-side at reveal time.
- Original theme: the livestock supply chain (Paddock, Saleyard, Feedlot, Processor, Export).

---

## 2. Theme change: farm to office [host decision]

The whole game is rethemed around office life. **Internal code keys are unchanged** (`double_dice`, `book_truck`, `trap`, `in_hell` and so on), so this is a copy-and-visuals change, and a future retheme stays copy-only.

| Original | Now |
|---|---|
| Finish: Export | **Long Service Leave** (beach and palm tree at the top of the board) |
| Start | **First day** at reception |
| Zones: Paddock, Saleyard, Feedlot, Processor, Export | **Onboarding, Open Plan, Meeting Rooms, Dedicated Desk, Dedicated Car Space** |
| Hell | **Meeting Hell** (three sixes means you're far too keen and get dragged into back-to-back meetings) |
| Double Dice | **All FY KPIs Met!** |
| Shield | **Time in lieu** |
| Lucky Roll | **Ctrl+Z** |
| Swap | **Hot Desk Swap** |
| Book a Truck | **Work From Home** |
| Unmarked Consignment | **Submitted project to PRC** (Project Review Committee) |
| Would You Rather | **1:1 time** (guess which way the boss went) |
| Curse: lame steer | **Sent back for rework** |
| Trap door texts (eNVD rejected, Lost NLIS tag...) | Missed your KPIs, Replied all to the entire company, Forgot to complete your anti-bribery and corruption training, Laptop forced a 2 hour update, Mistyped your password three times, Sent the draft to the client, Mandatory brainstorming workshop, Left yourself unmuted on the all-staff, Forgot to submit your credit card expenses!, Had a run-in with someone with a different DISC profile (each used at most once per board) |
| Placeholder sprites: stockmen in hats | Office workers with hair, collar and tie (6 colourways) |

Two-Up and Devil's Deal keep their names. The host reviewed every name in a naming sheet. Real names are kept out because the repo is public, and "glass ceiling" was replaced because it made light of a real barrier.

**Daily events, renamed (same mechanics):** Business as Usual (no effect, about 42% of days), Budget Freeze (-1, minimum 1), All Hands (+2), End of Financial Year (sixes worth 12), System Outage (maximum 6), Morning Tea (1s and 2s count as 3), Mentoring Day (last place +4), Performance Review (leader -2, minimum 1), Casual Friday (odd numbers +1), Change Freeze (trap doors don't trigger), Hard Stop at 5 (sixes don't roll again, so no Hell), Hackathon (moves over 4 get +2).

**Awards, renamed where themed:** Most Setbacks, Meeting Hell Regular, Risk Taker, Plays It Safe, Time in Lieu Champion. Winner detail: "First to Long Service Leave".

Code: `supabase/functions/_shared/engine/{board,events,content,awards}.ts`, `web/js/{board,replay,app,sprites}.js`.

---

### 2.1 Visual style: 16-bit [host decision]
After comparing an 8-bit and a 16-bit mock-up, the host chose 16-bit:
- 32 by 32 avatars with shading, outlines, eye glints, a walk cycle, Devil's Deal horns and a Meeting Hell glow (they were 16 by 16 and flat).
- Textured floors for all five zones (lobby dots, open plan weave, meeting room pattern, middle management diamonds, car park asphalt with bay lines and wheel stops), bevelled tiles and shaded icons. Plus a dithered beach, a marble reception with lifts and a desk, and a Meeting Hell room with a meeting table and agenda.
- Body text in DotGothic16, a 16-bit RPG font drawn for 16px, so 2, Z, 5, S and 8 are easy to tell apart (Pixelify Sans was tried first and dropped for that reason). Headings and buttons keep the Press Start arcade font. Numbers and labels drawn on the board use a hand-made 5x7 bitmap font, crisp at any size. Both web fonts are OFL licensed and bundled with the site.
- Meeting Hell: tapered, flickering flames with rising embers, a wall clock whose hands never stop, and a whiteboard reading "Agenda: none. Ends: never. AOB: yes".
- Explainer cards, info panels, the "Your turn" box and replay captions use SNES-style RPG windows.
- The static board is drawn once into a cached layer; each frame only adds what moves, so the extra detail doesn't slow the animation.

## 3. New square types [host decision]

The brief had four square types (normal, trap, power-up, decision). There are now six, plus two special variants.

### 3.1 Good surprises (`boost`)
- The good twin of trap doors. **5 per board**, hidden until someone finishes a main roll on one, then permanently revealed.
- Move the player **forward 3 to 6** squares (fixed per square at setup). The move is passive, so it never triggers the next square.
- Texts: Positive client feedback, R&R award, Shout-out at the all-staff, Meeting cancelled, Project delivered early, Catering leftovers in the kitchen, Boss is on leave, Inbox zero.
- Not placed in squares 1 to 5. Time in lieu (Shield) does not interact with them. Change Freeze does not stop them.

### 3.2 Engagement survey (`survey`)
- **4 per board, visible** (clipboard icon).
- Finish a main roll on one and it's a 50/50: great results, **forward 5**; poor results, an engagement improvement session and **back 5**. Passive movement.

### 3.3 Industry agrees in principle, won't put it in writing (special good surprise, `effect: 'cpi'`, card title "Agreed in principle")
- **One per board**, takes one of the 5 good surprise slots. Hidden like the others.
- No move when landed on. Instead, the player's **next main move is exactly 4**: no dice, so no sixes and no Meeting Hell risk. Daily events and the rework curse don't modify it.
- If the player picks Work From Home before it's used, Work From Home moves them 4 that day and the agreed-in-principle move carries over to the following main move.

### 3.4 Consult with industry (special trap door, `effect: 'glass_ceiling'`; first named "glass ceiling", renamed because it made light of a real barrier)
- **One per board**, takes one of the 6 trap door slots. Hidden like the others.
- No drop when landed on. Instead, the player **doesn't move at all on their next main move**. Time in lieu (Shield) blocks it, and Change Freeze stops it, like any trap door.
- On the frozen turn: no dice are rolled, a played All FY KPIs Met! or Ctrl+Z is not used up (stays held), and a chosen Work From Home is wasted. The square they're standing on is not re-triggered. Decisions, Hot Desk Swap, bonus rolls and streaks still happen as normal.

**Storage:** a new `players.next_roll` column (`'cpi' | 'glass_ceiling' | null`), kept separate from the curse so it can't overwrite a "sent back for rework" curse.

**Balance impact (2,000 simulated seasons each, 100 squares):**

| Version | Winner's average finish | 10th to 90th percentile | Hell trips per season |
|---|---|---|---|
| Brief as written | 4.0 weeks | 3.4 to 4.6 | 0.56 |
| With good surprises and surveys | 3.7 weeks | 3.0 to 4.4 | 0.53 |
| With Agreed in principle and Consult with industry as well (current) | 3.8 weeks | 3.2 to 4.4 | 0.51 |

Code: `engine/{types,board,resolve}.ts`, migration `0001_init.sql`, tests in `engine/test/resolve.test.ts` and `board.test.ts`.

---

## 4. Rule changes and interpretations

### 4.1 Changes requested by the host
- **Two-Up is a call, not a blind flip [host decision].** At lock-in the player calls heads or tails. Correct call: forward double the main move that landed them on the decision square. Wrong call: back the same amount. Odds are still 50/50. The server rejects a Two-Up lock-in with no call. Auto-roll still passes.
- **Board stays at 100 squares for the pilot [host decision],** knowing it runs short of the 5 to 6 week target (see section 3 table). To be revisited after season one. Board size is a per-season setting, so no code change is needed.
- **Swap (Hot Desk Swap) is built and off by default [host decision].** The host can switch it on per season from the admin page.
- **Submitted project to PRC when your hands are full: +3 squares [host decision].** The brief offered "replace your power-up, or +3 if you'd rather not". Asking the player would need a second lock-in, so it's always +3.

### 4.2 Builder calls where the brief was silent or ambiguous
Movement:
- Start line is position 0, squares are 1 to 100, anything past 100 finishes. **Passive movement can finish the race** (for example a Devil's Deal +10 from square 95).
- Backwards movement stops at 0. Meeting Hell sets position 0 plus an in-Hell flag. For ordering, Hell sits behind the start line.

Power-ups:
- Landing on a power-up square while holding one: **no effect** (the brief's simpler option).
- Power-up squares give a random power-up, equally likely (a square can optionally be fixed to one).
- Time in lieu (Shield) sits in the single held slot, so you can't hold anything else with it. Playing it does nothing; it is passive.
- Ctrl+Z (Lucky Roll) is **used up when played**, even if the first die wasn't a 1 or 2. It only checks the first die.
- Power-ups can't be played in Meeting Hell and stay held.
- On a Work From Home day, a played All FY KPIs Met! or Ctrl+Z is not used and stays held. A played Hot Desk Swap still applies after the move.

Decisions:
- Devil's Deal appears in **exactly 1 in 8** decision offers (Devil's Deal plus one normal option). Otherwise two different normal options are offered.
- A 1:1 time question is **retired permanently once shown**, across seasons, even if the player passes. When none are left, 1:1 time stops being offered.
- A correct 1:1 time guess when nobody is ahead has no effect. Choosing it without picking A or B is rejected by the server.
- The Two-Up stake uses the landing move after event and curse modifiers.

Events, streaks and days:
- Events modify dice rolls only. They don't affect Work From Home, Agreed in principle, Meeting Hell rolls, passive moves or bonus rolls. "Last place" and "leader" are judged on positions at the start of the day, ignoring players in Meeting Hell. A special event never repeats on consecutive days.
- The streak reward triggers on every 5th consecutive manual lock-in (5, 10, 15...). Lock-ins made while in Meeting Hell count.
- Ties in resolution order are broken randomly each day.
- **Season end:** the first finisher in resolution order wins, and the season ends that day. Everyone still resolves that day, so the replay is complete. Because order runs last to first, a chaser who finishes on the same day as the leader wins.
- Host bonus rolls resolve after the main move, one die each, passive.

Lock-ins and timing:
- A lock-in is final once made.
- Before 4pm on a weekday it counts for today; after 4pm or on a weekend it counts for the next weekday.
- **Pause:** any date that falls due while paused is recorded as skipped and never resolved later. Skipped days don't affect streaks.
- Each game date gets a fresh crypto-random seed at resolution, stored in `resolutions.seed`. Re-rendering a day from its seed gives an identical result.

Full detail: `docs/decisions.md`.

---

## 5. Server, security and privacy decisions [builder call unless noted]

- **The database is fully locked down:** row level security is on for every table with no policies, and anon/authenticated access is revoked. The browser can't read anything directly; everything goes through three Edge Functions (`resolve`, `play`, `admin`) using the service role. This is stricter than the brief's "Edge Functions or tightly scoped RLS views".
- **Personal links:** a 32 byte random key in the URL fragment (`#k=`), stored only as a SHA-256 hash. The host key works the same way. The host key is created once through a bootstrap action that needs an `ADMIN_BOOTSTRAP_TOKEN` secret and only works while no host key exists.
- **Rate limits:** 40 requests a minute per player key, 60 a minute per IP on admin, 10 a minute per IP for bad player keys, and 5 a minute per IP for bad host keys.
- **Hourly job:** pg_cron calls `resolve` at minute 2 of every hour, Monday to Friday (UTC), with a shared secret header. The function decides whether 4pm Sydney has passed, so daylight saving can't shift the reveal. Each date resolves in its own transaction under an advisory lock, so overlapping runs can't double-resolve, and missed days catch up in order.
- **Instant reveal:** if anyone opens the page after 4pm before the hourly job has run, the server resolves the day straight away. The hourly job is a backstop.
- **Lock-ins are refused between 4pm and the reveal,** so nobody locks in for tomorrow before seeing today's decision offer.
- **What players can see about each other [host decision]:** positions, held power-ups, streaks, curses, next-roll effects (agreed in principle, or consulting with industry), badges and whether they've locked in today. **Hidden:** lock-in choices, which decision options someone was offered, any Would You Rather question in front of them, unrevealed trap doors and good surprises (including CPI and glass ceiling), Would You Rather answers, and any roll before 4pm. End-to-end checks confirm hidden squares arrive as plain squares with no payload.
- **Square info shows the menu, not the outcome [host decision on my recommendation].** Power-up and decision squares are resolved at random at 4pm, so tapping one lists every possible outcome and its odds. Showing the real outcome in advance would mean deciding it early and sending it to the browser, which is exactly what the 4pm design prevents. Revealed trap doors and good surprises show their actual effect.

---

## 6. Front end additions (not in the brief)

- **Demo mode:** runs the real rules engine in the browser against five bots, with a "Skip to 4pm" button, a new-demo button, a Hot Desk Swap toggle and a "peek at trap doors" option. Used for host testing before deployment. It's a separate bundle (`web/src/demo.ts`, built with esbuild in CI).
- **"Your turn" box [host request]:** the day's action (today's event, any decision with its explanation, the power-up choice and ROLL) appears in a box over the board whenever the player hasn't locked in, not only in the sidebar. It explains the timing: a decision chosen now plays out at 4pm today, just before the roll; no choice means Pass. "Look at the board first" tucks it away behind a YOUR TURN button. It stays hidden while a replay plays, and the outcome is shown in the 4pm replay with its own explainer card.
- **Turn screens instead of scrolling [host request]:** the Your turn box opens on a main screen with one tile per choice (each decision on offer, plus Pass) and a short tagline. Tapping a tile drills into a detail screen for that choice: the full explanation, any input (heads or tails for Two-Up, an answer for 1:1 time), and LOCK IN. A Back button returns to the tiles. LOCK IN stays disabled until any required input is made. With no decision on offer, the main screen shows the power-up toggle and ROLL. The box no longer scrolls.
- **Outcome animations [host request]:** in the 4pm replay, chance outcomes animate before the result is shown. Two-Up: the coin spins, lands, then shows heads or tails and win or lose. 1:1 time: the highlight toggles between the two answers, settles on the boss's answer, then shows the guess as right or wrong. Submitted project to PRC: a project form slides in and gets stamped APPROVED or SENT BACK FOR REWORK (an approval and its Time in lieu reward share one card). Engagement survey: a needle sweeps a poor-to-great meter and lands on the result. Next or Space during an animation skips to the result. Work From Home has no animation because there is no chance involved.
- **Copy review [host request]:** all player-facing text was exported to a sheet for review, and the host's edits are applied (see decisions.md, "Copy review"). Performance Review now names the leader in the turn box and on the event card. The survey shows 80% or 40% engaged; its odds are still 50/50.
- **1:1 roulette [host request]:** on a right answer, after the boss's answer is revealed, a row of everyone ahead of the player spins, slows down and stops on the player who goes back 3. The engine's `wyr` event now carries `candidates` (ids of everyone who was ahead) for this. With one player ahead, it lands on them after a short flicker; with nobody ahead there is no roulette.
- **Welcome pack [host request]:** on their first visit each season, every player gets a six-page onboarding pack before anything else: welcome and team line, how a day works (lock in before 4pm, dice at 4pm, replay after), the goal and zones, the board key, power-ups and Meeting Hell, and a send-off. Back, Next, Skip intro, arrow keys and Esc all work. A "How to play" button in the header reopens it. The team line and the season end ("Christmas Eve") are two constants at the top of web/js/welcome.js.
- **Custom avatars (pass two):** eight hand-drawn 32x32 sprites in web/js/avatars.js, each with a two-frame animation, Devil's Deal horns and the Meeting Hell glow: boot, bulldozer, sail boat, race car, blue cattle dog, platypus, Angus cow and Viking. The host picks one per player when creating a season (or later in the players table). Real names never go in the repo; nicknames and avatar choices live only in the database.
- **Eight players, 90 squares [host request]:** new seasons default to 90 squares and the new-season form has eight player rows (up to 12). Simulated with eight players: the first finisher usually lands around day 16, and 98% of seasons finish within 20 weekdays. The demo now has seven bots using the new avatars.
- **Dedicated Car Space [host request]:** the last zone is renamed from Building Car Space.
- **Test lab (demo only) [host request]:** a scenario picker in the demo that sets the demo player up to see a specific mechanic at the next 4pm: each decision offer, each power-up, landing on each square type, two sixes, three sixes, escaping or staying in Meeting Hell, a streak reward and finishing. It can also set today's daily event. Setting up a scenario resets today's event to Business as Usual, so an event can't change the outcome. Landing on a specific square uses "loaded dice" for the demo player only, through an engine option (`riggedDice`) that only the demo and the tests use; the live server never sets it. All 20 scenarios were run in a browser and each produced its mechanic.
- **Explainer cards [host request]:** big moments pause the replay with a card over the board showing the avatar, what happened, and the rule behind it. They cover daily events, trap doors, glass ceiling, Time in lieu blocks, Meeting Hell, escapes, power-ups, decision squares, every decision outcome, good surprises, CPI, surveys, Hot Desk Swap and the winner. Cards move on after a timer (4 to 11 seconds depending on length), or on Next, Space, Enter, right arrow or a click outside. A "Wait for me" switch disables the timer and is remembered.
- **Play-by-play panel [host request]:** a text log under the board that builds up as the replay plays, grouped by day and by player, with an end-of-day positions line. The last 3 days load on open, with an "Earlier days" button. It scrolls only inside its own box, never the page.
- **Spoiler guard:** while a new day's replay is playing, the side panel hides your new position and the day's text log doesn't show the new day until its replay reaches it.
- **Click for info [host request]:** tap any player (on the board, in the standings strip or on the progress bar) for their player card. Tap any square, Meeting Hell, reception or Long Service Leave for an explanation.
- **Watched-day tracking** is scoped per season, so a new season doesn't inherit an old season's "already watched" marker.
- Sound is muted by default, as the brief asked.

---

## 7. Bugs found and fixed during the build

1. **Revealed trap doors were invisible to players.** The player page only receives revealed trap doors, without the `revealed` flag, and the board only drew trap doors with that flag. Fixed by treating a missing flag as revealed; the host view still sends explicit true/false.
2. **Replays stopped auto-playing** after the demo restarted at an earlier date, because the "watched up to" date carried over. Fixed by scoping it per season. This would also have affected season 2 of the real game.
3. **The page jumped down during replays** because the play-by-play panel used `scrollIntoView`. Fixed by scrolling only inside the panel, and only when the reader is already at the bottom.
4. **Creating a season failed once the new square types existed,** because a database check constraint only allowed the original four types. It was caught by the end-to-end run and fixed in `0001_init.sql`. Unit tests couldn't catch it because they don't touch the database.
5. **Replay spoiled the result:** the side panel showed the new position before the replay finished. Fixed by the spoiler guard.

---

## 8. Known gaps and limitations

- **Not tested on a phone.** The layout is responsive, but only desktop has been checked.
- **No Hall of Fame page for players yet.** The `play` function has a `hall` action and the host can publish awards, but there's no player-facing screen to show them.
- **The board can't be hand-edited in the admin page.** The host can only regenerate it before the season starts. The brief says the board is data, and it is (the `squares` table), but editing means using the Supabase table editor.
- **Custom avatars are pass two.** The sprite system already looks avatars up by `avatar_key`.
- **No Game Master sprite** (an open item in the brief).
- **Copy is duplicated** between the server (`engine/content.ts`, which feeds the lock-in panel) and the replay (`web/js/replay.js`). They match today but could drift apart.
- **Season length is short** of the brief's 5 to 6 week target (section 3 table). This was accepted for the pilot.
- The pilot season starts in December, so a pause over the Christmas shutdown is expected.

---

## 9. Open questions for review

1. **"Agreed in principle" is deliberately underwhelming.** A guaranteed 4 is slightly below the 4.2 average roll, so its value is certainty and zero Meeting Hell risk, not distance. The name now matches that: an agreement that never quite delivers. Is that the right feel?
2. **Survey symmetry:** ±5 at 50/50 is zero-sum. Is that the right feel, or should good results be slightly more generous?
3. **Good surprise size (+3 to +6) and season length.** Options to lengthen the season: a 110 to 125 square board, smaller good surprises, or one more trap door.
4. **Consult with industry and Work From Home:** a frozen turn wastes a chosen Work From Home. Fair, or should Work From Home be kept for the next turn?
5. **Same-day finish rule:** because resolution runs last to first, a chaser who finishes on the same day as the leader wins. Intended drama, or should the furthest past the finish line win?
6. **1:1 time questions are retired globally** (across seasons, not just within one). The host needs about 30 fresh questions per season.
7. **Public power-ups:** any concern that showing who holds Time in lieu or Hot Desk Swap changes behaviour?
8. **Security review:** the anon key is published in `web/config.js` but can do nothing (RLS with no policies plus revoked grants). Is the bootstrap token flow acceptable for a single-host game?

---

## 10. Where things live

```
supabase/functions/_shared/engine/   rules engine (pure TypeScript, shared by server, demo and tests)
supabase/functions/{resolve,play,admin}/   Edge Functions
supabase/migrations/0001_init.sql    schema (RLS locked down), 0002_cron.sql hourly trigger
web/                                 static site: index.html (player), admin.html (host)
web/src/demo.ts                      demo backend (bundled to web/js/demo.js in CI)
engine/test/                         unit tests (node --test), integration.deno.ts end-to-end
engine/sim/simulate.ts               season simulator
docs/decisions.md                    rule interpretations in full
docs/deploy.md                       browser-only deployment guide
.github/workflows/                   test and publish site; deploy functions
```
