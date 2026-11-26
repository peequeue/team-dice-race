// Sydney calendar helpers. pg_cron runs hourly in UTC; these decide which game
// dates are due, so daylight saving never shifts the 4pm reveal.

export const TZ = 'Australia/Sydney';
export const REVEAL_HOUR = 16;

const fmt = new Intl.DateTimeFormat('en-AU', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function sydneyNow(now: Date): { date: string; hour: number; minute: number } {
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function isWeekday(date: string): boolean {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return dow >= 1 && dow <= 5;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function nextWeekday(date: string): string {
  let d = addDays(date, 1);
  while (!isWeekday(d)) d = addDays(d, 1);
  return d;
}

/** Weekday game dates from `from` to `to` inclusive. */
export function weekdaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWeekday(d)) out.push(d);
  return out;
}

/** Has the 4pm Sydney reveal for `date` passed at instant `now`? */
export function revealPassed(date: string, now: Date): boolean {
  const s = sydneyNow(now);
  if (s.date > date) return true;
  return s.date === date && s.hour >= REVEAL_HOUR;
}

/**
 * Game dates that are due for resolution, oldest first: weekdays from the season
 * start whose 4pm has passed and which have no resolution row (resolved or skipped).
 */
export function dueDates(seasonStart: string, done: Set<string>, now: Date): string[] {
  const today = sydneyNow(now).date;
  return weekdaysBetween(seasonStart, today).filter((d) => !done.has(d) && revealPassed(d, now));
}

/** The game date a lock-in made at `now` applies to. */
export function lockInDate(now: Date): string {
  const s = sydneyNow(now);
  if (isWeekday(s.date) && s.hour < REVEAL_HOUR) return s.date;
  return nextWeekday(s.date);
}

/** Milliseconds until the next 4pm reveal, for the countdown. */
export function msUntilReveal(now: Date): number {
  const target = lockInDate(now);
  // find the UTC instant of 16:00 Sydney on `target` (offset is +10 or +11)
  for (const offset of [11, 10]) {
    const guess = new Date(`${target}T${String(REVEAL_HOUR - offset).padStart(2, '0')}:00:00Z`);
    const s = sydneyNow(guess);
    if (s.date === target && s.hour === REVEAL_HOUR) return guess.getTime() - now.getTime();
  }
  throw new Error('Could not locate reveal time');
}
