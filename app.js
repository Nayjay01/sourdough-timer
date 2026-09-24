// UI: state, storage, screens and sheets. Scheduling and starter logic live in schedule.js and starter.js.
import {
  MIN, HOUR, DAY, fmtTime, fmtWhen, fmtDate, fmtDur, fmtCountdown, fmtAgo, toLocalInput, roundTo,
  grams, ratioText, h, esc, slug, uid, sameDay,
} from './format.js';
import {
  ALL_DEFS, FOLD_GAPS, DEFAULT_SETTINGS, LOAF_SIZES, LOAF_LABEL, PEAK_HOURS, BAKE_FEED_RATIOS,
  recipeFor, loafCount, ratioForFeed, feedPlan, bakeTimeline, stepOf, readyAt, attendMoments, checkMoments,
  hardOnly, bakeCtx, solveForward, solveBackward, nextGoodStart, nearbyReadyTimes, markDone, currentIndex,
  nextAction, editableDurations, fixOptions,
} from './schedule.js';
import {
  LADDERS, DOUBLINGS_PER_STAGE, PHASE_LABEL, ALIVE_SIGNS, HUNGRY_SIGNS, PEAK_SIGNS, newStarter, normalizeStarter,
  lastFeed, dayNumber, doublingsAt, stageIndex, currentRatio, feedAmounts, logFeed, undoLastFeed,
  startStrengthening, setFridge, statusOf, createGuidance,
} from './starter.js';
import { GUIDE, GUIDE_GROUPS } from './guide.js';

/* ============================================================
   State and storage
   ============================================================ */
const LS_KEY = 'sourdough.v1';
const state = load();

function mergeSettings(saved = {}) {
  return {
    ...DEFAULT_SETTINGS, ...saved,
    durs: { ...DEFAULT_SETTINGS.durs, ...(saved.durs || {}) },
    recipe: { ...DEFAULT_SETTINGS.recipe, ...(saved.recipe || {}) },
    loafFlour: { ...DEFAULT_SETTINGS.loafFlour, ...(saved.loafFlour || {}) },
  };
}
/** Fill in fields added after a bake was first saved. */
function normalizeBake(b) {
  return { overrides: {}, busy: [], done: {}, withFeed: false, loaves: null, starterId: null, ...b, durs: { ...DEFAULT_SETTINGS.durs, ...(b.durs || {}) } };
}
function load() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { s = {}; }
  return {
    bakes: Array.isArray(s.bakes) ? s.bakes.map(normalizeBake) : [],
    starters: Array.isArray(s.starters) ? s.starters.map(normalizeStarter) : [],
    settings: mergeSettings(s.settings),
    view: { screen: 'home' },
  };
}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ bakes: state.bakes, starters: state.starters, settings: state.settings })); }
  catch { toast('Could not save on this device'); }
}
const bakeById = id => state.bakes.find(b => b.id === id);
const starterById = id => state.starters.find(s => s.id === id);

function go(view) { state.view = view; window.scrollTo(0, 0); render(); }

/* ============================================================
   Alarms and calendar
   ============================================================ */
const IS_ANDROID = /Android/i.test(navigator.userAgent);
const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IOS_SHORTCUT_NAME = 'Sourdough alarm';

function androidAlarmUrl(t, label) {
  const d = new Date(t);
  const msg = encodeURIComponent(label.replace(/[;#]/g, ' '));
  return `intent://#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=${d.getHours()};i.android.intent.extra.alarm.MINUTES=${d.getMinutes()};S.android.intent.extra.alarm.MESSAGE=${msg};B.android.intent.extra.alarm.SKIP_UI=false;end`;
}
function iosShortcutUrl(t, label) {
  const time = new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `shortcuts://run-shortcut?name=${encodeURIComponent(IOS_SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(`${time}|${label}`)}`;
}
function icsStamp(t) {
  const d = new Date(t), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}
function icsEscape(s) { return String(s).replace(/([,;\\])/g, '\\$1'); }
/** owner: { id, name } of the bake or starter the events belong to. */
function buildIcs(owner, moments) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sourdough timer//EN', 'CALSCALE:GREGORIAN'];
  moments.forEach((m, i) => {
    lines.push('BEGIN:VEVENT', `UID:${owner.id}-${i}-${m.t}@sourdough`, `DTSTAMP:${icsStamp(Date.now())}Z`,
      `DTSTART:${icsStamp(m.t)}`, `DTEND:${icsStamp(m.t + 5 * MIN)}`, `SUMMARY:${icsEscape(`${m.label} (${owner.name})`)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', `DESCRIPTION:${icsEscape(m.label)}`, 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
function downloadIcs(owner, moments, filename) {
  const url = URL.createObjectURL(new Blob([buildIcs(owner, moments)], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
}

/* ============================================================
   Share links (bakes)
   ============================================================ */
function encodeBake(bake) {
  const json = JSON.stringify({ n: bake.name, s: bake.startAt, d: bake.durs, r: bake.respectSleep ? 1 : 0, k: bake.done,
    o: bake.overrides, u: bake.busy, f: bake.withFeed ? 1 : 0, l: bake.loaves });
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeBake(str) {
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/')))));
    return normalizeBake({ id: uid(), name: o.n || 'Shared bake', startAt: o.s, durs: o.d, respectSleep: !!o.r, done: o.k || {},
      overrides: o.o || {}, busy: o.u || [], withFeed: !!o.f, loaves: o.l || null, createdAt: Date.now() });
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
   Rendering shell
   ============================================================ */
const app = document.getElementById('app');
const sheet = document.getElementById('sheet');
const backdrop = document.getElementById('backdrop');
let tick = null;

function render() {
  clearInterval(tick);
  const v = state.view;
  if (v.screen === 'bake' && bakeById(v.id)) renderBake(bakeById(v.id));
  else if (v.screen === 'starter' && starterById(v.id)) renderStarter(starterById(v.id));
  else if (v.screen === 'guide') renderGuide(v.open);
  else { state.view = { screen: 'home' }; renderHome(); }
  // Refresh countdowns, but never while a sheet is open or someone is typing.
  if (state.view.screen !== 'guide') tick = setInterval(() => {
    const typing = app.contains(document.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (!sheet.classList.contains('open') && !typing) render();
  }, 30 * 1000);
}
function keepScroll(fn) { const y = window.scrollY; fn(); window.scrollTo(0, y); }
function on(root, sel, fn) { const el = root.querySelector(sel); if (el) el.onclick = fn; }
function fmtSleep() {
  const f = hm => { const [H, M] = hm.split(':').map(Number); const d = new Date(); d.setHours(H, M, 0, 0); return fmtTime(d.getTime()); };
  return `${f(state.settings.sleepStart)}–${f(state.settings.sleepEnd)}`;
}
function guideLink(id, text) { return h`<button class="linkish" data-guide="${id}">${esc(text)}</button>`; }
function wireGuideLinks(root) {
  root.querySelectorAll('[data-guide]').forEach(b => b.onclick = () => { closeSheet(); go({ screen: 'guide', open: b.dataset.guide, back: state.view }); });
}

/* ============================================================
   Home
   ============================================================ */
function renderHome() {
  const now = Date.now();
  const bakes = state.bakes.slice().sort((a, b) => a.startAt - b.startAt);
  const starters = state.starters.slice().sort((a, b) => a.createdAt - b.createdAt);
  app.innerHTML = h`
    <div class="topbar">
      <div class="left"><h1>Sourdough</h1></div>
      <div class="row">
        <button class="icon quiet" aria-label="How-to guide" data-act="guide">${bookIcon()}</button>
        <button class="icon quiet" aria-label="Settings" data-act="settings">${gear()}</button>
      </div>
    </div>

    <div class="section-head"><h2>Bakes</h2><button class="primary" data-act="new-bake">New bake</button></div>
    ${bakes.length === 0 ? h`<p class="muted">No bakes on the go. Plan one from now, or work back from when you want to eat.</p>` : ''}
    ${bakes.map(b => {
      const na = nextAction(b, now);
      const tl = bakeTimeline(b);
      const hard = hardOnly(checkMoments(tl, state.settings, bakeCtx(b, now)));
      return h`
      <div class="card tap" data-open-bake="${b.id}" role="button" tabindex="0">
        <div class="row spread"><h3>${esc(b.name)}</h3><span class="small muted">Ready ${fmtWhen(readyAt(tl), now)}</span></div>
        ${b.loaves && loafCount(b.loaves) ? h`<div class="small muted">${esc(loavesText(b.loaves))}</div>` : ''}
        <div style="margin-top:8px" class="row spread">
          <span class="serif ${na.finished ? 'muted' : ''}" style="font-size:19px">${esc(na.label)}</span>
          <span class="${na.t - now < 0 && !na.finished ? 'warn' : 'accent'}">${na.finished ? '' : fmtCountdown(na.t - now)}</span>
        </div>
        ${hard.length ? h`<div class="small warn" style="margin-top:6px">${hard.length} step${hard.length > 1 ? 's' : ''} clash with sleep or time out. Tap to fix.</div>` : ''}
      </div>`;
    }).join('')}

    <div class="section-head"><h2>Starters</h2><button data-act="new-starter">New starter</button></div>
    ${starters.length === 0 ? h`<p class="muted">Track a starter from day one, or add the one you already have.</p>` : ''}
    ${starters.map(st => {
      const s = statusOf(st, now);
      const when = s.nextAt ?? s.peakAt;
      return h`
      <div class="card tap" data-open-starter="${st.id}" role="button" tabindex="0">
        <div class="row spread"><h3>${esc(st.name)}</h3><span class="small muted">${esc(starterPhaseText(st))}</span></div>
        <div style="margin-top:8px" class="row spread">
          <span class="serif" style="font-size:19px">${esc(s.title)}</span>
          ${when && s.state !== 'hungry' ? h`<span class="${when < now ? 'warn' : 'accent'}">${fmtCountdown(when - now)}</span>` : ''}
        </div>
      </div>`;
    }).join('')}

    <div class="card tap guide-card" data-act="guide" role="button" tabindex="0">
      <div class="row">${bookIcon()}<h3>How-to guide</h3></div>
      <div class="small muted" style="margin-top:4px">Starters, flours, storage, hooch, dough, Dutch oven vs open baking, fixes and safety.</div>
    </div>
  `;
  const tapOpen = (sel, fn) => app.querySelectorAll(sel).forEach(el => {
    el.addEventListener('click', () => fn(el));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(el); } });
  });
  tapOpen('[data-open-bake]', el => go({ screen: 'bake', id: el.dataset.openBake }));
  tapOpen('[data-open-starter]', el => go({ screen: 'starter', id: el.dataset.openStarter }));
  tapOpen('[data-act="guide"]', () => go({ screen: 'guide' }));
  on(app, '[data-act="new-bake"]', openNewBake);
  on(app, '[data-act="new-starter"]', openNewStarter);
  on(app, '[data-act="settings"]', openSettings);
}
function loavesText(loaves) {
  return LOAF_SIZES.filter(s => loaves[s]).map(s => `${loaves[s]} ${LOAF_LABEL[s].toLowerCase()}`).join(', ') + (loafCount(loaves) === 1 ? ' loaf' : ' loaves');
}
function starterPhaseText(st) {
  if (st.phase === 'create') return `Day ${dayNumber(st)}`;
  if (st.phase === 'strengthen') return `Strengthening at ${ratioText(currentRatio(st))}`;
  return st.fridge ? 'Mature, in fridge' : 'Mature';
}

/* ============================================================
   Bake
   ============================================================ */
function flagText(m) {
  if (m.reason === 'out') return `${m.label} is while you're out`;
  return m.level === 'hard' ? `${m.label} is in your sleep window` : `${m.label} is inside your ${state.settings.graceMins} min grace`;
}
/** Feed amounts for a bake, from its loaves and current feed wait. */
function bakeFeedPlan(bake) {
  const need = bake.loaves ? recipeFor(bake.loaves, state.settings).total.starter : state.settings.recipe.starter;
  return feedPlan(need, state.settings.starterKeep, ratioForFeed(bake.durs.feed));
}

function renderRecipe(bake) {
  if (!bake.loaves || !loafCount(bake.loaves)) return '';
  const rec = recipeFor(bake.loaves, state.settings);
  const t = rec.total;
  const same = rec.items.every(i => i.size === rec.items[0].size);
  return h`
    <details class="card recipe" open>
      <summary><h3>Recipe</h3><span class="small muted">${esc(loavesText(bake.loaves))}</span></summary>
      <div class="recipe-grid">
        <span>Starter</span><strong>${grams(t.starter)}</strong>
        <span>Bread flour</span><strong>${grams(t.flour)}</strong>
        <span>Warm water</span><strong>${grams(t.water)}</strong>
        <span>Salt</span><strong>${grams(t.salt)}</strong>
      </div>
      <div class="small muted" style="margin-top:8px">
        ${same ? `About ${grams(rec.items[0].dough)} of dough per loaf.` :
          `Divide by weight: ${LOAF_SIZES.filter(z => bake.loaves[z]).map(z => {
            const one = rec.items.find(i => i.size === z);
            return `${bake.loaves[z] > 1 ? `${bake.loaves[z]} × ` : ''}${LOAF_LABEL[z].toLowerCase()} ${grams(one.dough)}`;
          }).join(', ')}.`}
        ${Math.round(rec.hydration * 100)}% hydration.
      </div>
    </details>`;
}

function renderBake(bake) {
  const now = Date.now();
  const tl = bakeTimeline(bake);
  const flags = checkMoments(tl, state.settings, bakeCtx(bake, now));
  const hard = hardOnly(flags);
  const soft = flags.filter(m => m.level === 'soft');
  const ci = currentIndex(bake);
  const na = nextAction(bake, now);
  const starter = bake.starterId ? starterById(bake.starterId) : null;

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
    const stepFlags = flags.filter(m => m.step.def.id === id);
    const stepOver = overridden.filter(m => m.step.def.id === id);
    const cls = ['step', i < ci ? 'done' : '', i === ci ? 'current' : '',
      stepFlags.some(m => m.level === 'hard') ? 'conflict' : stepFlags.length ? 'soft' : ''].join(' ');
    let nowline = '';
    if (!nowPlaced && s.start > now) { nowline = h`<div class="nowline"><span>now</span></div>`; nowPlaced = true; }
    const future = i >= ci;
    const isGap = FOLD_GAPS.includes(id);
    const min = s.def.flex ? state.settings.coldMin : s.def.min;
    const max = s.def.flex ? state.settings.coldMax : s.def.max;
    const note = noteFor(s, future);
    return nowline + h`
      <div class="${cls}" data-step="${id}">
        <div class="row spread">
          <div>
            <div class="when">${fmtWhen(s.start, now)}</div>
            <div class="name">${esc(s.def.name)}</div>
          </div>
          <div class="dur" id="dur-${id}">${fmtDur(s.dur)}</div>
        </div>
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
      </div>`;
  }).join('');

  const outs = (bake.busy || []).filter(b => b.to > now);
  keepScroll(() => {
    app.innerHTML = h`
      <div class="topbar">
        <div class="left">
          <button class="icon quiet" aria-label="Back" data-act="back">${chevron()}</button>
          <h1>${esc(bake.name)}</h1>
        </div>
        <div class="row">
          <button class="icon quiet" aria-label="Settings" data-act="settings">${gear()}</button>
          <button class="icon quiet" aria-label="Share" data-act="share">${shareIcon()}</button>
        </div>
      </div>
      <div class="hero">
        <div class="muted">Ready to eat</div>
        <div class="ready">${fmtWhen(readyAt(tl), now)}</div>
        <div class="muted small">${bake.withFeed ? 'Starter fed' : 'Started'} ${fmtWhen(bake.startAt, now)}${starter ? ` · ${esc(starter.name)}` : ''}</div>
        <div class="next">
          <div class="muted small">${na.finished ? 'Finished' : 'Next'}</div>
          <div class="row spread">
            <span class="serif">${esc(na.label)}</span>
            <span class="${na.t - now < 0 && !na.finished ? 'warn' : 'accent'}">${na.finished ? '' : fmtCountdown(na.t - now)}</span>
          </div>
        </div>
        ${outs.length ? h`<div class="row wrap" style="margin-top:12px">${outs.map(o => h`
          <span class="chip">Out ${fmtWhen(o.from, now)}–${sameDay(o.from, o.to) ? fmtTime(o.to) : fmtWhen(o.to, now)}
            <button class="quiet" aria-label="Remove" data-unbusy="${o.from}">✕</button></span>`).join('')}</div>` : ''}
      </div>
      ${hard.length ? h`
        <div class="notice bad">
          <div><strong>${hard.length} step${hard.length > 1 ? 's' : ''}</strong> ${hard.length > 1 ? 'clash' : 'clashes'} with sleep or time out.</div>
          <button class="primary" data-act="fix" style="margin-top:10px">Fix it</button>
        </div>` : soft.length ? h`
        <div class="notice soft">
          <div>${soft.map(m => esc(flagText(m))).join('. ')}. That's within your leeway.</div>
          <button data-act="fix-strict" style="margin-top:10px">Tighten anyway</button>
        </div>` : ''}
      ${renderRecipe(bake)}
      <div class="timeline">${stepsHtml}</div>
      <div class="stack" style="margin-top:22px">
        <button class="wide" data-act="out">I'm out for a while…</button>
        <button class="wide" data-act="calendar">${cal()} Add every step to calendar</button>
        <label class="field" style="margin:0">${bake.withFeed ? 'Starter fed at' : 'Started at'}
          <input type="datetime-local" value="${toLocalInput(bake.startAt)}" data-act="start" style="margin-top:4px">
        </label>
        <label class="switch"><span>Avoid sleep window (${fmtSleep()})</span><input type="checkbox" ${bake.respectSleep ? 'checked' : ''} data-act="sleep"></label>
        <button class="quiet" data-act="delete" style="color:var(--warn)">Delete this bake</button>
      </div>
      ${alarmHelp()}
    `;
  });

  const commit = () => { save(); keepScroll(() => renderBake(bake)); };
  on(app, '[data-act="back"]', () => go({ screen: 'home' }));
  on(app, '[data-act="settings"]', openSettings);
  on(app, '[data-act="share"]', () => shareBake(bake));
  on(app, '[data-act="fix"]', () => openFixSheet(bake, false));
  on(app, '[data-act="fix-strict"]', () => openFixSheet(bake, true));
  on(app, '[data-act="out"]', () => openOutSheet(bake));
  on(app, '[data-act="calendar"]', () => downloadIcs(bake, attendMoments(tl).filter(m => m.t > now), `${slug(bake.name)}.ics`));
  on(app, '[data-act="delete"]', () => {
    if (confirm(`Delete "${bake.name}"?`)) { state.bakes = state.bakes.filter(b => b.id !== bake.id); save(); go({ screen: 'home' }); }
  });
  app.querySelector('[data-act="start"]').onchange = e => { const t = new Date(e.target.value).getTime(); if (!isNaN(t)) { bake.startAt = t; commit(); } };
  app.querySelector('[data-act="sleep"]').onchange = e => { bake.respectSleep = e.target.checked; commit(); };
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
  app.querySelectorAll('[data-done]').forEach(btn => btn.onclick = () => {
    const id = btn.dataset.done;
    if (id === 'feed') recordBakeFeed(bake);
    markDone(bake, tl, id);
    commit();
  });
  app.querySelectorAll('[data-alarm],[data-alarm-end]').forEach(btn => btn.onclick = () => {
    const end = 'alarmEnd' in btn.dataset;
    const s = stepOf(tl, end ? btn.dataset.alarmEnd : btn.dataset.alarm);
    openAlarmSheet(bake, end ? s.end : s.start, end ? `Finish ${s.def.name.toLowerCase()}` : s.def.name);
  });
}
/** Freeze the feed amounts on the bake and log the feed on its starter. */
function recordBakeFeed(bake) {
  const plan = bakeFeedPlan(bake);
  bake.feedDone = plan;
  const st = bake.starterId ? starterById(bake.starterId) : null;
  if (st) {
    if (st.fridge) setFridge(st, false);
    logFeed(st, { r: plan.r, amounts: plan, note: `For ${bake.name}` });
  }
}

/** Replan options, plus "I'll be up" for each clash. */
function openFixSheet(bake, strict) {
  const now = Date.now();
  const flags = checkMoments(bakeTimeline(bake), state.settings, bakeCtx(bake, now)).filter(m => strict || m.level === 'hard');
  const options = fixOptions(bake, state.settings, now, { strict });
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

/** "I'm out from X to Y" for this bake. */
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
    if (hardOnly(checkMoments(bakeTimeline(bake), state.settings, bakeCtx(bake))).length) openFixSheet(bake, false);
  });
}

/* ---------- New bake ---------- */
function openNewBake() {
  const now = Date.now();
  const matureStarters = state.starters.filter(s => s.phase === 'mature');
  const draft = {
    mode: 'now', ready: roundTo(now + 2 * DAY, 30), respectSleep: true, name: '',
    loaves: { small: 0, medium: 1, large: 0 }, withFeed: true,
    starterId: (matureStarters[0] || state.starters[0])?.id || null,
  };
  const draw = () => {
    const s = state.settings;
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

    const count = loafCount(draft.loaves);
    const rec = count ? recipeFor(draft.loaves, s) : null;
    const plan = wf ? feedPlan(rec ? rec.total.starter : s.recipe.starter, s.starterKeep, ratioForFeed(result.durs.feed)) : null;
    const chosen = draft.starterId ? starterById(draft.starterId) : null;

    openSheet(h`
      <h2>New bake</h2>
      <div class="stack" style="margin-top:14px">
        <h3>Loaves</h3>
        ${LOAF_SIZES.map(size => h`
          <div class="stepper-row">
            <span>${LOAF_LABEL[size]} <span class="muted small">${grams(s.loafFlour[size])} flour</span></span>
            <div class="stepper">
              <button class="icon" aria-label="Fewer ${size}" data-less="${size}">−</button>
              <span aria-live="polite">${draft.loaves[size]}</span>
              <button class="icon" aria-label="More ${size}" data-more="${size}">+</button>
            </div>
          </div>`).join('')}
        ${rec ? h`<div class="small muted">${grams(rec.total.starter)} starter, ${grams(rec.total.flour)} flour, ${grams(rec.total.water)} water, ${grams(rec.total.salt)} salt.</div>` : h`<div class="small muted">No loaves chosen: the timer still works, without a recipe.</div>`}

        <h3 style="margin-top:6px">Plan</h3>
        <label class="switch"><span>Feed the starter first</span><input type="checkbox" ${wf ? 'checked' : ''} data-feed></label>
        ${wf && state.starters.length ? h`
          <label class="field">Starter
            <select data-starter style="margin-top:4px">
              <option value="">None tracked</option>
              ${state.starters.map(st => h`<option value="${st.id}" ${st.id === draft.starterId ? 'selected' : ''}>${esc(st.name)} (${esc(starterPhaseText(st))})</option>`).join('')}
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
    sheet.querySelectorAll('[data-alt]').forEach(b => b.onclick = () => commit(solveForward(Number(b.dataset.alt), state.settings, draft.respectSleep, draft.withFeed)));
    on(sheet, '[data-save]', () => commit(result));
    function commit(r) {
      const bake = normalizeBake({
        id: uid(), name: draft.name.trim() || autoName(r.startAt), startAt: r.startAt, durs: { ...r.durs },
        respectSleep: draft.respectSleep, withFeed: draft.withFeed, loaves: loafCount(draft.loaves) ? { ...draft.loaves } : null,
        starterId: draft.withFeed ? draft.starterId : null, createdAt: Date.now(),
      });
      state.bakes.push(bake); save(); closeSheet(); go({ screen: 'bake', id: bake.id });
    }
  };
  draw();
}
function autoName(startAt) { return `Bake, ${fmtDate(startAt)}`; }

/* ============================================================
   Starter
   ============================================================ */
function renderStarter(st) {
  const now = Date.now();
  const status = statusOf(st, now);
  const last = lastFeed(st);
  const when = status.nextAt ?? status.peakAt;
  const whenLabel = status.nextAt ? (st.fridge ? 'Weekly feed' : 'Next feed') : 'Peak';
  const r = currentRatio(st);
  const amounts = feedAmounts(st, r);

  let phaseHtml = '';
  if (st.phase === 'create') {
    const g = createGuidance(dayNumber(st, now));
    phaseHtml = h`
      <div class="card">
        <h3>${esc(g.title)}</h3>
        <p class="small" style="margin-top:6px">${esc(g.body)}</p>
        <details><summary>It's alive when it…</summary><ul class="small">${ALIVE_SIGNS.map(s => `<li>${esc(s)}</li>`).join('')}</ul></details>
        <button class="primary wide" data-act="alive" style="margin-top:12px">It's alive: start strengthening</button>
        <div class="small" style="margin-top:8px">${guideLink('creating', 'How creating a starter works')}</div>
      </div>`;
  } else if (st.phase === 'strengthen') {
    const lad = LADDERS[st.ladder];
    const si = stageIndex(st);
    phaseHtml = h`
      <div class="card">
        <div class="row spread"><h3>${esc(lad.name)} ladder</h3><button class="quiet small" data-act="ladder">Change</button></div>
        <div class="ladder">
          ${lad.ratios.map((x, i) => {
            const n = Math.min(DOUBLINGS_PER_STAGE, doublingsAt(st, x));
            const cls = i < si || si === -1 ? 'done' : i === si ? 'current' : '';
            return h`<div class="rung ${cls}"><span>${ratioText(x)}</span><span class="pips">${'●'.repeat(n)}${'○'.repeat(DOUBLINGS_PER_STAGE - n)}</span></div>`;
          }).join('')}
        </div>
        <p class="small muted" style="margin-top:8px">Three feeds that double at each ratio, then step up. A feed that doesn't double just gets repeated.</p>
        <div class="small">${guideLink('ladder', 'About the ladder')}</div>
      </div>`;
  } else {
    phaseHtml = h`
      <div class="card">
        <h3>${st.fridge ? 'In the fridge' : 'Ready for bread'}</h3>
        <p class="small muted" style="margin-top:6px">${st.fridge
          ? 'Feed it about once a week. Before baking, take it out and give it a warm feed or two.'
          : 'On the bench, feed it daily. Going a while without baking? Feed it, wait an hour or two, then fridge it.'}</p>
        ${status.state === 'fridge-long' ? h`<ol class="small">
          <li>Take it out, pour off any hooch.</li><li>Keep ${grams(st.keep)}, feed 1:1:1 or 1:2:2 somewhere warm.</li>
          <li>Repeat every 12–24 hours until it doubles on time again.</li></ol>` : ''}
        <button class="wide" data-act="fridge" style="margin-top:10px">${st.fridge ? 'Take it out of the fridge' : 'Put it in the fridge'}</button>
        <div class="small" style="margin-top:8px">${guideLink(st.fridge ? 'reviving' : 'storing', st.fridge ? 'Reviving a stored starter' : 'Storing it in the fridge')}</div>
      </div>`;
  }

  keepScroll(() => {
    app.innerHTML = h`
      <div class="topbar">
        <div class="left">
          <button class="icon quiet" aria-label="Back" data-act="back">${chevron()}</button>
          <h1>${esc(st.name)}</h1>
        </div>
        <button class="icon quiet" aria-label="How-to guide" data-act="guide">${bookIcon()}</button>
      </div>
      <div class="hero">
        <span class="chip">${esc(PHASE_LABEL[st.phase])}${st.phase === 'create' ? ` · day ${dayNumber(st, now)}` : ''}</span>
        <div class="ready" style="margin-top:10px">${esc(status.title)}</div>
        <div class="muted small">${esc(status.detail)}</div>
        ${when ? h`<div class="next">
          <div class="muted small">${whenLabel}</div>
          <div class="row spread"><span class="serif">${fmtWhen(when, now)}</span><span class="${when < now ? 'warn' : 'accent'}">${fmtCountdown(when - now)}</span></div>
        </div>` : ''}
        ${last ? h`<div class="small muted" style="margin-top:8px">Last fed ${fmtAgo(now - last.t)} at ${ratioText(last.r)}</div>` : ''}
      </div>
      ${phaseHtml}
      <div class="card">
        <h3>Next feed</h3>
        <div class="recipe-grid" style="margin-top:8px">
          <span>Keep starter</span><strong>${grams(amounts.starter)}</strong>
          <span>Add flour</span><strong>${grams(amounts.flour)}</strong>
          <span>Add water</span><strong>${grams(amounts.water)}</strong>
        </div>
        <div class="small muted" style="margin-top:6px">${st.phase === 'mature' ? 'Ratio is your choice when you log it.' : `${ratioText(r)}, discard the rest.`}</div>
        <div class="row" style="margin-top:12px">
          <button class="primary" data-act="log" style="flex:1">Log a feed</button>
          ${when ? h`<button data-act="remind">${bell()} Remind me</button>` : ''}
        </div>
      </div>
      <details class="card"><summary><h3>Signs it's hungry</h3></summary>
        <ul class="small">${HUNGRY_SIGNS.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
        <div class="small">${guideLink('hooch', 'What hooch is')} · ${guideLink('hungry', 'More on reading it')}</div>
      </details>
      <details class="card"><summary><h3>Signs it's at its peak</h3></summary>
        <ul class="small">${PEAK_SIGNS.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
      </details>
      <div class="section-head"><h2>Feeds</h2>${st.feeds.length > (st.feeds[0]?.r === 0 ? 1 : 0) ? h`<button class="quiet" data-act="undo">Undo last</button>` : ''}</div>
      ${st.feeds.length ? st.feeds.slice().reverse().slice(0, 30).map(f => h`
        <div class="feed-row">
          <div><div>${fmtWhen(f.t, now)}</div><div class="small muted">${f.r ? `${ratioText(f.r)} · ${grams(f.starter)} + ${grams(f.flour)} + ${grams(f.water)}` : `${grams(f.flour)} flour + ${grams(f.water)} water`}${f.note ? ` · ${esc(f.note)}` : ''}</div></div>
          <span class="doubled ${f.doubled === true ? 'yes' : f.doubled === false ? 'no' : ''}">${f.doubled === true ? 'Doubled' : f.doubled === false ? 'Didn’t double' : ''}</span>
        </div>`).join('') : h`<p class="muted">No feeds yet.</p>`}
      <div class="stack" style="margin-top:22px">
        <div class="row">
          <label class="field" style="flex:2">Name<input type="text" value="${esc(st.name)}" data-name style="margin-top:4px"></label>
          <label class="field" style="flex:1">Keep (g)<input type="number" min="5" max="200" step="1" inputmode="numeric" value="${st.keep}" data-keep style="margin-top:4px"></label>
        </div>
        <button class="quiet" data-act="delete" style="color:var(--warn)">Delete this starter</button>
      </div>
    `;
  });

  const commit = () => { save(); keepScroll(() => renderStarter(st)); };
  on(app, '[data-act="back"]', () => go({ screen: 'home' }));
  on(app, '[data-act="guide"]', () => go({ screen: 'guide', back: state.view }));
  on(app, '[data-act="alive"]', () => openLadderSheet(st, true));
  on(app, '[data-act="ladder"]', () => openLadderSheet(st, false));
  on(app, '[data-act="fridge"]', () => { setFridge(st, !st.fridge); commit(); });
  on(app, '[data-act="log"]', () => openFeedSheet(st));
  on(app, '[data-act="remind"]', () => openAlarmSheet(st, when, status.nextAt ? `Feed ${st.name}` : `${st.name} near peak`));
  on(app, '[data-act="undo"]', () => { if (undoLastFeed(st)) { commit(); toast('Last feed removed'); } });
  on(app, '[data-act="delete"]', () => {
    if (confirm(`Delete "${st.name}" and its feed history?`)) {
      state.starters = state.starters.filter(s => s.id !== st.id);
      state.bakes.forEach(b => { if (b.starterId === st.id) b.starterId = null; });
      save(); go({ screen: 'home' });
    }
  });
  app.querySelector('[data-name]').onchange = e => { const v = e.target.value.trim(); if (v) { st.name = v; commit(); } };
  app.querySelector('[data-keep]').onchange = e => { const v = Math.round(Number(e.target.value)); if (v >= 5 && v <= 200) { st.keep = v; commit(); } };
  wireGuideLinks(app);
}

function openFeedSheet(st) {
  const prev = lastFeed(st);
  const draft = { doubled: undefined, r: currentRatio(st), t: Date.now(), note: '', backInFridge: st.fridge };
  const draw = () => {
    const a = feedAmounts(st, draft.r);
    openSheet(h`
      <h2>Log a feed</h2>
      <div class="stack" style="margin-top:14px">
        ${prev ? h`
          <div>
            <div class="field">Did it at least double since the last feed?</div>
            <div class="seg" role="group" aria-label="Did it double">
              <button data-dbl="yes" aria-pressed="${draft.doubled === true}">Yes</button>
              <button data-dbl="no" aria-pressed="${draft.doubled === false}">No</button>
              <button data-dbl="unsure" aria-pressed="${draft.doubled === null}">Not sure</button>
            </div>
            ${st.phase === 'strengthen' ? h`<div class="small muted" style="margin-top:6px">Only a yes counts toward the ${DOUBLINGS_PER_STAGE} doublings for this ratio.</div>` : ''}
          </div>` : ''}
        ${st.phase === 'mature' ? h`
          <div>
            <div class="field">Ratio</div>
            <div class="seg" role="group" aria-label="Feed ratio">
              ${BAKE_FEED_RATIOS.map(x => h`<button data-r="${x}" aria-pressed="${draft.r === x}">${ratioText(x)}</button>`).join('')}
            </div>
            <div class="small muted" style="margin-top:6px">Peaks in about ${fmtDur(PEAK_HOURS[draft.r] * 60)} at 24°C.</div>
          </div>` : h`<div class="small muted">Ratio ${ratioText(draft.r)} ${st.phase === 'create' ? 'while it gets going' : 'for this stage'}.</div>`}
        <div class="card" style="margin:0">
          <div class="recipe-grid">
            <span>Keep starter</span><strong>${grams(a.starter)}</strong>
            <span>Add flour</span><strong>${grams(a.flour)}</strong>
            <span>Add water</span><strong>${grams(a.water)}</strong>
          </div>
        </div>
        <label class="field">Fed at<input type="datetime-local" value="${toLocalInput(draft.t)}" data-t style="margin-top:4px"></label>
        <label class="field">Note (optional)<input type="text" value="${esc(draft.note)}" placeholder="Smell, flour used, temperature…" data-note style="margin-top:4px"></label>
        ${st.fridge ? h`<label class="switch"><span>Going back in the fridge</span><input type="checkbox" ${draft.backInFridge ? 'checked' : ''} data-fridge></label>` : ''}
        <button class="primary wide" data-save>Save feed</button>
        <button class="quiet" data-close>Cancel</button>
      </div>
    `);
    sheet.querySelectorAll('[data-dbl]').forEach(b => b.onclick = () => { draft.doubled = { yes: true, no: false, unsure: null }[b.dataset.dbl]; draw(); });
    sheet.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { draft.r = Number(b.dataset.r); draw(); });
    sheet.querySelector('[data-t]').onchange = e => { const t = new Date(e.target.value).getTime(); if (!isNaN(t)) draft.t = t; };
    sheet.querySelector('[data-note]').oninput = e => { draft.note = e.target.value; };
    const fr = sheet.querySelector('[data-fridge]');
    if (fr) fr.onchange = e => { draft.backInFridge = e.target.checked; };
    on(sheet, '[data-close]', closeSheet);
    on(sheet, '[data-save]', () => {
      const res = logFeed(st, { t: draft.t, r: st.phase === 'mature' ? draft.r : undefined, doubled: draft.doubled, note: draft.note.trim() });
      if (st.fridge) { if (draft.backInFridge) st.fridgeSince = draft.t; else setFridge(st, false); }
      save(); closeSheet(); renderStarter(st);
      if (res.matured) toast('Ladder complete. Ready for bread!');
      else if (res.advanced) toast(`Stage done. Now ${ratioText(res.ratio)}`);
      else toast('Feed logged');
    });
  };
  draw();
}

/** Choose a strengthening ladder. fromCreate: the starter has just come alive. */
function openLadderSheet(st, fromCreate) {
  openSheet(h`
    <h2>${fromCreate ? 'Strengthen it' : 'Change ladder'}</h2>
    <p class="muted small" style="margin-top:6px">Pick how quickly to step up the feed ratio. Each ratio needs ${DOUBLINGS_PER_STAGE} feeds that double. ${fromCreate ? '' : 'Doublings already logged still count.'}</p>
    <div class="stack">
      ${Object.entries(LADDERS).map(([key, lad]) => h`
        <div class="card" style="margin:0">
          <div class="row spread"><h3>${esc(lad.name)}</h3><span class="small muted">${esc(lad.days)}</span></div>
          <div class="accent small" style="margin:4px 0 6px">${lad.ratios.map(ratioText).join(' → ')}</div>
          <p class="small" style="margin:0">${esc(lad.blurb)}</p>
          <div class="small muted" style="margin-top:6px">Up to ${grams(st.keep * lad.ratios[lad.ratios.length - 1])} flour a day at the top.</div>
          <button class="${key === st.ladder ? 'primary' : ''} wide" data-ladder="${key}" style="margin-top:10px">${key === st.ladder && !fromCreate ? 'Current' : 'Choose'}</button>
        </div>`).join('')}
      <button class="quiet" data-close>Cancel</button>
    </div>
  `);
  on(sheet, '[data-close]', closeSheet);
  sheet.querySelectorAll('[data-ladder]').forEach(b => b.onclick = () => {
    startStrengthening(st, b.dataset.ladder);
    save(); closeSheet(); renderStarter(st);
    toast(`${LADDERS[st.ladder].name} ladder. Next feed ${ratioText(currentRatio(st))}`);
  });
}

function openNewStarter() {
  const draft = { name: '', mode: 'scratch', ladder: 'balanced', keep: state.settings.starterKeep };
  const draw = () => {
    openSheet(h`
      <h2>New starter</h2>
      <div class="stack" style="margin-top:14px">
        <label class="field">Name<input type="text" placeholder="Starter" value="${esc(draft.name)}" data-name style="margin-top:4px"></label>
        <div class="seg" role="group" aria-label="Where it's at">
          <button data-mode="scratch" aria-pressed="${draft.mode === 'scratch'}">From scratch</button>
          <button data-mode="active" aria-pressed="${draft.mode === 'active'}">Just alive</button>
          <button data-mode="mature" aria-pressed="${draft.mode === 'mature'}">Mature</button>
        </div>
        ${draft.mode === 'scratch' ? h`
          <div class="notice">Mix <strong>50 g flour</strong> with <strong>50 g water</strong> at about 25°C in a clean jar, cover loosely, and save. Wholemeal or rye gets it going fastest. From tomorrow, keep ${grams(draft.keep)} and feed daily.</div>`
        : draft.mode === 'active' ? h`
          <div class="small muted">It already doubles after a feed. Choose a ladder to build its strength.</div>
          ${Object.entries(LADDERS).map(([key, lad]) => h`
            <label class="radio-card"><input type="radio" name="ladder" value="${key}" ${draft.ladder === key ? 'checked' : ''} data-ladder>
              <span><strong>${esc(lad.name)}</strong> <span class="small muted">${esc(lad.days)}</span><br><span class="small accent">${lad.ratios.map(ratioText).join(' → ')}</span><br><span class="small muted">${esc(lad.blurb)}</span></span></label>`).join('')}`
        : h`<div class="small muted">Reliably doubles at 1:10:10 within a day. Ready for bread.</div>`}
        <label class="field">Starter kept each feed (g)<input type="number" min="5" max="200" inputmode="numeric" value="${draft.keep}" data-keep style="margin-top:4px"></label>
        <button class="primary wide" data-save>${draft.mode === 'scratch' ? 'I’ve mixed it' : 'Add starter'}</button>
        <button class="quiet" data-close>Cancel</button>
      </div>
    `);
    sheet.querySelector('[data-name]').oninput = e => { draft.name = e.target.value; };
    sheet.querySelector('[data-keep]').onchange = e => { const v = Math.round(Number(e.target.value)); if (v >= 5 && v <= 200) draft.keep = v; };
    sheet.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { draft.mode = b.dataset.mode; draw(); });
    sheet.querySelectorAll('[data-ladder]').forEach(r => r.onchange = () => { draft.ladder = r.value; });
    on(sheet, '[data-close]', closeSheet);
    on(sheet, '[data-save]', () => {
      const st = newStarter({ name: draft.name.trim() || 'Starter', mode: draft.mode, ladder: draft.ladder, keep: draft.keep });
      state.starters.push(st); save(); closeSheet(); go({ screen: 'starter', id: st.id });
    });
  };
  draw();
}

/* ============================================================
   Guide
   ============================================================ */
function renderGuide(openId) {
  const back = state.view.back;
  app.innerHTML = h`
    <div class="topbar">
      <div class="left">
        <button class="icon quiet" aria-label="Back" data-act="back">${chevron()}</button>
        <h1>How-to guide</h1>
      </div>
    </div>
    ${GUIDE_GROUPS.map(g => h`
      <h2 class="guide-group">${esc(g)}</h2>
      ${GUIDE.filter(s => s.group === g).map(s => h`
        <details class="card guide" id="g-${s.id}" ${s.id === openId ? 'open' : ''}>
          <summary><h3>${esc(s.title)}</h3></summary>
          <div class="guide-body">${s.html}</div>
        </details>`).join('')}`).join('')}
  `;
  on(app, '[data-act="back"]', () => go(back && back.screen !== 'guide' ? back : { screen: 'home' }));
  if (openId) requestAnimationFrame(() => document.getElementById(`g-${openId}`)?.scrollIntoView({ block: 'start' }));
}

/* ============================================================
   Sheets: common, settings, alarms
   ============================================================ */
function openSheet(html) {
  sheet.innerHTML = `<div class="handle"></div>${html}`;
  sheet.classList.add('open'); backdrop.classList.add('open');
  sheet.scrollTop = 0;
}
function closeSheet() { sheet.classList.remove('open'); backdrop.classList.remove('open'); }
backdrop.onclick = () => { closeSheet(); render(); };

function openSettings() {
  const s = state.settings;
  const pair = (label, lo, hi, min, max, step) => h`
    <div>
      <div class="row spread"><span>${label}</span><span class="muted" id="pair-${lo}">${fmtDur(s[lo])} to ${fmtDur(s[hi])}</span></div>
      <div class="row">
        <input type="range" min="${min}" max="${max}" step="${step}" value="${s[lo]}" data-pair="${lo}" data-lo="${lo}" data-hi="${hi}" aria-label="${label} shortest">
        <input type="range" min="${min}" max="${max}" step="${step}" value="${s[hi]}" data-pair="${hi}" data-lo="${lo}" data-hi="${hi}" aria-label="${label} longest">
      </div>
    </div>`;
  const num = (label, attr, value) => h`<label class="field" style="flex:1">${label}<input type="number" min="0" step="1" inputmode="numeric" value="${value}" ${attr} style="margin-top:4px"></label>`;
  openSheet(h`
    <h2>Settings</h2>
    <div class="stack" style="margin-top:14px">
      <h3>Sleep</h3>
      <div class="row">
        <label class="field" style="flex:1">Asleep from<input type="time" value="${s.sleepStart}" data-s="sleepStart" style="margin-top:4px"></label>
        <label class="field" style="flex:1">Awake at<input type="time" value="${s.sleepEnd}" data-s="sleepEnd" style="margin-top:4px"></label>
      </div>
      <div>
        <div class="row spread"><span>Grace at each end</span><span class="muted" id="grace-val">${s.graceMins} min</span></div>
        <input type="range" min="0" max="60" step="15" value="${s.graceMins}" data-grace aria-label="Grace at each end of the sleep window">
        <div class="small muted">Steps this close to bed or waking only warn, they don't count as clashes.</div>
      </div>

      <h3 style="margin-top:10px">Recipe for a medium loaf</h3>
      <div class="row">${num('Starter (g)', 'data-rec="starter"', s.recipe.starter)}${num('Flour (g)', 'data-rec="flour"', s.recipe.flour)}</div>
      <div class="row">${num('Water (g)', 'data-rec="water"', s.recipe.water)}${num('Salt (g)', 'data-rec="salt"', s.recipe.salt)}</div>
      <div class="small muted">Flour per loaf size; everything else scales with it.</div>
      <div class="row">${LOAF_SIZES.map(z => num(LOAF_LABEL[z], `data-loaf="${z}"`, s.loafFlour[z])).join('')}</div>
      <div class="row">${num('Starter kept after a bake feed (g)', 'data-keep', s.starterKeep)}</div>

      <h3 style="margin-top:10px">How far Fix it may bend</h3>
      <div>
        <div class="row spread"><span>Tightest gap between folds</span><span class="muted" id="foldmin-val">${s.foldMin} min</span></div>
        <input type="range" min="15" max="30" step="5" value="${s.foldMin}" data-foldmin aria-label="Tightest gap between folds">
      </div>
      ${pair('Bulk ferment', 'bulkMin', 'bulkMax', 120, 600, 15)}
      ${pair('Fridge proof', 'coldMin', 'coldMax', 240, 2160, 30)}

      <h3 style="margin-top:10px">Default times for new bakes</h3>
      <p class="muted small" style="margin:0">Existing bakes keep their own times.</p>
      ${ALL_DEFS.filter(d => !d.flex).map(d => h`
        <div>
          <div class="row spread"><span>${esc(d.feed ? 'Starter feed to mixing' : d.name)}</span><span class="muted" id="set-${d.id}">${fmtDur(s.durs[d.id])}</span></div>
          <input type="range" min="${d.min}" max="${d.max}" step="${d.inc}" value="${s.durs[d.id]}" data-dur="${d.id}" aria-label="${esc(d.name)} default duration">
        </div>`).join('')}
      <button class="quiet" data-reset>Reset to defaults</button>
      <button class="primary wide" data-close>Done</button>
    </div>
  `);
  // Every change saves and redraws the page underneath, so flags update straight away.
  const apply = () => { save(); render(); };
  const posInt = v => { const n = Math.round(Number(v)); return n > 0 ? n : null; };
  sheet.querySelectorAll('[data-s]').forEach(i => i.onchange = () => { if (i.value) { s[i.dataset.s] = i.value; apply(); } });
  sheet.querySelectorAll('[data-rec]').forEach(i => i.onchange = () => { const n = posInt(i.value); if (n != null || i.dataset.rec === 'salt') { s.recipe[i.dataset.rec] = n ?? 0; apply(); } });
  sheet.querySelectorAll('[data-loaf]').forEach(i => i.onchange = () => { const n = posInt(i.value); if (n) { s.loafFlour[i.dataset.loaf] = n; apply(); } });
  sheet.querySelector('[data-keep]').onchange = e => { const n = posInt(e.target.value); if (n) { s.starterKeep = n; apply(); } };
  const g = sheet.querySelector('[data-grace]');
  g.oninput = () => { document.getElementById('grace-val').textContent = `${g.value} min`; };
  g.onchange = () => { s.graceMins = Number(g.value); apply(); };
  const fm = sheet.querySelector('[data-foldmin]');
  fm.oninput = () => { document.getElementById('foldmin-val').textContent = `${fm.value} min`; };
  fm.onchange = () => { s.foldMin = Number(fm.value); apply(); };
  sheet.querySelectorAll('[data-pair]').forEach(i => {
    const { lo, hi } = i.dataset;
    i.oninput = () => {
      s[i.dataset.pair] = Number(i.value);
      if (s[lo] > s[hi]) { if (i.dataset.pair === lo) s[hi] = s[lo]; else s[lo] = s[hi]; }
      document.getElementById(`pair-${lo}`).textContent = `${fmtDur(s[lo])} to ${fmtDur(s[hi])}`;
    };
    i.onchange = apply;
  });
  sheet.querySelectorAll('[data-dur]').forEach(i => {
    i.oninput = () => { document.getElementById(`set-${i.dataset.dur}`).textContent = fmtDur(Number(i.value)); };
    i.onchange = () => { s.durs[i.dataset.dur] = Number(i.value); apply(); };
  });
  on(sheet, '[data-reset]', () => { state.settings = mergeSettings(); apply(); openSettings(); });
  on(sheet, '[data-close]', () => { closeSheet(); render(); });
}

/** owner is a bake or starter ({ id, name }). */
function openAlarmSheet(owner, t, label) {
  const now = Date.now();
  const farOff = t - now > DAY;
  const both = !IS_ANDROID && !IS_IOS;
  openSheet(h`
    <h2>${esc(label)}</h2>
    <div class="serif" style="font-size:28px;margin:4px 0 12px">${fmtWhen(t, now)}</div>
    ${t < now ? h`<div class="notice">That time has passed.</div>` : farOff ? h`<div class="notice">That's more than a day away. A phone alarm has no date, so it would ring too soon. Use the calendar option for this one.</div>` : ''}
    <div class="stack">
      ${(IS_ANDROID || both) && !farOff && t >= now ? h`<a class="btn primary" href="${androidAlarmUrl(t, label)}">${bell()} Set phone alarm (Android)</a>` : ''}
      ${(IS_IOS || both) && !farOff && t >= now ? h`<a class="btn primary" href="${iosShortcutUrl(t, label)}">${bell()} Set phone alarm (iPhone)</a>` : ''}
      <button data-ics>${cal()} Add to calendar with alert</button>
      <button class="quiet" data-close>Cancel</button>
    </div>
    ${IS_IOS || both ? h`<p class="small muted" style="margin-top:12px">The iPhone button needs the one-time "${IOS_SHORTCUT_NAME}" shortcut. Setup steps are at the bottom of any bake page.</p>` : ''}
  `);
  on(sheet, '[data-ics]', () => { downloadIcs(owner, [{ t, label }], `${slug(label)}.ics`); closeSheet(); });
  on(sheet, '[data-close]', closeSheet);
  sheet.querySelectorAll('a.btn').forEach(a => a.addEventListener('click', () => setTimeout(closeSheet, 300)));
}

function alarmHelp() {
  return h`
    <details>
      <summary>Setting alarms on each phone</summary>
      <div class="small muted" style="margin-top:8px">
        <p><strong>Android.</strong> Tap Alarm on a step. The Clock app opens with the time and label filled in; tap Save.</p>
        <p><strong>iPhone.</strong> One-time setup in the Shortcuts app, then Alarm on a step creates the alarm directly.</p>
        <ol>
          <li>Open Shortcuts, tap +, and name the shortcut exactly <strong>${IOS_SHORTCUT_NAME}</strong>.</li>
          <li>Add the action <strong>Split Text</strong>. Input: Shortcut Input. Separator: Custom, <strong>|</strong></li>
          <li>Add <strong>Get Item from List</strong>: First Item. Then add another <strong>Get Item from List</strong> on the split text: Last Item.</li>
          <li>Add <strong>Create Alarm</strong>. Time: the first item. Label: the last item.</li>
          <li>Done. It receives text like <em>7:30 am|Stretch and fold 2</em>.</li>
        </ol>
        <p><strong>Either phone.</strong> "Add to calendar" downloads a calendar file with an alert at the exact minute. Open it and tap Add.</p>
      </div>
    </details>`;
}

/* ---------- Icons ---------- */
function gear() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`; }
function bell() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>`; }
function cal() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`; }
function chevron() { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>`; }
function shareIcon() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>`; }
function bookIcon() { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/></svg>`; }

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

/* ---------- Boot ---------- */
(function boot() {
  const m = location.hash.match(/#b=([A-Za-z0-9_-]+)/);
  if (m) {
    const shared = decodeBake(m[1]);
    history.replaceState(null, '', location.pathname + location.search);
    if (shared) {
      const existing = state.bakes.find(b => b.startAt === shared.startAt && b.name === shared.name);
      if (existing) {
        Object.assign(existing, { durs: shared.durs, done: shared.done, respectSleep: shared.respectSleep, overrides: shared.overrides,
          busy: shared.busy, withFeed: shared.withFeed, loaves: shared.loaves });
        state.view = { screen: 'bake', id: existing.id }; toast('Bake updated from link');
      } else {
        state.bakes.push(shared); state.view = { screen: 'bake', id: shared.id }; toast('Bake added from link');
      }
      save();
    }
  }
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
