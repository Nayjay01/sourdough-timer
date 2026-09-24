// Starter tracking: creating from scratch, strengthening ladders, feed log and hungry/peak status.
// Pure functions only; the UI lives in app.js.
import { HOUR, DAY, uid } from './format.js';
import { PEAK_HOURS } from './schedule.js';

export const DOUBLINGS_PER_STAGE = 3;
export const FEED_INTERVAL_HOURS = 24;
export const FIRST_MIX = { flour: 50, water: 50 };

export const LADDERS = {
  quick: {
    name: 'Quick', ratios: [1, 2, 5, 10], days: 'about 12 days',
    blurb: 'Bread soonest and the least flour. The jump from 1:2:2 to 1:5:5 is big for a young culture, so expect a stage or two to take extra days.',
  },
  balanced: {
    name: 'Balanced', ratios: [1, 2, 3, 5, 10], days: 'about 15 days',
    blurb: 'One extra step softens the big jump in the middle. A good default if you are not sure.',
  },
  gentle: {
    name: 'Gentle', ratios: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], days: 'about 30 days',
    blurb: 'Every step is small, so it rarely stalls and you learn exactly how it behaves. Slowest, and uses the most flour over the month.',
  },
};

export const PHASE_LABEL = { create: 'Getting started', strengthen: 'Strengthening', mature: 'Mature' };

/** mode: 'scratch' starts at day 1, 'active' skips to the ladder, 'mature' is ready to bake. */
export function newStarter({ name, mode, ladder = 'balanced', keep = 20, now = Date.now() }) {
  const st = { id: uid(), name: name || 'Starter', createdAt: now, keep, ladder, fridge: false, fridgeSince: null, feeds: [] };
  if (mode === 'scratch') {
    st.phase = 'create';
    st.feeds.push({ t: now, r: 0, starter: 0, ...FIRST_MIX, doubled: null, phase: 'create', note: 'First mix' });
  } else {
    st.phase = mode === 'mature' ? 'mature' : 'strengthen';
  }
  return st;
}
export function normalizeStarter(st) {
  return { keep: 20, ladder: 'balanced', fridge: false, fridgeSince: null, feeds: [], ...st };
}

export function lastFeed(st) { return st.feeds[st.feeds.length - 1] || null; }
export function dayNumber(st, now = Date.now()) { return Math.floor((now - st.createdAt) / DAY) + 1; }

/** Doubled feeds at ratio r while strengthening. */
export function doublingsAt(st, r) {
  return st.feeds.filter(f => f.phase === 'strengthen' && f.r === r && f.doubled === true).length;
}
/** Index of the current ladder stage, or -1 once every stage has its doublings. */
export function stageIndex(st) {
  return LADDERS[st.ladder].ratios.findIndex(r => doublingsAt(st, r) < DOUBLINGS_PER_STAGE);
}
/** Ratio for the next feed (the 10 in 1:10:10). Mature starters use what you pick. */
export function currentRatio(st, fallback = 5) {
  if (st.phase === 'create') return 1;
  if (st.phase === 'strengthen') {
    const i = stageIndex(st);
    const ratios = LADDERS[st.ladder].ratios;
    return ratios[i === -1 ? ratios.length - 1 : i];
  }
  return lastFeed(st)?.r || fallback;
}
export function feedAmounts(st, r) {
  return { r, starter: st.keep, flour: st.keep * r, water: st.keep * r };
}

/**
 * Record a feed. `doubled` answers "did it double since the last feed?" and is
 * stored on the previous feed. Moves up the ladder after enough doublings, and
 * marks the starter mature at the top. Returns what changed.
 */
export function logFeed(st, { t = Date.now(), r, doubled, note = '', amounts } = {}) {
  const prev = lastFeed(st);
  if (prev && doubled !== undefined && doubled !== null) prev.doubled = doubled;
  let advanced = false, matured = false;
  if (st.phase === 'strengthen') {
    const before = prev && prev.phase === 'strengthen' ? prev.r : null;
    const ratio = currentRatio(st);
    advanced = before != null && ratio !== before;
    if (stageIndex(st) === -1) { st.phase = 'mature'; st.maturedAt = t; st.maturedByLadder = true; matured = true; }
  }
  const ratio = r ?? currentRatio(st);
  const a = amounts || feedAmounts(st, ratio);
  st.feeds.push({ t, r: ratio, starter: a.starter, flour: a.flour, water: a.water, doubled: null, phase: st.phase, note });
  return { advanced, matured, ratio };
}
/** Remove the latest feed and roll back anything it caused. */
export function undoLastFeed(st) {
  if (st.feeds.length <= (st.feeds[0]?.r === 0 ? 1 : 0)) return false;
  st.feeds.pop();
  const prev = lastFeed(st);
  if (prev) prev.doubled = null;
  if (st.phase === 'mature' && st.maturedByLadder && stageIndex(st) !== -1) {
    st.phase = 'strengthen'; st.maturedByLadder = false; st.maturedAt = null;
  }
  return true;
}
export function startStrengthening(st, ladder) { st.phase = 'strengthen'; st.ladder = ladder; }
export function setFridge(st, inFridge, now = Date.now()) { st.fridge = inFridge; st.fridgeSince = inFridge ? now : null; }

/**
 * Where the starter is right now.
 * Returns { state, title, detail, nextAt?, peakAt? } where state is one of
 * new, fridge, fridge-due, fridge-long, due, waiting, rising, peak, past-peak, hungry.
 */
export function statusOf(st, now = Date.now()) {
  const last = lastFeed(st);
  if (st.fridge) {
    const days = (now - st.fridgeSince) / DAY;
    if (days >= 14) return { state: 'fridge-long', title: 'Resting in the fridge a long while', detail: 'Over two weeks. Revive it with two or three warm feeds before baking.', nextAt: st.fridgeSince + 7 * DAY };
    if (days >= 7) return { state: 'fridge-due', title: 'Due a feed', detail: 'A week in the fridge. Take it out, feed it, leave it an hour or two, then back in.', nextAt: st.fridgeSince + 7 * DAY };
    return { state: 'fridge', title: 'Resting in the fridge', detail: 'Feed it about once a week.', nextAt: st.fridgeSince + 7 * DAY };
  }
  if (!last) return { state: 'new', title: 'Not fed yet', detail: 'Log its first feed to start tracking.' };

  if (st.phase !== 'mature') {
    const nextAt = last.t + FEED_INTERVAL_HOURS * HOUR;
    return nextAt <= now
      ? { state: 'due', title: 'Feed due', detail: 'Check whether it doubled, then feed.', nextAt }
      : st.phase === 'create'
        ? { state: 'waiting', title: 'Fed, give it time', detail: 'Look for bubbles and rise, and note the smell.', nextAt }
        : { state: 'waiting', title: 'Fed, let it rise', detail: 'It should at least double before the next feed.', nextAt };
  }
  const peakAt = last.t + (PEAK_HOURS[last.r] || 8) * HOUR;
  if (now < peakAt - 1.5 * HOUR) return { state: 'rising', title: 'Rising', detail: 'Usually peaks about the time shown, sooner if it is warm.', peakAt };
  if (now <= peakAt + 1.5 * HOUR) return { state: 'peak', title: 'Around its peak', detail: 'Domed and bubbly: the best time to use it.', peakAt };
  if (now <= peakAt + 6 * HOUR) return { state: 'past-peak', title: 'Past its peak', detail: 'Getting hungry. Feed it soon, or put it in the fridge.', peakAt };
  return { state: 'hungry', title: 'Hungry', detail: 'Feed it, or it will get very sour and sluggish.', peakAt };
}

/** Day-by-day guidance while a new starter comes to life. */
export function createGuidance(day) {
  if (day <= 1) return { title: 'Day 1: mixed', body: 'Leave it somewhere warm, ideally 24–27°C, with the lid resting on top rather than sealed.' };
  if (day === 2) return { title: 'Day 2: maybe nothing yet', body: 'A few bubbles or nothing at all are both normal. Feed as usual.' };
  if (day <= 4) return { title: `Day ${day}: the false rise`, body: 'You may get a big early rise and odd smells: cheesy, sour, even like vomit. That is bacteria getting going, not the yeast yet. Keep feeding on schedule.' };
  if (day <= 8) return { title: `Day ${day}: the lull`, body: 'It often goes quiet now while the good microbes take over. This is normal. Keep feeding and keep it warm; don’t give up.' };
  if (day <= 14) return { title: `Day ${day}: waking up`, body: 'Look for it doubling within 8–12 hours of a feed, bubbles right through, and a pleasant tangy or yeasty smell. Two days of that and it is alive.' };
  return { title: `Day ${day}: still sluggish?`, body: 'Move it somewhere warmer, use some wholemeal or rye in the feeds, try filtered water, or feed twice a day once it is rising and falling within 12 hours.' };
}
export const ALIVE_SIGNS = [
  'Doubles within about 12 hours of a 1:1:1 feed',
  'Does it two days in a row',
  'Smells pleasant: tangy, yoghurty or yeasty, not cheesy or like vomit',
  'Bubbles all the way through, not just on top',
];
export const HUNGRY_SIGNS = [
  'Risen and fallen back, leaving streaks on the jar above the surface',
  'Flat or sunken top with few bubbles',
  'A layer of grey or dark liquid (hooch) on top',
  'Sharp smell of alcohol or nail polish remover',
  'Thin and runny compared with just after a feed',
];
export const PEAK_SIGNS = [
  'At its highest point, top domed or just starting to flatten',
  'Bubbles all through, light and airy when stirred',
  'Pleasant tangy smell',
];
