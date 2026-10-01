// Bake screens: new bake, the live timeline, done/late handling, Fix it, notes and past bakes.
import {
  MIN, HOUR, DAY, fmtTime, fmtWhen, fmtDate, fmtDur, fmtCountdown, fmtLate, toLocalInput, roundTo, grams, ratioText,
  h, esc, slug, uid, sameDay, clone,
} from './format.js';
import {
  FOLD_GAPS, LOAF_SIZES, LOAF_LABEL, loafCount, ratioForFeed, feedPlan, bakeTimeline, stepOf, readyAt, attendMoments,
  checkMoments, hardOnly, bakeCtx, solveForward, solveBackward, nextGoodStart, nearbyReadyTimes, currentIndex,
  nextAction, editableDurations, fixOptions, plannedDoneAt, isActionStep, completeStep, pushHistory, popHistory,
  catchUpSteps, isFinished, deviations,
} from './schedule.js';
import { PHASE_LABEL, lastFeed, logFeed, undoLastFeed, setFridge } from './starter.js';
import { scaleRecipe, recipeSnapshot, recipeLine, effectiveSettings, sortRecipes, totalFlour, TIMING_FIELDS } from './recipes.js';
import {
  state, save, normalizeBake, starterById, recipeById, activeStarters, bakeSettings, go, goFrom, goBack,
} from './store.js';
import {
  app, sheet, on, keepScroll, tapOpen, fmtSleep, openSheet, closeSheet, toast, notesBlock, wireNotes, starsHtml, starPicker,
  wireStars, openAlarmSheet, alarmHelp, downloadIcs, chevron, gear, shareIcon, bell, cal,
} from './ui.js';
import { openSettings } from './settings-view.js';

/* ============================================================
   Helpers
   ============================================================ */
export function loavesText(loaves) {
  return LOAF_SIZES.filter(s => loaves[s]).map(s => `${loaves[s]} ${LOAF_LABEL[s].toLowerCase()}`).join(', ') + (loafCount(loaves) === 1 ? ' loaf' : ' loaves');
}
export function starterPhaseText(st) {
  if (st.retiredAt) return 'Retired';
  if (st.phase === 'create') return `Day ${Math.floor((Date.now() - st.createdAt) / DAY) + 1}`;
  if (st.phase === 'strengthen') return 'Strengthening';
  return st.fridge ? 'Mature, in fridge' : 'Mature';
}
function flagText(m) {
  if (m.reason === 'out') return `${m.label} is while you're out`;
  return m.level === 'hard' ? `${m.label} is in your sleep window` : `${m.label} is inside your ${state.settings.graceMins} min grace`;
}
function bakeScales(bake) { return bake.scales || state.settings.loafScale; }
/** Feed amounts for a bake, from its recipe and loaves and the current feed wait. */
function bakeFeedPlan(bake) {
  const r = bake.recipeSnap;
  const need = r && loafCount(bake.loaves) ? scaleRecipe(r, bake.loaves, bakeScales(bake)).total.starter : (r?.starter || 100);
  return feedPlan(need, state.settings.starterKeep, ratioForFeed(bake.durs.feed));
}
export function autoName(startAt) { return `Bake, ${fmtDate(startAt)}`; }
function latestNote(notes) { return notes?.length ? notes[notes.length - 1].text : ''; }
function snippet(text, n = 90) { return text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text; }

/* ============================================================
   Share links
   ============================================================ */
function encodeBake(bake) {
  const json = JSON.stringify({ n: bake.name, s: bake.startAt, d: bake.durs, r: bake.respectSleep ? 1 : 0, k: bake.done,
    o: bake.overrides, u: bake.busy, f: bake.withFeed ? 1 : 0, l: bake.loaves, rc: bake.recipeSnap, sc: bake.scales, p: bake.plan, lt: bake.late });
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeBake(str) {
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/')))));
    return normalizeBake({ id: uid(), name: o.n || 'Shared bake', startAt: o.s, durs: o.d, respectSleep: !!o.r, done: o.k || {},
      overrides: o.o || {}, busy: o.u || [], withFeed: !!o.f, loaves: o.l || null, recipeSnap: o.rc || null,
      recipeId: o.rc?.id && recipeById(o.rc.id) ? o.rc.id : null, scales: o.sc || null, plan: o.p, late: o.lt || {}, createdAt: Date.now() });
  } catch { return null; }
}
async function shareBake(bake) {
  const url = `${location.href.split('#')[0]}#b=${encodeBake(bake)}`;
  if (navigator.share) {
    try { await navigator.share({ title: bake.name, text: `Sourdough: ${bake.name}`, url }); return; } catch { /* cancelled */ }
  }
  try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { prompt('Copy this link', url); }
}

/* ============================================================
   Bake page
   ============================================================ */
function recipeCard(bake) {
  const r = bake.recipeSnap;
  if (!r || !loafCount(bake.loaves)) return '';
  const rec = scaleRecipe(r, bake.loaves, bakeScales(bake));
  const t = rec.total;
  const same = rec.items.every(i => i.size === rec.items[0].size);
  const linked = recipeById(bake.recipeId);
  return h`
    <details class="card recipe" ${isFinished(bake) ? '' : 'open'}>
      <summary><h3>${esc(r.name)}</h3><span class="small muted">${esc(loavesText(bake.loaves))}</span></summary>
      <div class="recipe-grid">
        <span>Starter</span><strong>${grams(t.starter)}</strong>
        ${t.flours.map(f => h`<span>${esc(f.name)}</span><strong>${grams(f.g)}</strong>`).join('')}
        <span>Warm water</span><strong>${grams(t.water)}</strong>
        <span>Salt</span><strong>${grams(t.salt)}</strong>
        ${t.extras.map(x => h`<span>${esc(x.name)}</span><strong>${grams(x.g)}</strong>`).join('')}
      </div>
      <div class="small muted" style="margin-top:8px">
        ${same ? `About ${grams(rec.items[0].dough)} of dough per loaf.` :
          `Divide by weight: ${LOAF_SIZES.filter(z => bake.loaves[z]).map(z => {
            const one = rec.items.find(i => i.size === z);
            return `${bake.loaves[z] > 1 ? `${bake.loaves[z]} × ` : ''}${LOAF_LABEL[z].toLowerCase()} ${grams(one.dough)}`;
          }).join(', ')}.`}
        ${Math.round(rec.hydration * 100)}% hydration.
      </div>
      ${linked ? h`<button class="linkish small" data-act="open-recipe" style="margin-top:8px">Open recipe</button>` : ''}
    </details>`;
}

function outcomeCard(bake) {
  const devs = deviations(bake);
  return h`
    <div class="card outcome">
      <h3>How did it turn out?</h3>
      ${starPicker(bake.rating)}
      <div class="small muted" style="margin-top:14px">What ran differently</div>
      <div class="small" style="margin-top:2px">${devs.length ? esc(devs.map(d => d.text).join(' · ')) : 'Everything ran to plan.'}</div>
      <div style="margin-top:14px">${notesBlock(`bake-${bake.id}`, bake.notes, 'Crumb, rise, crust, flavour, what you would change next time…')}</div>
    </div>`;
}

export function renderBake(bake) {
  const now = Date.now();
  const settings = bakeSettings(bake);
  const tl = bakeTimeline(bake);
  const finished = isFinished(bake);
  const flags = finished ? [] : checkMoments(tl, settings, bakeCtx(bake, now));
  const hard = hardOnly(flags);
  const soft = flags.filter(m => m.level === 'soft');
  const ci = currentIndex(bake);
  const na = nextAction(bake, now);
  const starter = starterById(bake.starterId);
  const catchUp = finished ? [] : catchUpSteps(bake, now);
  const showCatchUp = catchUp.length && now - plannedDoneAt(catchUp[0]) > HOUR;
  const canUndo = (bake.history || []).length > 0 && ci > 0;

  // One "time between folds" control covers every fold gap that is still ahead.
  const ed = editableDurations(bake, tl, now);
  const gapIds = ed.folds.map(f => f.id);
  const intervalRow = gapIds.length ? tl.slice(ci).find(s => s.def.id.startsWith('fold'))?.def.id : null;
  const interval = gapIds.length ? Math.max(...gapIds.map(id => bake.durs[id])) : null;
  const overridden = attendMoments(tl).filter(m => bake.overrides[m.key] && !bake.done[m.step.def.id] && m.t > now);
  const plan = bake.withFeed ? (bake.feedDone || bakeFeedPlan(bake)) : null;

  const noteFor = (s, future) => {
    if (s.def.feed) {
      const lines = [`${bake.done.feed ? 'Fed' : 'Feed'} ${grams(plan.starter)} starter with ${grams(plan.flour)} flour and ${grams(plan.water)} water (${ratioText(plan.r)}). Makes ${grams(plan.makes)}: ${grams(plan.need)} for the dough, ${grams(plan.keep)} to keep.`];
      if (!bake.done.feed) lines.push(s.def.note);
      if (!bake.done.feed && starter?.fridge) lines.push(`${starter.name} is in the fridge. Take it out an hour or so before feeding.`);
      return lines.join(' ');
    }
    return future ? s.def.note : '';
  };

  let nowPlaced = false;
  const stepsHtml = tl.map((s, i) => {
    const id = s.def.id;
    const done = i < ci;
    const stepFlags = flags.filter(m => m.step.def.id === id);
    const stepOver = overridden.filter(m => m.step.def.id === id);
    const cls = ['step', done ? 'done' : '', i === ci ? 'current' : '',
      stepFlags.some(m => m.level === 'hard') ? 'conflict' : stepFlags.length ? 'soft' : ''].join(' ');
    let nowline = '';
    if (!finished && !nowPlaced && s.start > now) { nowline = h`<div class="nowline"><span>now</span></div>`; nowPlaced = true; }
    const future = i >= ci;
    const isGap = FOLD_GAPS.includes(id);
    const min = s.def.flex ? settings.coldMin : s.def.min;
    const max = s.def.flex ? settings.coldMax : s.def.max;
    const note = noteFor(s, future);
    const doneAt = plannedDoneAt(s);
    const late = bake.late?.[id];
    return nowline + h`
      <div class="${cls}" data-step="${id}">
        <div class="row spread">
          <div>
            <div class="when">${done ? `Done ${fmtWhen(doneAt, now)}` : fmtWhen(s.start, now)}</div>
            <div class="name">${esc(s.def.name)}</div>
          </div>
          <div class="dur" id="dur-${id}">${done && isActionStep(s.def) ? '' : fmtDur(s.dur)}</div>
        </div>
        ${done && late != null && Math.abs(late) >= 10 ? h`
          <div class="small late-note">Planned ${fmtWhen(doneAt - late * MIN, now)} · ${fmtLate(late)}</div>` : ''}
        ${note ? h`<div class="small muted">${esc(note)}</div>` : ''}
        ${id === intervalRow ? h`
          <div class="controls">
            <div class="small row spread"><span class="muted">Time between folds</span><span id="interval-val">${interval} min</span></div>
            <input type="range" min="15" max="45" step="5" value="${interval}" data-interval aria-label="Time between folds">
          </div>` : ''}
        ${future && !isGap ? h`
          <div class="controls">
            ${id === 'fold4' ? h`<div class="small muted">Rest after the last fold, before bulk</div>` : ''}
            ${id === 'feed' ? h`<div class="small muted">Wait until mixing (sets the feed ratio)</div>` : ''}
            <input type="range" min="${min}" max="${max}" step="${s.def.inc}" value="${s.dur}" data-slider="${id}" aria-label="${esc(s.def.name)} duration">
          </div>` : ''}
        ${stepFlags.map(m => h`
          <div class="flag ${m.level}">
            <span>${esc(flagText(m))} (${fmtTime(m.t)})</span>
            ${m.level === 'hard' ? h`<button data-override="${m.key}">${m.reason === 'out' ? "I'll do it anyway" : "I'll be up"}</button>` : ''}
          </div>`).join('')}
        ${stepOver.map(m => h`
          <div class="flag ok"><span>You'll handle ${esc(m.label.toLowerCase())} (${fmtTime(m.t)})</span><button class="quiet" data-unoverride="${m.key}">Undo</button></div>`).join('')}
        ${future ? h`
          <div class="actions">
            ${i === ci ? h`<button class="primary" data-done="${id}">${s.def.feed ? 'Fed it now' : 'Done now'}</button>` : ''}
            ${s.def.attend !== 'none' ? h`<button data-alarm="${id}">${bell()} Alarm</button>` : ''}
            ${s.def.attend === 'both' ? h`<button data-alarm-end="${id}">${bell()} End alarm</button>` : ''}
          </div>` : ''}
        ${done && i === ci - 1 && canUndo ? h`<div class="actions"><button class="quiet small" data-undo>Undo this step</button></div>` : ''}
      </div>`;
  }).join('');

  const outs = (bake.busy || []).filter(b => b.to > now);
  const remaining = tl.length - ci;
  keepScroll(() => {
    app.innerHTML = h`
      <div class="topbar">
        <div class="left">
          <button class="icon quiet" aria-label="Back" data-act="back">${chevron()}</button>
          <h1>${esc(bake.name)}</h1>
        </div>
        <div class="row">
          ${finished ? '' : h`<button class="icon quiet" aria-label="Settings" data-act="settings">${gear()}</button>`}
          <button class="icon quiet" aria-label="Share" data-act="share">${shareIcon()}</button>
        </div>
      </div>
      <div class="hero">
        <div class="muted">${finished ? 'Finished' : 'Ready to eat'}</div>
        <div class="ready">${fmtWhen(readyAt(tl), now)}</div>
        <div class="muted small">${[bake.recipeSnap?.name, bake.loaves && loafCount(bake.loaves) ? loavesText(bake.loaves) : '', starter?.name].filter(Boolean).map(esc).join(' · ')}</div>
        ${finished ? '' : h`
        <div class="next">
          <div class="muted small">Next</div>
          <div class="row spread">
            <span class="serif">${esc(na.label)}</span>
            <span class="${na.t - now < 0 ? 'warn' : 'accent'}">${fmtCountdown(na.t - now)}</span>
          </div>
        </div>`}
        ${outs.length ? h`<div class="row wrap" style="margin-top:12px">${outs.map(o => h`
          <span class="chip">Out ${fmtWhen(o.from, now)}–${sameDay(o.from, o.to) ? fmtTime(o.to) : fmtWhen(o.to, now)}
            <button class="quiet" aria-label="Remove" data-unbusy="${o.from}">✕</button></span>`).join('')}</div>` : ''}
      </div>
      ${showCatchUp ? h`
        <div class="notice soft">
          <div><strong>${catchUp.length === remaining ? (remaining === 1 ? 'The last step' : `The last ${remaining} steps`) : `${catchUp.length} step${catchUp.length > 1 ? 's' : ''}`}</strong>
            should be done by now: ${esc(catchUp.map(s => s.def.name.toLowerCase()).join(', '))}.</div>
          <button class="primary" data-act="catch-up" style="margin-top:10px">Mark ${catchUp.length === remaining ? 'the rest' : catchUp.length === 1 ? 'it' : 'them'} done as planned</button>
          <div class="small muted" style="margin-top:8px">If something ran late, tap Done on that step instead.</div>
        </div>` : ''}
      ${!showCatchUp && hard.length ? h`
        <div class="notice bad">
          <div><strong>${hard.length} step${hard.length > 1 ? 's' : ''}</strong> ${hard.length > 1 ? 'clash' : 'clashes'} with sleep or time out.</div>
          <button class="primary" data-act="fix" style="margin-top:10px">Fix it</button>
        </div>` : !showCatchUp && soft.length ? h`
        <div class="notice soft">
          <div>${soft.map(m => esc(flagText(m))).join('. ')}. That's within your leeway.</div>
          <button data-act="fix-strict" style="margin-top:10px">Tighten anyway</button>
        </div>` : ''}
      ${finished ? outcomeCard(bake) : ''}
      ${recipeCard(bake)}
      <div class="timeline">${stepsHtml}</div>
      ${finished ? '' : h`
      <div class="card" style="margin-top:18px">
        <h3>Notes</h3>
        <div style="margin-top:10px">${notesBlock(`bake-${bake.id}`, bake.notes, 'How the dough feels, room temperature, anything worth remembering…')}</div>
      </div>
      <div class="stack" style="margin-top:22px">
        <button class="wide" data-act="out">I'm out for a while…</button>
        <button class="wide" data-act="calendar">${cal()} Add every step to calendar</button>
        <label class="field" style="margin:0">${bake.withFeed ? 'Starter fed at' : 'Started at'}
          <input type="datetime-local" value="${toLocalInput(bake.startAt)}" data-act="start" style="margin-top:4px">
        </label>
        <label class="switch"><span>Avoid sleep window (${fmtSleep()})</span><input type="checkbox" ${bake.respectSleep ? 'checked' : ''} data-act="sleep"></label>
      </div>`}
      <div class="stack" style="margin-top:12px">
        <button class="quiet" data-act="delete" style="color:var(--warn)">Delete this bake</button>
      </div>
      ${finished ? '' : alarmHelp()}
    `;
  });

  const commit = () => { save(); keepScroll(() => renderBake(bake)); };
  on(app, '[data-act="back"]', goBack);
  on(app, '[data-act="settings"]', openSettings);
  on(app, '[data-act="share"]', () => shareBake(bake));
  on(app, '[data-act="fix"]', () => openFixSheet(bake, false));
  on(app, '[data-act="fix-strict"]', () => openFixSheet(bake, true));
  on(app, '[data-act="out"]', () => openOutSheet(bake));
  on(app, '[data-act="catch-up"]', () => catchUpBake(bake));
  on(app, '[data-act="open-recipe"]', () => goFrom({ screen: 'recipe', id: bake.recipeId }));
  on(app, '[data-act="calendar"]', () => downloadIcs(bake, attendMoments(tl).filter(m => m.t > now), `${slug(bake.name)}.ics`));
  on(app, '[data-undo]', () => undoLastStep(bake));
  on(app, '[data-act="delete"]', () => {
    if (confirm(`Delete "${bake.name}"?`)) { state.bakes = state.bakes.filter(b => b.id !== bake.id); save(); goBack(); }
  });
  const startInput = app.querySelector('[data-act="start"]');
  if (startInput) startInput.onchange = e => { const t = new Date(e.target.value).getTime(); if (!isNaN(t)) { bake.startAt = t; commit(); } };
  const sleepInput = app.querySelector('[data-act="sleep"]');
  if (sleepInput) sleepInput.onchange = e => { bake.respectSleep = e.target.checked; commit(); };
  app.querySelectorAll('[data-override]').forEach(b => b.onclick = () => { bake.overrides[b.dataset.override] = true; commit(); });
  app.querySelectorAll('[data-unoverride]').forEach(b => b.onclick = () => { delete bake.overrides[b.dataset.unoverride]; commit(); });
  app.querySelectorAll('[data-unbusy]').forEach(b => b.onclick = () => { bake.busy = bake.busy.filter(o => String(o.from) !== b.dataset.unbusy); commit(); });
  app.querySelectorAll('[data-slider]').forEach(inp => {
    const id = inp.dataset.slider;
    inp.oninput = () => { document.getElementById(`dur-${id}`).textContent = fmtDur(Number(inp.value)); };
    inp.onchange = () => { bake.durs[id] = Number(inp.value); commit(); };
  });
  const iv = app.querySelector('[data-interval]');
  if (iv) {
    iv.oninput = () => { document.getElementById('interval-val').textContent = `${iv.value} min`; };
    iv.onchange = () => { ed.folds.forEach(f => { bake.durs[f.id] = Math.max(f.floor, Number(iv.value)); }); commit(); };
  }
  app.querySelectorAll('[data-done]').forEach(btn => btn.onclick = () => onDone(bake, btn.dataset.done));
  app.querySelectorAll('[data-alarm],[data-alarm-end]').forEach(btn => btn.onclick = () => {
    const end = 'alarmEnd' in btn.dataset;
    const s = stepOf(tl, end ? btn.dataset.alarmEnd : btn.dataset.alarm);
    openAlarmSheet(bake, end ? s.end : s.start, end ? `Finish ${s.def.name.toLowerCase()}` : s.def.name);
  });
  wireNotes(app, `bake-${bake.id}`, bake.notes, commit);
  wireStars(app, () => bake.rating, n => { bake.rating = n; commit(); });
}

/* ---------- Done, late and catch-up ---------- */

/** Log the bake's starter feed on its starter at `at`. Returns the feed time if logged. */
function recordBakeFeed(bake, at) {
  const plan = bakeFeedPlan(bake);
  bake.feedDone = plan;
  const st = starterById(bake.starterId);
  if (!st || st.retiredAt) return null;
  const last = lastFeed(st);
  if (last && last.t > at) return null; // a later feed is already logged; don't reorder its history
  if (st.fridge) setFridge(st, false);
  logFeed(st, { t: at, r: plan.r, amounts: plan, note: `For ${bake.name}` });
  return at;
}

function doneMessage(step, late, isLast) {
  if (Math.abs(late) < 5) return `${step.def.name}: done`;
  const moved = isLast ? '' : ` Later steps moved ${fmtDur(late)} ${late > 0 ? 'later' : 'earlier'}.`;
  if (isActionStep(step.def)) return `${step.def.name} done ${fmtLate(late)}.${moved}`;
  return `${step.def.name} ${late > 0 ? `ran ${fmtDur(late)} long` : `finished ${fmtDur(late)} early`}.${moved}`;
}

/** Mark one step done at `at`, with an undo point. */
function applyDone(bake, id, at) {
  const snap = pushHistory(bake);
  const tl = bakeTimeline(bake);
  const step = stepOf(tl, id);
  const isLast = tl[tl.length - 1].def.id === id;
  if (id === 'feed') snap.starterFeedT = recordBakeFeed(bake, at);
  const late = completeStep(bake, tl, id, at);
  save();
  if (isFinished(bake)) { window.scrollTo(0, 0); renderBake(bake); toast('Bake finished. How did it turn out?', 3500); return; }
  keepScroll(() => renderBake(bake));
  toast(doneMessage(step, late, isLast), Math.abs(late) >= 5 ? 4000 : 2000);
}

function onDone(bake, id) {
  const now = Date.now();
  const s = stepOf(bakeTimeline(bake), id);
  // Well past the plan, it may have happened on time and only be logged now, so ask.
  if (now - plannedDoneAt(s) > HOUR) openWhenDoneSheet(bake, id);
  else applyDone(bake, id, now);
}

function openWhenDoneSheet(bake, id) {
  const now = Date.now();
  const tl = bakeTimeline(bake);
  const i = tl.findIndex(s => s.def.id === id);
  const s = tl[i];
  const planned = plannedDoneAt(s);
  const isLast = i === tl.length - 1;
  const earliest = i > 0 ? plannedDoneAt(tl[i - 1]) : -Infinity;
  const effect = at => {
    const b2 = clone(bake);
    const late = completeStep(b2, bakeTimeline(b2), id, at);
    const ready = readyAt(bakeTimeline(b2));
    if (Math.abs(late) < 5) return 'On time. Nothing else moves.';
    return `${fmtLate(late)[0].toUpperCase()}${fmtLate(late).slice(1)}.${isLast ? '' : ` Later steps move ${fmtDur(late)} ${late > 0 ? 'later' : 'earlier'}; ready ${fmtWhen(ready, now)}.`}`;
  };
  let pickAt = planned;
  const draw = () => {
    openSheet(h`
      <h2>${esc(s.def.doneQ || `When was ${s.def.name.toLowerCase()} done?`)}</h2>
      <p class="muted small" style="margin-top:6px">It was planned for ${fmtWhen(planned, now)}.</p>
      <div class="stack">
        <button class="choice" data-when="planned">
          <span class="row spread"><strong>At the planned time</strong><span>${fmtWhen(planned, now)}</span></span>
          <span class="small muted">I just forgot to tap it. Nothing else moves.</span>
        </button>
        <button class="choice" data-when="now">
          <span class="row spread"><strong>Just now</strong><span>${fmtWhen(now, now)}</span></span>
          <span class="small muted">${esc(effect(now))}</span>
        </button>
        <div class="choice static">
          <strong>Pick a time</strong>
          <input type="datetime-local" value="${toLocalInput(pickAt)}" data-pick style="margin-top:8px" aria-label="When it was done">
          <div class="small muted" data-pick-effect style="margin-top:6px">${esc(effect(pickAt))}</div>
          <button class="primary wide" data-when="pick" style="margin-top:10px">Use this time</button>
        </div>
        <button class="quiet" data-close>Cancel</button>
      </div>
    `);
    const pick = sheet.querySelector('[data-pick]');
    pick.onchange = () => {
      const t = new Date(pick.value).getTime();
      if (isNaN(t)) return;
      pickAt = t;
      sheet.querySelector('[data-pick-effect]').textContent = pickAt > Date.now() + 5 * MIN
        ? 'That’s in the future.' : pickAt < earliest ? `That’s before the previous step was done (${fmtWhen(earliest, now)}).` : effect(pickAt);
    };
    on(sheet, '[data-close]', closeSheet);
    sheet.querySelectorAll('[data-when]').forEach(b => b.onclick = () => {
      const at = { planned, now: Date.now(), pick: pickAt }[b.dataset.when];
      if (at > Date.now() + 5 * MIN) { toast('That time is in the future'); return; }
      if (at < earliest) { toast('That’s before the previous step was done'); return; }
      closeSheet(); applyDone(bake, id, at);
    });
  };
  draw();
}

/** Mark every step whose planned time has passed as done on time, as one undoable change. */
function catchUpBake(bake) {
  const steps = catchUpSteps(bake, Date.now());
  if (!steps.length) return;
  const snap = pushHistory(bake);
  for (const s of steps) {
    const tl = bakeTimeline(bake);
    const step = stepOf(tl, s.def.id);
    const at = plannedDoneAt(step);
    if (s.def.id === 'feed') snap.starterFeedT = recordBakeFeed(bake, at);
    completeStep(bake, tl, s.def.id, at);
  }
  save();
  window.scrollTo(0, 0);
  renderBake(bake);
  toast(isFinished(bake) ? 'Marked done. How did it turn out?' : `${steps.length} step${steps.length > 1 ? 's' : ''} marked done`, 3500);
}

function undoLastStep(bake) {
  const snap = popHistory(bake);
  if (!snap) return;
  if (snap.starterFeedT) {
    const st = starterById(bake.starterId);
    if (st && lastFeed(st)?.t === snap.starterFeedT) undoLastFeed(st);
  }
  save(); keepScroll(() => renderBake(bake)); toast('Undone');
}

/* ---------- Fix it and time out ---------- */

/** Replan options, plus "I'll be up" for each clash. */
function openFixSheet(bake, strict) {
  const now = Date.now();
  const settings = bakeSettings(bake);
  const flags = checkMoments(bakeTimeline(bake), settings, bakeCtx(bake, now)).filter(m => strict || m.level === 'hard');
  const options = fixOptions(bake, settings, now, { strict });
  const keyTimes = o => {
    const rows = [];
    const nextFolds = o.timeline.filter(s => s.def.id.startsWith('fold') && !bake.done[s.def.id] && s.start > now);
    if (o.kind === 'folds' || o.kind === 'both') rows.push(['Folds', nextFolds.map(s => fmtTime(s.start)).join(', ')]);
    if (!bake.done.shape) rows.push(['Shape', fmtWhen(stepOf(o.timeline, 'shape').start, now)]);
    rows.push(['Bake', fmtWhen(stepOf(o.timeline, 'bake').start, now)], ['Ready', fmtWhen(readyAt(o.timeline), now)]);
    return rows.map(([k, v]) => h`<div class="row spread small"><span class="muted">${k}</span><span>${v}</span></div>`).join('');
  };
  openSheet(h`
    <h2>Fix it</h2>
    <p class="muted small" style="margin-top:6px">${flags.map(m => esc(flagText(m)) + ` (${fmtTime(m.t)})`).join('. ')}.</p>
    <div class="stack">
      ${options.length ? options.map((o, i) => h`
        <div class="card" style="margin:0">
          <h3>${esc(o.title)}</h3>
          <div class="accent small" style="margin:4px 0 8px">${esc(o.changes.join(' · '))}</div>
          ${keyTimes(o)}
          ${o.soft.length ? h`<div class="small soft-text" style="margin-top:6px">Still inside grace: ${esc(o.soft.map(m => m.label).join(', '))}</div>` : ''}
          <button class="primary wide" data-use="${i}" style="margin-top:10px">Use this</button>
        </div>`).join('') : h`
        <div class="notice">Nothing within your limits clears this. You can widen the limits in Settings, or handle it yourself below.</div>`}
      ${flags.map(m => h`
        <button data-up="${m.key}">${m.reason === 'out' ? "I'll do it anyway" : "I'll be up"}: ${esc(m.label.toLowerCase())} at ${fmtTime(m.t)}</button>`).join('')}
      <button class="quiet" data-close>Cancel</button>
    </div>
  `);
  sheet.querySelectorAll('[data-use]').forEach(b => b.onclick = () => {
    const o = options[Number(b.dataset.use)];
    bake.durs = { ...o.durs }; save(); closeSheet(); renderBake(bake); toast(o.changes.join(', '));
  });
  sheet.querySelectorAll('[data-up]').forEach(b => b.onclick = () => {
    bake.overrides[b.dataset.up] = true; save(); b.remove(); renderBake(bake);
    if (!sheet.querySelector('[data-up]')) closeSheet();
  });
  on(sheet, '[data-close]', closeSheet);
}

function openOutSheet(bake) {
  const from = roundTo(Date.now() + 30 * MIN, 15);
  openSheet(h`
    <h2>I'm out for a while</h2>
    <p class="muted small" style="margin-top:6px">Hands-on steps in this time get flagged, and Fix it will fit them around it.</p>
    <div class="stack">
      <label class="field">Leaving at<input type="datetime-local" value="${toLocalInput(from)}" data-from style="margin-top:4px"></label>
      <label class="field">Back at<input type="datetime-local" value="${toLocalInput(from + 3 * HOUR)}" data-to style="margin-top:4px"></label>
      <button class="primary wide" data-save>Add</button>
      <button class="quiet" data-close>Cancel</button>
    </div>
  `);
  on(sheet, '[data-close]', closeSheet);
  on(sheet, '[data-save]', () => {
    const f = new Date(sheet.querySelector('[data-from]').value).getTime();
    const t = new Date(sheet.querySelector('[data-to]').value).getTime();
    if (isNaN(f) || isNaN(t) || t <= f) { toast('Back time must be after leaving time'); return; }
    bake.busy = [...(bake.busy || []), { from: f, to: t }].sort((a, b) => a.from - b.from);
    save(); closeSheet(); renderBake(bake);
    if (hardOnly(checkMoments(bakeTimeline(bake), bakeSettings(bake), bakeCtx(bake))).length) openFixSheet(bake, false);
  });
}

/* ============================================================
   New bake
   ============================================================ */
export function openNewBake({ recipeId } = {}) {
  const now = Date.now();
  const recipes = sortRecipes(state.recipes);
  const starters = activeStarters();
  const mature = starters.filter(s => s.phase === 'mature');
  const draft = {
    mode: 'now', ready: roundTo(now + 2 * DAY, 30), respectSleep: true, name: '',
    loaves: { small: 0, medium: 1, large: 0 }, withFeed: true,
    recipeId: recipeId || recipes[0]?.id || null,
    starterId: (mature[0] || starters[0])?.id || null,
  };
  const draw = () => {
    const recipe = recipeById(draft.recipeId);
    const s = effectiveSettings(state.settings, recipe);
    const wf = draft.withFeed;
    let result, notice = '';
    if (draft.mode === 'now') {
      result = solveForward(now, s, draft.respectSleep, wf);
      if (!result.ok) {
        const alt = nextGoodStart(now, s, draft.respectSleep, wf);
        const first = result.conflicts[0];
        notice = h`<div class="notice bad">Starting now puts <strong>${esc(first.label)}</strong> at ${fmtWhen(first.t, now)}, while you're asleep.
          ${alt ? h`<div style="margin-top:8px">Earliest good start is <strong>${fmtWhen(alt.startAt, now)}</strong>. <button data-alt="${alt.startAt}" style="margin-top:8px">Plan from then</button></div>` : ''}</div>`;
      }
    } else {
      result = solveBackward(draft.ready, s, draft.respectSleep, wf);
      if (!result.ok) {
        const nb = nearbyReadyTimes(draft.ready, s, draft.respectSleep, wf);
        const first = result.conflicts[0];
        notice = h`<div class="notice bad">Being ready then puts <strong>${esc(first.label)}</strong> at ${fmtWhen(first.t, now)}, while you're asleep.
          <div class="row wrap" style="margin-top:8px">
            ${nb.earlier ? h`<button data-ready="${nb.earlier}">Ready ${fmtWhen(nb.earlier, now)}</button>` : ''}
            ${nb.later ? h`<button data-ready="${nb.later}">Ready ${fmtWhen(nb.later, now)}</button>` : ''}
          </div></div>`;
      }
    }
    const tl = result.timeline;
    const softs = checkMoments(tl, s, { respectSleep: draft.respectSleep }).filter(m => m.level === 'soft');
    if (softs.length) notice += h`<div class="notice soft">${softs.map(m => `${esc(m.label)} at ${fmtTime(m.t)}`).join(', ')}: inside your ${s.graceMins} min grace.</div>`;
    if (result.startAt < now - 5 * MIN) notice += h`<div class="notice bad">That start time is already in the past (${fmtWhen(result.startAt, now)}). Pick a later ready time.</div>`;

    const scales = state.settings.loafScale;
    const count = loafCount(draft.loaves);
    const rec = recipe && count ? scaleRecipe(recipe, draft.loaves, scales) : null;
    const plan = wf ? feedPlan(rec ? rec.total.starter : (recipe?.starter || 100), state.settings.starterKeep, ratioForFeed(result.durs.feed)) : null;
    const chosen = starterById(draft.starterId);
    const own = recipe ? TIMING_FIELDS.filter(f => recipe.timings?.[f.key] > 0) : [];

    openSheet(h`
      <h2>New bake</h2>
      <div class="stack" style="margin-top:14px">
        <h3>Recipe</h3>
        ${recipes.length ? h`
          <select data-recipe aria-label="Recipe">
            ${recipes.map(r => h`<option value="${r.id}" ${r.id === draft.recipeId ? 'selected' : ''}>${r.pinned ? '📌 ' : ''}${esc(r.name)}</option>`).join('')}
            <option value="" ${!draft.recipeId ? 'selected' : ''}>No recipe, timer only</option>
          </select>` : h`<div class="small muted">No recipes yet. You can add them from the home screen.</div>`}
        ${recipe ? h`<div class="small muted">${esc(recipeLine(recipe))}</div>` : ''}
        ${own.length ? h`<div class="small accent">Its own timings: ${esc(own.map(f => `${f.label.toLowerCase()} ${fmtDur(recipe.timings[f.key])}`).join(', '))}</div>` : ''}

        ${recipe ? h`
          <h3 style="margin-top:6px">Loaves</h3>
          ${LOAF_SIZES.map(size => h`
            <div class="stepper-row">
              <span>${LOAF_LABEL[size]} <span class="muted small">${grams(totalFlour(recipe) * scales[size])} flour</span></span>
              <div class="stepper">
                <button class="icon" aria-label="Fewer ${size}" data-less="${size}">−</button>
                <span aria-live="polite">${draft.loaves[size]}</span>
                <button class="icon" aria-label="More ${size}" data-more="${size}">+</button>
              </div>
            </div>`).join('')}
          ${rec ? h`<div class="small muted">${grams(rec.total.starter)} starter, ${grams(rec.total.flour)} flour, ${grams(rec.total.water)} water, ${grams(rec.total.salt)} salt.</div>` : ''}` : ''}

        <h3 style="margin-top:6px">Plan</h3>
        <label class="switch"><span>Feed the starter first</span><input type="checkbox" ${wf ? 'checked' : ''} data-feed></label>
        ${wf && starters.length ? h`
          <label class="field">Starter
            <select data-starter style="margin-top:4px">
              <option value="">None tracked</option>
              ${starters.map(st => h`<option value="${st.id}" ${st.id === draft.starterId ? 'selected' : ''}>${esc(st.name)} (${esc(starterPhaseText(st))})</option>`).join('')}
            </select>
          </label>` : ''}
        ${wf && chosen && chosen.phase !== 'mature' ? h`<div class="notice soft">${esc(chosen.name)} is still ${esc(PHASE_LABEL[chosen.phase].toLowerCase())}. It may not raise a loaf well yet.</div>` : ''}
        <div class="seg" role="group" aria-label="Planning mode">
          <button data-mode="now" aria-pressed="${draft.mode === 'now'}">${wf ? 'Feed now' : 'Start now'}</button>
          <button data-mode="ready" aria-pressed="${draft.mode === 'ready'}">Ready by</button>
        </div>
        ${draft.mode === 'ready' ? h`<label class="field">Ready to eat at<input type="datetime-local" value="${toLocalInput(draft.ready)}" data-ready-input style="margin-top:4px"></label>` : ''}
        <label class="field">Name (optional)<input type="text" placeholder="${esc(autoName(result.startAt))}" value="${esc(draft.name)}" data-name style="margin-top:4px"></label>
        <label class="switch"><span>Avoid sleep window (${fmtSleep()})</span><input type="checkbox" ${draft.respectSleep ? 'checked' : ''} data-sleep></label>
        ${notice}
        <div class="card" style="margin:0">
          ${wf ? h`<div class="row spread"><span class="muted">Feed starter <span class="small">${ratioText(plan.r)}</span></span><span class="serif">${fmtWhen(stepOf(tl, 'feed').start, now)}</span></div>` : ''}
          <div class="row spread"><span class="muted">Mix</span><span class="serif">${fmtWhen(stepOf(tl, 'mix').start, now)}</span></div>
          <div class="row spread"><span class="muted">Folds</span><span class="serif">${fmtTime(stepOf(tl, 'fold1').start)} to ${fmtTime(stepOf(tl, 'fold4').start)}</span></div>
          <div class="row spread"><span class="muted">Shape, into fridge</span><span class="serif">${fmtWhen(stepOf(tl, 'shape').start, now)}</span></div>
          <div class="row spread"><span class="muted">Cold proof</span><span class="serif">${fmtDur(result.durs.cold)}</span></div>
          <div class="row spread"><span class="muted">Bake</span><span class="serif">${fmtWhen(stepOf(tl, 'bake').start, now)}</span></div>
          <div class="row spread"><span class="muted">Ready</span><span class="serif accent">${fmtWhen(readyAt(tl), now)}</span></div>
          ${wf ? h`<div class="small muted" style="margin-top:8px">Feed ${grams(plan.starter)} starter with ${grams(plan.flour)} flour and ${grams(plan.water)} water.</div>` : ''}
        </div>
        <button class="primary wide" data-save>${result.ok ? 'Save bake' : 'Save anyway'}</button>
      </div>
    `);
    const rs = sheet.querySelector('[data-recipe]');
    if (rs) rs.onchange = e => { draft.recipeId = e.target.value || null; draw(); };
    sheet.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { draft.mode = b.dataset.mode; draw(); });
    sheet.querySelectorAll('[data-less]').forEach(b => b.onclick = () => { const k = b.dataset.less; draft.loaves[k] = Math.max(0, draft.loaves[k] - 1); draw(); });
    sheet.querySelectorAll('[data-more]').forEach(b => b.onclick = () => { const k = b.dataset.more; draft.loaves[k] = Math.min(9, draft.loaves[k] + 1); draw(); });
    const ri = sheet.querySelector('[data-ready-input]');
    if (ri) ri.onchange = e => { const t = new Date(e.target.value).getTime(); if (!isNaN(t)) { draft.ready = t; draw(); } };
    sheet.querySelector('[data-name]').oninput = e => { draft.name = e.target.value; };
    sheet.querySelector('[data-sleep]').onchange = e => { draft.respectSleep = e.target.checked; draw(); };
    sheet.querySelector('[data-feed]').onchange = e => { draft.withFeed = e.target.checked; draw(); };
    const sel = sheet.querySelector('[data-starter]');
    if (sel) sel.onchange = e => { draft.starterId = e.target.value || null; draw(); };
    sheet.querySelectorAll('[data-ready]').forEach(b => b.onclick = () => { draft.ready = Number(b.dataset.ready); draw(); });
    sheet.querySelectorAll('[data-alt]').forEach(b => b.onclick = () => commit(solveForward(Number(b.dataset.alt), s, draft.respectSleep, draft.withFeed)));
    on(sheet, '[data-save]', () => commit(result));
    function commit(r) {
      const bake = normalizeBake({
        id: uid(), name: draft.name.trim() || autoName(r.startAt), startAt: r.startAt, durs: { ...r.durs }, plan: { ...r.durs },
        respectSleep: draft.respectSleep, withFeed: draft.withFeed,
        loaves: recipe && loafCount(draft.loaves) ? { ...draft.loaves } : null,
        recipeId: recipe?.id || null, recipeSnap: recipe ? recipeSnapshot(recipe) : null, scales: { ...state.settings.loafScale },
        starterId: draft.withFeed ? draft.starterId : null, createdAt: Date.now(),
      });
      if (recipe) recipe.lastUsedAt = Date.now();
      state.bakes.push(bake); save(); closeSheet(); go({ screen: 'bake', id: bake.id });
    }
  };
  draw();
}

/* ============================================================
   Lists
   ============================================================ */
/** Card for a finished bake in a list. */
export function pastBakeCard(b) {
  const note = latestNote(b.notes);
  return h`
    <div class="card tap" data-open-bake="${b.id}" role="button" tabindex="0">
      <div class="row spread"><h3>${esc(b.name)}</h3>${starsHtml(b.rating)}</div>
      <div class="small muted">${fmtDate(readyAt(bakeTimeline(b)))}${b.recipeSnap ? ` · ${esc(b.recipeSnap.name)}` : ''}${b.loaves && loafCount(b.loaves) ? ` · ${esc(loavesText(b.loaves))}` : ''}</div>
      ${note ? h`<div class="small" style="margin-top:6px">${esc(snippet(note))}</div>` : ''}
    </div>`;
}
/** Card for a bake in progress. */
export function activeBakeCard(b, now = Date.now()) {
  const na = nextAction(b, now);
  const tl = bakeTimeline(b);
  const hard = hardOnly(checkMoments(tl, bakeSettings(b), bakeCtx(b, now)));
  return h`
    <div class="card tap" data-open-bake="${b.id}" role="button" tabindex="0">
      <div class="row spread"><h3>${esc(b.name)}</h3><span class="small muted">Ready ${fmtWhen(readyAt(tl), now)}</span></div>
      ${b.recipeSnap || (b.loaves && loafCount(b.loaves)) ? h`<div class="small muted">${[b.recipeSnap?.name, b.loaves && loafCount(b.loaves) ? loavesText(b.loaves) : ''].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
      <div style="margin-top:8px" class="row spread">
        <span class="serif" style="font-size:19px">${esc(na.label)}</span>
        <span class="${na.t - now < 0 ? 'warn' : 'accent'}">${fmtCountdown(na.t - now)}</span>
      </div>
      ${hard.length ? h`<div class="small warn" style="margin-top:6px">${hard.length} step${hard.length > 1 ? 's' : ''} clash with sleep or time out. Tap to fix.</div>` : ''}
    </div>`;
}

export function renderPastBakes() {
  const list = state.bakes.filter(isFinished).sort((a, b) => readyAt(bakeTimeline(b)) - readyAt(bakeTimeline(a)));
  app.innerHTML = h`
    <div class="topbar"><div class="left">
      <button class="icon quiet" aria-label="Back" data-act="back">${chevron()}</button><h1>Past bakes</h1>
    </div></div>
    ${list.length ? list.map(pastBakeCard).join('') : h`<p class="muted">Finished bakes land here, with their notes and rating.</p>`}
  `;
  on(app, '[data-act="back"]', goBack);
  tapOpen(app, '[data-open-bake]', el => goFrom({ screen: 'bake', id: el.dataset.openBake }));
}
