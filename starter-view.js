// Starter screens: status, ladder, feed log with late logging and gaps, journal, retiring.
import { MIN, HOUR, fmtWhen, fmtDate, fmtDur, fmtCountdown, fmtAgo, toLocalInput, grams, ratioText, h, esc } from './format.js';
import { PEAK_HOURS, BAKE_FEED_RATIOS } from './schedule.js';
import {
  LADDERS, DOUBLINGS_PER_STAGE, PHASE_LABEL, ALIVE_SIGNS, HUNGRY_SIGNS, PEAK_SIGNS, newStarter, lastFeed, dayNumber,
  doublingsAt, stageIndex, currentRatio, feedAmounts, logFeed, undoLastFeed, startStrengthening, setFridge, statusOf,
  createGuidance, dueAt, feedGaps,
} from './starter.js';
import { state, save, go, goFrom, goBack } from './store.js';
import {
  app, sheet, on, keepScroll, tapOpen, openSheet, closeSheet, toast, guideLink, wireGuideLinks, notesBlock, wireNotes,
  openAlarmSheet, chevron, bookIcon, bell,
} from './ui.js';
import { starterPhaseText } from './bake-view.js';

/** Card for a starter in a list. */
export function starterCard(st, now = Date.now()) {
  if (st.retiredAt) {
    return h`
      <div class="card tap" data-open-starter="${st.id}" role="button" tabindex="0">
        <div class="row spread"><h3>${esc(st.name)}</h3><span class="small muted">Retired ${fmtDate(st.retiredAt)}</span></div>
        <div class="small muted">${esc(PHASE_LABEL[st.phase])} · ${st.feeds.length} feed${st.feeds.length === 1 ? '' : 's'} logged</div>
      </div>`;
  }
  const s = statusOf(st, now);
  const when = s.nextAt ?? s.peakAt;
  return h`
    <div class="card tap" data-open-starter="${st.id}" role="button" tabindex="0">
      <div class="row spread"><h3>${esc(st.name)}</h3><span class="small muted">${esc(phaseLine(st))}</span></div>
      <div style="margin-top:8px" class="row spread">
        <span class="serif" style="font-size:19px">${esc(s.title)}</span>
        ${when && s.state !== 'hungry' ? h`<span class="${when < now ? 'warn' : 'accent'}">${fmtCountdown(when - now)}</span>` : ''}
      </div>
    </div>`;
}
function phaseLine(st) {
  return st.phase === 'strengthen' ? `Strengthening at ${ratioText(currentRatio(st))}` : starterPhaseText(st);
}

export function renderStarter(st) {
  const now = Date.now();
  const retired = !!st.retiredAt;
  const status = statusOf(st, now);
  const last = lastFeed(st);
  const when = status.nextAt ?? status.peakAt;
  const whenLabel = status.nextAt ? (st.fridge ? 'Weekly feed' : 'Next feed') : 'Peak';
  const r = currentRatio(st);
  const amounts = feedAmounts(st, r);
  const gaps = feedGaps(st);

  let phaseHtml = '';
  if (retired) {
    phaseHtml = '';
  } else if (st.phase === 'create') {
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

  const feedRows = st.feeds.map((f, i) => ({ f, i })).reverse().slice(0, 40).map(({ f, i }) => h`
    <div class="feed-row">
      <div><div>${fmtWhen(f.t, now)}</div><div class="small muted">${f.r ? `${ratioText(f.r)} · ${grams(f.starter)} + ${grams(f.flour)} + ${grams(f.water)}` : `${grams(f.flour)} flour + ${grams(f.water)} water`}${f.note ? ` · ${esc(f.note)}` : ''}</div></div>
      <span class="doubled ${f.doubled === true ? 'yes' : f.doubled === false ? 'no' : ''}">${f.doubled === true ? 'Doubled' : f.doubled === false ? 'Didn’t double' : ''}</span>
    </div>
    ${gaps[i] ? h`<div class="gap-row small">${gaps[i].days} days between feeds, about ${gaps[i].missed} missed</div>` : ''}`).join('');

  keepScroll(() => {
    app.innerHTML = h`
      <div class="topbar">
        <div class="left">
          <button class="icon quiet" aria-label="Back" data-act="back">${chevron()}</button>
          <h1>${esc(st.name)}</h1>
        </div>
        <button class="icon quiet" aria-label="How-to guide" data-act="guide">${bookIcon()}</button>
      </div>
      ${retired ? h`
        <div class="notice">
          <div><strong>Retired ${fmtDate(st.retiredAt)}.</strong> Its feeds and journal are kept here.</div>
          <button data-act="unretire" style="margin-top:10px">Bring it back</button>
        </div>` : h`
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
      </details>`}
      <div class="card">
        <h3>Journal</h3>
        <div style="margin-top:10px">${notesBlock(`st-${st.id}`, st.notes, 'Flour changes, where it lives, how it smells…')}</div>
      </div>
      <div class="section-head"><h2>Feeds</h2>${!retired && st.feeds.length > (st.feeds[0]?.r === 0 ? 1 : 0) ? h`<button class="quiet" data-act="undo">Undo last</button>` : ''}</div>
      ${st.feeds.length ? feedRows : h`<p class="muted">No feeds yet.</p>`}
      <div class="stack" style="margin-top:22px">
        <div class="row">
          <label class="field" style="flex:2">Name<input type="text" value="${esc(st.name)}" data-name style="margin-top:4px"></label>
          <label class="field" style="flex:1">Keep (g)<input type="number" min="5" max="200" step="1" inputmode="numeric" value="${st.keep}" data-keep style="margin-top:4px"></label>
        </div>
        ${retired ? '' : h`<button class="quiet" data-act="retire">Retire this starter</button>`}
        <button class="quiet" data-act="delete" style="color:var(--warn)">Delete this starter</button>
      </div>
    `;
  });

  const commit = () => { save(); keepScroll(() => renderStarter(st)); };
  on(app, '[data-act="back"]', goBack);
  on(app, '[data-act="guide"]', () => goFrom({ screen: 'guide' }));
  on(app, '[data-act="alive"]', () => openLadderSheet(st, true));
  on(app, '[data-act="ladder"]', () => openLadderSheet(st, false));
  on(app, '[data-act="fridge"]', () => { setFridge(st, !st.fridge); commit(); });
  on(app, '[data-act="log"]', () => openFeedSheet(st));
  on(app, '[data-act="remind"]', () => openAlarmSheet(st, when, status.nextAt ? `Feed ${st.name}` : `${st.name} near peak`));
  on(app, '[data-act="undo"]', () => { if (undoLastFeed(st)) { commit(); toast('Last feed removed'); } });
  on(app, '[data-act="retire"]', () => {
    if (!confirm(`Retire "${st.name}"? It moves to Past starters with its history, and you can bring it back any time.`)) return;
    st.retiredAt = Date.now(); commit(); toast('Moved to Past starters');
  });
  on(app, '[data-act="unretire"]', () => { st.retiredAt = null; commit(); toast('Welcome back'); });
  on(app, '[data-act="delete"]', () => {
    if (confirm(`Delete "${st.name}" and its feed history? Retiring keeps the history instead.`)) {
      state.starters = state.starters.filter(s => s.id !== st.id);
      state.bakes.forEach(b => { if (b.starterId === st.id) b.starterId = null; });
      save(); goBack();
    }
  });
  app.querySelector('[data-name]').onchange = e => { const v = e.target.value.trim(); if (v) { st.name = v; commit(); } };
  app.querySelector('[data-keep]').onchange = e => { const v = Math.round(Number(e.target.value)); if (v >= 5 && v <= 200) { st.keep = v; commit(); } };
  wireNotes(app, `st-${st.id}`, st.notes, commit);
  wireGuideLinks(app);
}

function openFeedSheet(st) {
  const now0 = Date.now();
  const prev = lastFeed(st);
  const due = dueAt(st, now0);
  const overdue = due && now0 - due > HOUR;
  // When a feed is logged well after it was due, ask whether it happened on time.
  const draft = { doubled: undefined, r: currentRatio(st), when: overdue ? null : 'now', t: now0, note: '', backInFridge: st.fridge };
  const feedTime = () => ({ now: Date.now(), due, pick: draft.t }[draft.when]);
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
        ${overdue ? h`
          <div>
            <div class="field">When did you feed it? It was due ${fmtWhen(due)}.</div>
            <div class="seg" role="group" aria-label="When it was fed">
              <button data-when="now" aria-pressed="${draft.when === 'now'}">Just now</button>
              <button data-when="due" aria-pressed="${draft.when === 'due'}">When due</button>
              <button data-when="pick" aria-pressed="${draft.when === 'pick'}">Pick a time</button>
            </div>
          </div>` : ''}
        ${!overdue || draft.when === 'pick' ? h`<label class="field">Fed at<input type="datetime-local" value="${toLocalInput(draft.t)}" data-t style="margin-top:4px"></label>` : ''}
        <label class="field">Note (optional)<input type="text" value="${esc(draft.note)}" placeholder="Smell, flour used, temperature…" data-note style="margin-top:4px"></label>
        ${st.fridge ? h`<label class="switch"><span>Going back in the fridge</span><input type="checkbox" ${draft.backInFridge ? 'checked' : ''} data-fridge></label>` : ''}
        <button class="primary wide" data-save>Save feed</button>
        <button class="quiet" data-close>Cancel</button>
      </div>
    `);
    sheet.querySelectorAll('[data-dbl]').forEach(b => b.onclick = () => { draft.doubled = { yes: true, no: false, unsure: null }[b.dataset.dbl]; draw(); });
    sheet.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { draft.r = Number(b.dataset.r); draw(); });
    sheet.querySelectorAll('[data-when]').forEach(b => b.onclick = () => { draft.when = b.dataset.when; if (draft.when === 'pick') draft.t = due; draw(); });
    const ti = sheet.querySelector('[data-t]');
    if (ti) ti.onchange = e => { const t = new Date(e.target.value).getTime(); if (!isNaN(t)) { draft.t = t; if (!overdue) draft.when = 'pick'; } };
    sheet.querySelector('[data-note]').oninput = e => { draft.note = e.target.value; };
    const fr = sheet.querySelector('[data-fridge]');
    if (fr) fr.onchange = e => { draft.backInFridge = e.target.checked; };
    on(sheet, '[data-close]', closeSheet);
    on(sheet, '[data-save]', () => {
      if (!draft.when) { toast('Choose when you fed it'); return; }
      const t = feedTime();
      if (t > Date.now() + 5 * MIN) { toast('That time is in the future'); return; }
      if (prev && t < prev.t) { toast(`That's before the last feed (${fmtWhen(prev.t)})`); return; }
      const res = logFeed(st, { t, r: st.phase === 'mature' ? draft.r : undefined, doubled: draft.doubled, note: draft.note.trim() });
      if (st.fridge) { if (draft.backInFridge) st.fridgeSince = t; else setFridge(st, false); }
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

export function openNewStarter() {
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

export function renderPastStarters() {
  const list = state.starters.filter(s => s.retiredAt).sort((a, b) => b.retiredAt - a.retiredAt);
  app.innerHTML = h`
    <div class="topbar"><div class="left">
      <button class="icon quiet" aria-label="Back" data-act="back">${chevron()}</button><h1>Past starters</h1>
    </div></div>
    ${list.length ? list.map(st => starterCard(st)).join('') : h`<p class="muted">Retired starters land here with their history.</p>`}
  `;
  on(app, '[data-act="back"]', goBack);
  tapOpen(app, '[data-open-starter]', el => goFrom({ screen: 'starter', id: el.dataset.openStarter }));
}
