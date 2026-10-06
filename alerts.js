// Which ntfy alerts a bake should have scheduled, and what to change to get there. Pure functions; sync.js sends them.
import { fmtTime } from './format.js';
import { bakeTimeline, bakeActions, actionDone, actionTime, stepOf, readyAt, isFinished } from './schedule.js';
import { MIN_DELAY_MS, MAX_DELAY_MS } from './ntfy.js';

const MOVED = 60 * 1000; // a time that moved less than this isn't worth a message

/**
 * One alert per action still to do, when it's due (the start of the window for mixing and shaping),
 * plus a gentler one when the bake is ready to eat. Times can be in the past.
 */
export function desiredAlerts(bake, now = Date.now()) {
  if (isFinished(bake, now)) return [];
  const tl = bakeTimeline(bake);
  const out = [];
  for (const a of bakeActions(bake)) {
    if (actionDone(bake, a)) continue;
    const t = a.finish ? stepOf(tl, a.step).start : actionTime(tl, a);
    out.push({ aid: a.id, t, title: a.name, message: `${bake.name}. Due ${fmtTime(t)}.`, priority: 5 });
  }
  out.push({ aid: 'ready', t: readyAt(tl), title: 'Ready to eat', message: `${bake.name} has cooled.`, priority: 3 });
  return out;
}

/** ntfy takes alerts from 10 seconds to 3 days ahead. Later ones get scheduled on a later open. */
export const inWindow = (t, now) => t > now + MIN_DELAY_MS && t < now + MAX_DELAY_MS - MOVED;

/**
 * Compare what's wanted with what the bake has already scheduled (bake.alertsSent: { aid: time }).
 * publish: new or moved alerts (re-sending with the same sequence ID replaces the old one).
 * cancel: scheduled alerts that are no longer wanted, or moved somewhere they can't be scheduled.
 */
export function planAlerts(bake, now = Date.now()) {
  const want = Object.fromEntries(desiredAlerts(bake, now).map(a => [a.aid, a]));
  const sent = bake.alertsSent || {};
  const publish = Object.values(want).filter(a => inWindow(a.t, now) && (sent[a.aid] == null || Math.abs(sent[a.aid] - a.t) >= MOVED));
  const cancel = [];
  for (const [aid, t] of Object.entries(sent)) {
    if (t <= now) continue; // already gone off
    const w = want[aid];
    if (!w || (Math.abs(w.t - t) >= MOVED && !inWindow(w.t, now))) cancel.push({ aid, t });
  }
  return { publish, cancel };
}
