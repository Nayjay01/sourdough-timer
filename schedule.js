// Bake scheduling: step definitions, timelines, clash checks, solvers, replans and recipe maths.
// Pure functions only; the UI lives in app.js.
import { MIN, fmtDur } from './format.js';

/* ---------- Steps ---------- */

export const FEED_DEF = {
  id: 'feed', name: 'Feed the starter', dur: 390, min: 180, max: 900, inc: 15, attend: 'start', feed: true,
  doneQ: 'When did you feed the starter?', short: 'Starter feed to mix',
  note: 'Wait for it to peak, domed and at least doubled, before mixing.',
};
export const STEP_DEFS = [
  { id: 'mix',   name: 'Mix the dough',      dur: 15,  min: 5,   max: 30,   inc: 5,  attend: 'start', note: 'Starter, water, flour, salt.', doneQ: 'When did you finish mixing?', short: 'Mixing' },
  { id: 'rest',  name: 'First rest',         dur: 45,  min: 15,  max: 120,  inc: 5,  attend: 'none',  note: 'Wait until it has grown about 50%.', doneQ: 'When did the first rest finish?', short: 'First rest' },
  { id: 'fold1', name: 'Stretch and fold 1', dur: 30,  min: 15,  max: 60,   inc: 5,  attend: 'start', doneQ: 'When did you do the first stretch and fold?' },
  { id: 'fold2', name: 'Stretch and fold 2', dur: 30,  min: 15,  max: 60,   inc: 5,  attend: 'start', doneQ: 'When did you do the second stretch and fold?' },
  { id: 'fold3', name: 'Stretch and fold 3', dur: 30,  min: 15,  max: 60,   inc: 5,  attend: 'start', doneQ: 'When did you do the third stretch and fold?' },
  { id: 'fold4', name: 'Stretch and fold 4', dur: 30,  min: 15,  max: 60,   inc: 5,  attend: 'start', doneQ: 'When did you do the last stretch and fold?' },
  { id: 'bulk',  name: 'Bulk ferment',       dur: 300, min: 120, max: 600,  inc: 15, attend: 'none',  note: 'Leave it. Adjust the slider if it is running fast or slow.', doneQ: 'When did bulk ferment finish?', short: 'Bulk' },
  { id: 'shape', name: 'Shape',              dur: 30,  min: 10,  max: 60,   inc: 5,  attend: 'both',  note: 'Shape, into the banneton, into the fridge.', doneQ: 'When did it go into the fridge?', short: 'Shaping' },
  { id: 'cold',  name: 'Cold proof',         dur: 720, min: 480, max: 1440, inc: 30, attend: 'none',  flex: true, note: 'In the fridge. This is the step that stretches around sleep.', doneQ: 'When did it come out of the fridge?', short: 'Fridge' },
  { id: 'bake',  name: 'Bake',               dur: 50,  min: 30,  max: 90,   inc: 5,  attend: 'both',  note: 'From cold, in the Dutch oven.', doneQ: 'When did it come out of the oven?', short: 'Bake' },
  { id: 'cool',  name: 'Cool',               dur: 60,  min: 30,  max: 180,  inc: 15, attend: 'none',  note: 'Do not cut it yet.', doneQ: 'When did it finish cooling?', short: 'Cooling' },
];
export const ALL_DEFS = [FEED_DEF, ...STEP_DEFS];
export const STEP_BY_ID = Object.fromEntries(ALL_DEFS.map(s => [s.id, s]));
export const FOLD_GAPS = ['fold1', 'fold2', 'fold3']; // gaps between folds; fold4's gap leads into bulk

export function defsFor(withFeed) { return withFeed ? ALL_DEFS : STEP_DEFS; }
export function bakeDefs(bake) { return defsFor(!!bake.withFeed); }

/* ---------- Settings ---------- */

export const LOAF_SIZES = ['small', 'medium', 'large'];
export const LOAF_LABEL = { small: 'Small', medium: 'Medium', large: 'Large' };

export const DEFAULT_SETTINGS = {
  sleepStart: '22:00',
  sleepEnd: '08:00',
  graceMins: 30,
  durs: Object.fromEntries(ALL_DEFS.map(s => [s.id, s.dur])),
  coldMin: 480,
  coldMax: 1440,
  foldMin: 20,
  bulkMin: 240,
  bulkMax: 420,
  // Small and large loaves as a multiple of a recipe's medium loaf.
  loafScale: { small: 0.7, medium: 1, large: 1.5 },
  starterKeep: 20,
};
export function loafCount(loaves) { return LOAF_SIZES.reduce((a, s) => a + (loaves?.[s] || 0), 0); }

/* ---------- Starter feeds ---------- */

// Hours from feeding a healthy starter to its peak, at about 24°C.
export const PEAK_HOURS = { 1: 4.5, 2: 6.5, 3: 7.5, 4: 8, 5: 9, 6: 9.5, 7: 10, 8: 10.5, 9: 11, 10: 12 };
export const BAKE_FEED_RATIOS = [1, 2, 5, 10];

/** The feed ratio whose usual peak time best matches a wait of `mins`. */
export function ratioForFeed(mins) {
  return BAKE_FEED_RATIOS.reduce((best, r) =>
    Math.abs(PEAK_HOURS[r] * 60 - mins) < Math.abs(PEAK_HOURS[best] * 60 - mins) ? r : best, 1);
}
/** Amounts to feed so there is `need` g for the dough plus `keep` g left in the jar. */
export function feedPlan(need, keep, r) {
  const want = need + keep;
  const seed = Math.max(5, Math.ceil(want / (1 + 2 * r)));
  return { r, starter: seed, flour: seed * r, water: seed * r, makes: seed * (1 + 2 * r), need, keep };
}
/** Feed wait lengths the solver may use, closest to the preferred one first. */
function feedChoices(prefer) {
  const opts = BAKE_FEED_RATIOS.map(r => PEAK_HOURS[r] * 60);
  return [prefer, ...opts.filter(o => o !== prefer).sort((a, b) => Math.abs(a - prefer) - Math.abs(b - prefer))];
}

/* ---------- Sleep window ---------- */

function minutesOfDay(t) { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); }
function parseHM(hm) { const [h, m] = hm.split(':').map(Number); return h * 60 + m; }
export function isAsleep(t, settings) {
  const m = minutesOfDay(t);
  const s = parseHM(settings.sleepStart), e = parseHM(settings.sleepEnd);
  if (s === e) return false;
  if (s < e) return m >= s && m < e;
  return m >= s || m < e; // wraps midnight
}
/** 'hard' deep in the sleep window, 'soft' within the grace margin of either edge, null when awake. */
export function sleepLevel(t, settings) {
  if (!isAsleep(t, settings)) return null;
  const m = minutesOfDay(t);
  const s = parseHM(settings.sleepStart), e = parseHM(settings.sleepEnd);
  const edge = Math.min((m - s + 1440) % 1440, (e - m + 1440) % 1440);
  return edge < (settings.graceMins || 0) ? 'soft' : 'hard';
}

/* ---------- Timelines ---------- */

export function buildTimeline(startAt, durs, defs = STEP_DEFS) {
  let t = startAt;
  return defs.map(def => {
    const dur = durs[def.id];
    const step = { def, start: t, end: t + dur * MIN, dur };
    t = step.end;
    return step;
  });
}
export function bakeTimeline(bake, durs = bake.durs, startAt = bake.startAt) {
  return buildTimeline(startAt, durs, bakeDefs(bake));
}
export function stepOf(tl, id) { return tl.find(s => s.def.id === id); }
export function readyAt(tl) { return tl[tl.length - 1].end; }
export function totalMinutes(durs, defs = STEP_DEFS) { return defs.reduce((a, d) => a + durs[d.id], 0); }

/** Moments where a person must be present. `key` identifies the moment for overrides. */
export function attendMoments(tl) {
  const out = [];
  for (const s of tl) {
    if (s.def.attend === 'start' || s.def.attend === 'both') out.push({ t: s.start, step: s, label: s.def.name, key: `${s.def.id}:start` });
    if (s.def.attend === 'both') out.push({ t: s.end, step: s, label: `Finish ${s.def.name.toLowerCase()}`, key: `${s.def.id}:end` });
  }
  return out;
}

/**
 * Every upcoming hands-on moment that clashes with sleep or a time you're out.
 * ctx: { respectSleep, done, overrides, busy, now }. Done steps and moments
 * already in the past are never flagged; overridden moments are skipped.
 */
export function checkMoments(tl, settings, ctx = {}) {
  const { respectSleep = true, done = {}, overrides = {}, busy = [], now = -Infinity } = ctx;
  const out = [];
  for (const m of attendMoments(tl)) {
    if (done[m.step.def.id] || m.t <= now || overrides[m.key]) continue;
    if (busy.some(b => m.t >= b.from && m.t < b.to)) { out.push({ ...m, level: 'hard', reason: 'out' }); continue; }
    const lvl = respectSleep ? sleepLevel(m.t, settings) : null;
    if (lvl) out.push({ ...m, level: lvl, reason: 'sleep' });
  }
  return out;
}
export const hardOnly = ms => ms.filter(m => m.level === 'hard');
export function bakeCtx(bake, now = Date.now()) {
  return { respectSleep: bake.respectSleep, done: bake.done, overrides: bake.overrides || {}, busy: bake.busy || [], now };
}

/* ---------- New-bake solvers ---------- */

/** Cold proof length closest to `prefer` (within limits) that clears every hard clash, or null. */
export function fitCold(startAt, durs, defs, settings, ctx, prefer, minCold = settings.coldMin) {
  const inc = STEP_BY_ID.cold.inc;
  const lo = Math.max(settings.coldMin, minCold), hi = settings.coldMax;
  const ok = d => hardOnly(checkMoments(buildTimeline(startAt, { ...durs, cold: d }, defs), settings, ctx)).length === 0;
  const start = Math.min(hi, Math.max(lo, prefer));
  if (ok(start)) return start;
  for (let k = inc; k <= hi - lo + inc; k += inc) {
    if (start - k >= lo && ok(start - k)) return start - k;
    if (start + k <= hi && ok(start + k)) return start + k;
  }
  return null;
}

/** Forward: start at `startAt` (feeding first if withFeed); pick feed wait and fridge time to dodge sleep. */
export function solveForward(startAt, settings, respectSleep, withFeed = false) {
  const defs = defsFor(withFeed);
  const ctx = { respectSleep };
  const feeds = withFeed ? feedChoices(settings.durs.feed) : [null];
  for (const f of feeds) {
    const durs = { ...settings.durs, ...(f ? { feed: f } : {}) };
    const d = fitCold(startAt, durs, defs, settings, ctx, settings.coldMin);
    if (d != null) { durs.cold = d; return { ok: true, startAt, durs, timeline: buildTimeline(startAt, durs, defs) }; }
  }
  const durs = { ...settings.durs };
  const tl = buildTimeline(startAt, durs, defs);
  return { ok: false, startAt, durs, timeline: tl, conflicts: hardOnly(checkMoments(tl, settings, ctx)) };
}
/** Earliest start at or after `from` that works. */
export function nextGoodStart(from, settings, respectSleep, withFeed = false, horizonHours = 48) {
  for (let t = from; t <= from + horizonHours * 60 * MIN; t += 15 * MIN) {
    const r = solveForward(t, settings, respectSleep, withFeed);
    if (r.ok) return r;
  }
  return null;
}
/** Backward: finish cooling at `ready`. Shortest fridge time that works wins (latest possible start). */
export function solveBackward(ready, settings, respectSleep, withFeed = false) {
  const defs = defsFor(withFeed);
  const ctx = { respectSleep };
  const feeds = withFeed ? feedChoices(settings.durs.feed) : [null];
  for (let c = settings.coldMin; c <= settings.coldMax; c += STEP_BY_ID.cold.inc) {
    for (const f of feeds) {
      const durs = { ...settings.durs, cold: c, ...(f ? { feed: f } : {}) };
      const startAt = ready - totalMinutes(durs, defs) * MIN;
      const tl = buildTimeline(startAt, durs, defs);
      if (hardOnly(checkMoments(tl, settings, ctx)).length === 0) return { ok: true, startAt, durs, timeline: tl };
    }
  }
  const durs = { ...settings.durs };
  const startAt = ready - totalMinutes(durs, defs) * MIN;
  const tl = buildTimeline(startAt, durs, defs);
  return { ok: false, startAt, durs, timeline: tl, conflicts: hardOnly(checkMoments(tl, settings, ctx)) };
}
/** Nearest workable ready times on either side of a failed target. */
export function nearbyReadyTimes(ready, settings, respectSleep, withFeed = false) {
  let earlier = null, later = null;
  for (let k = 1; k <= 96 && (!earlier || !later); k++) {
    if (!earlier && solveBackward(ready - k * 15 * MIN, settings, respectSleep, withFeed).ok) earlier = ready - k * 15 * MIN;
    if (!later && solveBackward(ready + k * 15 * MIN, settings, respectSleep, withFeed).ok) later = ready + k * 15 * MIN;
  }
  return { earlier, later };
}

/* ---------- Live bake: done, replans ---------- */

/** Move step i's start to `newStart` by stretching or trimming the step before it. */
function shiftStart(bake, tl, i, newStart) {
  const delta = newStart - tl[i].start;
  if (i === 0) { bake.startAt += delta; return; }
  const prev = tl[i - 1];
  bake.durs[prev.def.id] = Math.max(0, Math.round((prev.end + delta - prev.start) / MIN));
}
/**
 * "Done now" on a step. Feeding and folds are actions at the start of their
 * step, so done means "I did it now" and the wait after it stays. Every other
 * step is a span that ends when you say so, so its duration becomes what elapsed.
 */
export function markDone(bake, tl, id, now = Date.now()) {
  const i = tl.findIndex(s => s.def.id === id);
  const s = tl[i];
  const actionAtStart = s.def.attend === 'start' && s.def.id !== 'mix';
  if (actionAtStart) shiftStart(bake, tl, i, now);
  else if (now < s.start) shiftStart(bake, tl, i, now - s.dur * MIN);
  else bake.durs[id] = Math.max(0, Math.round((now - s.start) / MIN));
  bake.done[id] = true;
}
/** When a step counts as done if it runs to plan: the moment of the action for feeds and folds, the end for everything else. */
export function isActionStep(def) { return def.attend === 'start' && def.id !== 'mix'; }
export function plannedDoneAt(step) { return isActionStep(step.def) ? step.start : step.end; }

/**
 * Mark a step done at `at` and remember how far that was from the plan, in
 * minutes (positive is late). Later steps move by the same amount.
 */
export function completeStep(bake, tl, id, at) {
  const step = stepOf(tl, id);
  const late = Math.round((at - plannedDoneAt(step)) / MIN);
  markDone(bake, tl, id, at);
  bake.late = { ...(bake.late || {}), [id]: late };
  return late;
}
/** Save the parts of a bake that marking steps done changes, so it can be undone. */
export function pushHistory(bake) {
  const snap = JSON.parse(JSON.stringify({ startAt: bake.startAt, durs: bake.durs, done: bake.done, late: bake.late || {}, feedDone: bake.feedDone || null }));
  bake.history = [...(bake.history || []), snap].slice(-10);
  return snap;
}
export function popHistory(bake) {
  const snap = (bake.history || []).pop();
  if (!snap) return null;
  Object.assign(bake, { startAt: snap.startAt, durs: snap.durs, done: snap.done, late: snap.late, feedDone: snap.feedDone || undefined });
  return snap;
}
/** Remaining steps, in order, whose planned done time has already passed. */
export function catchUpSteps(bake, now = Date.now()) {
  const tl = bakeTimeline(bake);
  const out = [];
  for (let i = currentIndex(bake); i < tl.length && plannedDoneAt(tl[i]) <= now; i++) out.push(tl[i]);
  return out;
}
export function isFinished(bake) { return currentIndex(bake) >= bakeDefs(bake).length; }

/**
 * What ran differently from the plan the bake was made with.
 * Returns [{ id, text }], e.g. "First rest 1h 45m (+1h)".
 */
export function deviations(bake, plan = bake.plan || bake.durs) {
  const out = [];
  const signed = d => `${d > 0 ? '+' : '−'}${fmtDur(Math.abs(d))}`;
  if (bake.withFeed) {
    const d = bake.durs.feed - plan.feed;
    if (Math.abs(d) >= 30) out.push({ id: 'feed', text: `Starter feed to mix ${fmtDur(bake.durs.feed)} (${signed(d)})` });
  }
  const steps = id => STEP_BY_ID[id];
  for (const id of ['rest']) {
    const d = bake.durs[id] - plan[id];
    if (Math.abs(d) >= 10) out.push({ id, text: `${steps(id).short} ${fmtDur(bake.durs[id])} (${signed(d)})` });
  }
  const gaps = FOLD_GAPS.map(id => bake.durs[id]);
  if (FOLD_GAPS.some(id => Math.abs(bake.durs[id] - plan[id]) >= 5)) {
    const lo = Math.min(...gaps), hi = Math.max(...gaps);
    out.push({ id: 'folds', text: lo === hi ? `Folds every ${lo} min` : `Folds ${lo}–${hi} min apart` });
  }
  for (const [id, tol] of [['bulk', 15], ['cold', 30], ['bake', 5]]) {
    const d = bake.durs[id] - plan[id];
    if (Math.abs(d) >= tol) out.push({ id, text: `${steps(id).short} ${fmtDur(bake.durs[id])} (${signed(d)})` });
  }
  return out;
}

export function currentIndex(bake) {
  const defs = bakeDefs(bake);
  const i = defs.findIndex(d => !bake.done[d.id]);
  return i === -1 ? defs.length : i;
}
export function nextAction(bake, now = Date.now()) {
  const tl = bakeTimeline(bake);
  const ci = currentIndex(bake);
  if (ci >= tl.length) return { label: 'Ready to eat', t: readyAt(tl), finished: true };
  const s = tl[ci];
  if (s.start > now && s.def.attend !== 'none') return { label: s.def.name, t: s.start, step: s };
  if (s.def.attend === 'both') return { label: `Finish ${s.def.name.toLowerCase()}`, t: s.end, step: s };
  if (s.def.attend === 'none') {
    const nxt = tl[ci + 1];
    return { label: nxt ? nxt.def.name : 'Ready to eat', t: s.end, step: s };
  }
  return { label: s.def.name, t: s.start, step: s };
}

/**
 * Which remaining durations a replan may touch, with the shortest each can be
 * given what has already happened. A fold gap is editable while the next fold
 * hasn't happened; bulk and cold while they aren't done.
 */
export function editableDurations(bake, tl, now) {
  const elapsed = s => Math.max(0, Math.ceil((now - s.start) / MIN));
  const folds = [];
  for (const id of FOLD_GAPS) {
    const i = tl.findIndex(s => s.def.id === id);
    const next = tl[i + 1];
    if (!bake.done[next.def.id] && next.start > now) folds.push({ id, floor: elapsed(tl[i]) });
  }
  return {
    folds,
    bulk: bake.done.bulk ? null : { floor: elapsed(stepOf(tl, 'bulk')) },
    cold: bake.done.cold ? null : { floor: elapsed(stepOf(tl, 'cold')) },
  };
}

/**
 * Replan options for a bake with clashes, gentlest first: fridge only, tighter
 * folds, bulk shorter or longer, then folds and bulk together.
 * strict: also clear clashes that are only inside the grace margin.
 */
export function fixOptions(bake, rawSettings, now = Date.now(), { strict = false } = {}) {
  const settings = strict ? { ...rawSettings, graceMins: 0 } : rawSettings;
  const defs = bakeDefs(bake);
  const tl = bakeTimeline(bake);
  const ctx = bakeCtx(bake, now);
  const ed = editableDurations(bake, tl, now);
  const base = bake.durs;

  const withCold = durs => {
    if (!ed.cold) return hardOnly(checkMoments(buildTimeline(bake.startAt, durs, defs), settings, ctx)).length === 0 ? durs : null;
    const d = fitCold(bake.startAt, durs, defs, settings, ctx, base.cold, ed.cold.floor);
    return d == null ? null : { ...durs, cold: d };
  };
  const setFolds = (durs, gap) => {
    const out = { ...durs };
    ed.folds.forEach(f => { out[f.id] = Math.max(f.floor, Math.min(base[f.id], gap)); });
    return out;
  };
  const curGap = ed.folds.length ? Math.max(...ed.folds.map(f => base[f.id])) : null;
  const foldSteps = [];
  if (curGap != null) for (let g = curGap - 5; g >= settings.foldMin; g -= 5) foldSteps.push(g);
  const bulkSteps = [];
  if (ed.bulk) {
    const lo = Math.max(settings.bulkMin, ed.bulk.floor), hi = settings.bulkMax;
    for (let k = 15; k <= Math.max(base.bulk - lo, hi - base.bulk); k += 15) {
      if (base.bulk - k >= lo) bulkSteps.push(base.bulk - k);
      if (base.bulk + k <= hi) bulkSteps.push(base.bulk + k);
    }
  }

  const options = [];
  const push = (kind, durs, gap) => durs && options.push(describeOption(kind, bake, durs, gap, settings, now));
  if (ed.cold) push('cold', withCold({ ...base }));
  for (const g of foldSteps) { const d = withCold(setFolds(base, g)); if (d) { push('folds', d, g); break; } }
  for (const b of bulkSteps) { const d = withCold({ ...base, bulk: b }); if (d) { push('bulk', d); break; } }
  if (!options.some(o => o.kind === 'folds' || o.kind === 'bulk')) {
    let best = null;
    for (const g of foldSteps) for (const b of bulkSteps) {
      const d = withCold({ ...setFolds(base, g), bulk: b });
      const cost = (curGap - g) * ed.folds.length + Math.abs(b - base.bulk);
      if (d && (!best || cost < best.cost)) best = { d, g, cost };
    }
    if (best) push('both', best.d, best.g);
  }
  const seen = new Set();
  return options.filter(o => {
    const k = JSON.stringify(o.durs);
    if (o.changes.length === 0 || seen.has(k)) return false;
    seen.add(k); return true;
  });
}
function describeOption(kind, bake, durs, gap, settings, now) {
  const tl = bakeTimeline(bake, durs);
  const changes = [];
  if (gap != null && FOLD_GAPS.some(id => durs[id] !== bake.durs[id])) changes.push(`Folds every ${gap} min`);
  if (durs.bulk !== bake.durs.bulk) changes.push(`Bulk ${fmtDur(durs.bulk)} (${durs.bulk < bake.durs.bulk ? 'warmer spot' : 'cooler spot'})`);
  if (durs.cold !== bake.durs.cold) changes.push(`Fridge ${fmtDur(durs.cold)}`);
  const titles = { cold: 'Adjust the fridge proof', folds: 'Tighten the folds', bulk: durs.bulk < bake.durs.bulk ? 'Shorten bulk' : 'Lengthen bulk', both: 'Tighten folds and change bulk' };
  const soft = checkMoments(tl, settings, bakeCtx(bake, now)).filter(m => m.level === 'soft');
  return { kind, title: titles[kind], durs, changes, timeline: tl, soft };
}
