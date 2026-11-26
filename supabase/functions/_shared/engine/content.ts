// Display names and flavour text. Kept in the engine so the replay and the
// server agree. Australian English, no em dashes.
import type { DecisionOption, PowerUp } from './types.ts';

export const POWERUP_NAMES: Record<PowerUp, string> = {
  double_dice: 'All FY KPIs Met!',
  shield: 'Time in lieu',
  lucky_roll: 'Ctrl+Z',
  swap: 'Hot Desk Swap',
};

export const POWERUP_TEXT: Record<PowerUp, string> = {
  double_dice: "Play it to roll two dice and add them together. Sixes don't roll again with it, so there's no risk of Meeting Hell.",
  shield: "Works on its own. You're off on time in lieu when the next trap door lands, so it can't touch you. Then it's used up.",
  lucky_roll: 'Play it and, if your roll comes up a 1 or 2, it gets undone and rolled again automatically.',
  swap: 'Play it and, after you move, you swap desks with whoever is just ahead of you.',
};

export const DECISION_NAMES: Record<DecisionOption, string> = {
  two_up: 'Two-Up',
  wyr: '1:1 time',
  book_truck: 'Work From Home',
  consignment: 'Submitted project to PRC',
  devils_deal: "Devil's Deal",
};

export const DECISION_TEXT: Record<DecisionOption, string> = {
  two_up: 'Call heads or tails. Get it right and you move forward x2 the roll that got you here. Get it wrong and you go back the same amount.',
  wyr: 'In your 1:1, guess which way the boss answered a this-or-that question. Right, and a random player ahead of you goes back 3. Wrong, and you go back 2.',
  book_truck: "Skip today's roll and move exactly 4 squares instead. No sixes, so no risk of Meeting Hell.",
  consignment: "Put your project in front of the Project Review Committee. Two times in three it's approved and you get a power-up (or 3 squares if your hands are full). Otherwise it's sent back for rework, which halves your next two rolls.",
  devils_deal: 'Jump forward 10 squares straight away. The catch: for the rest of the season, two sixes in a row sends you to Meeting Hell instead of three.',
};

export const CURSE_TEXT = {
  lame_steer: 'Sent back for rework: next two rolls will be halved (rounded up)',
};
