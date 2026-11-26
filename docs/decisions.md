# Rule interpretations and build decisions

## Theme (changed from the brief at the host's request)
The board is themed around office life, not the farm-to-export supply chain:
- Finish: **Long Service Leave**. Start: first day at reception.
- Zones: Onboarding, Open Plan, Meeting Rooms, Dedicated Desk (was Middle Management), Dedicated Car Space (was Building Car Space).
- Hell is **Meeting Hell**. Power-ups: All FY KPIs Met! (Double Dice), Time in lieu (Shield), Ctrl+Z (Lucky Roll), Hot Desk Swap (Swap).
- Decisions: 1:1 time (Would You Rather), Work From Home (Book a Truck), Submitted project to PRC (Unmarked Consignment), sent back for rework (lame steer curse).
- Code keys are unchanged (`double_dice`, `book_truck` and so on), so a future retheme is copy-only.

Two square types were added for the theme:
- **Good surprises** (5 per board): the twin of trap doors. Hidden until landed on, then forward 3 to 6 squares (Positive client feedback, R&R award...). Passive movement, so they never chain.
- **Engagement survey** (4 per board, visible): 50/50. Great results, forward 5. Poor results, an engagement improvement session and back 5. Passive movement.
- **Agreed in principle** (one of the good surprises): no move when landed on; the next main move is exactly 4, with no dice (so no Meeting Hell risk) and no event or curse modifiers. A Work From Home day uses up the next turn first, and the agreed-in-principle move carries over.
- **Consult with industry** (first named "glass ceiling", renamed because it made light of a real barrier) (one of the trap doors): no drop when landed on; the next main move doesn't happen at all. Time in lieu blocks it and Change Freeze stops it. On the frozen turn a played All KPIs Met or Ctrl+Z stays held, and a chosen Work From Home is wasted.
- Effect on balance: the winner's average finish is about 3.8 weeks on a 100 square board (4.0 before these squares).
- The full list of changes from the brief, written for review, is in `docs/CHANGES.md`.

Where the brief left room, these are the calls made in the engine. Each one is easy to change.

## Movement
- **Start line** is position 0. Squares are 1 to N. Anything past N finishes, including passive movement (a Devil's Deal or Two-Up can win the race).
- **Hell** sets position to 0 and the `in_hell` flag. For ordering, Hell sits behind the start line, so Hell players resolve first.
- **Escape from Hell** moves to square 1 passively and ends the turn.
- **Passive backwards movement** stops at 0.

## Power-ups
- **Landing on a power-up square while holding one:** no effect, logged as "hands full". This was the brief's simpler option.
- **Power-up squares** give a random power-up unless the square's payload fixes one, so the host can put a fixed Shield square on the board if wanted.
- **Shield** sits in the held slot (so you can't hold anything else) and is passive. "Playing" it does nothing.
- **Lucky Roll** is used up when played, whether or not the first die was a 1 or 2. It only checks the first die (a 6 then a 1 is a 7, not a "low roll").
- **Book a Truck day:** a played Double Dice or Lucky Roll is not used and stays held. A played Swap still applies after the truck move.
- **In Hell:** power-ups can't be played and stay held.

## Decisions
- A pending decision chosen at the next lock-in resolves at the next reveal before the main roll. An auto-roll or a lock-in with no choice means Pass.
- **Unmarked Consignment, power-up result while holding one:** +3 squares (same as the streak rule). Asking the player to replace or keep would need a second lock-in.
- **The only curse in the pilot** is Lame steer (half movement, rounded up, for the next 2 main moves). Curses count down on main-move days only.
- **Devil's Deal offer rate:** exactly 1 in 8 offers is Devil's Deal plus one normal option. Otherwise the offer is two different normal options.
- **1:1 time (Would You Rather):** the question is retired as soon as it is shown, even if the player passes. If no questions are left, WYR stops being offered. A correct guess when nobody is ahead has no effect. Choosing WYR without picking A or B counts as wrong.
- **Two-Up (changed from the brief at the host's request):** the player calls heads or tails at lock-in. A correct call moves forward double the main move that landed them on the square (after event and curse modifiers). A wrong call moves back the same amount. The odds are still 50/50.

## Daily events
- Events modify dice rolls only. They don't touch Book a Truck, Hell rolls, passive moves or bonus rolls.
- "Last place" and "leader" are judged on board positions at the start of the day. Hell players are not counted.
- 12 events, with Quiet Day about 42% of days. A special event never repeats on consecutive days.

## Streaks and day handling
- The streak reward triggers on every fifth consecutive manual lock-in (5, 10, 15 and so on). Lock-ins made while in Hell count.
- Ties in resolution order are broken randomly each day.
- **Season end:** the first finisher in resolution order wins and the season ends that day. Everyone still resolves that day, so the replay is complete. Because order runs last to first, a chaser who finishes on the same day as the leader wins.
- **Bonus rolls** granted by the host are resolved after the main move as one die each, passive.

## Lock-ins and timing
- A lock-in is final once made (pressing Roll "locks in").
- A lock-in before 4pm on a weekday counts for today. After 4pm, or on a weekend, it counts for the next weekday.
- **Pause:** any date that falls due while the season is paused is recorded as skipped and never resolved later. Skipped days don't affect streaks.
- **Randomness:** each game date gets a fresh crypto-random seed when it resolves, stored in `resolutions.seed`. Re-rendering a day from its seed gives identical results.

## Server behaviour
- **Instant reveal:** if anyone opens the page after 4pm and the hourly job hasn't run yet, the server resolves the day straight away. The job is a backstop, so results appear at 4pm, not up to an hour later.
- **Lock-ins between 4pm and the reveal** are refused with "results have just come in", so nobody locks in for tomorrow before seeing today's decision offer.
- **Held power-ups are public** (tap a player to see their card). Knowing what someone holds doesn't change anyone's options, and it's good for banter. What stays private: lock-in choices, which decision options someone was offered, and any Would You Rather question in front of them. Their card just says a decision is pending.
- **Square info shows the menu, not the outcome.** Power-up and decision squares are resolved at random at 4pm, so tapping one lists every possible outcome and its odds. Revealed trap doors show their actual name and drop.
- **1:1 time questions are retired permanently** once shown, across seasons. Add fresh ones each season.
- **Bulk WYR entry:** one per line, `question | option A | option B | a or b`.

## Security
- RLS is on for every table with no policies, so the anon key can't read or write anything directly. The front end talks only to Edge Functions.
- The public repo must contain no nicknames, questions or keys. WYR questions and player setup go in through the admin view.

## Copy review (26 Nov)
- Host reviewed all player-facing text in a copy sheet. Applied: All FY KPIs Met!, zone Dedicated Desk, good surprise "Catering leftovers in the kitchen", Work From Home "Skip today's roll", Two-Up "x2", rework curse wording, Time in lieu short text, three new demo 1:1 questions.
- Engagement survey odds stay 50/50. The text now reads as the score that came back: 80% engaged (forward 5) or 40% engaged (back 5).
- Performance Review mechanic unchanged (leader only). The text now names the leader: "{leader} hasn't submitted their quarterly check-in!". If everyone is tied, it reads "Nobody has submitted their quarterly check-in!"
- 1:1 time, right answer: a roulette spins through everyone ahead, slows and stops on who goes back 3.
