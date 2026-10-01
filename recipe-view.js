// Recipe screens: the list with pins, a recipe's page with its bakes and notes, and the editor.
import { fmtDate, fmtDur, grams, h, esc, clone } from './format.js';
import { bakeTimeline, readyAt, isFinished } from './schedule.js';
import {
  TIMING_FIELDS, newRecipe, totalFlour, hydration, doughWeight, recipeLine, sortRecipes,
} from './recipes.js';
import { state, save, go, goFrom, goBack, recipeById } from './store.js';
import { app, sheet, on, keepScroll, tapOpen, openSheet, closeSheet, toast, notesBlock, wireNotes, starsHtml, chevron, pinIcon } from './ui.js';
import { openNewBake, pastBakeCard, activeBakeCard } from './bake-view.js';

/** Bakes made with a recipe and the average of their ratings. */
function recipeStats(r) {
  const bakes = state.bakes.filter(b => b.recipeId === r.id);
  const rated = bakes.filter(b => b.rating > 0);
  return { bakes, count: bakes.length, avg: rated.length ? Math.round(rated.reduce((a, b) => a + b.rating, 0) / rated.length) : 0 };
}

/** Card for a recipe in a list, with a pin button. */
export function recipeCard(r) {
  const st = recipeStats(r);
  return h`
    <div class="card tap recipe-card" data-open-recipe="${r.id}" role="button" tabindex="0">
      <div class="row spread">
        <h3>${esc(r.name)}</h3>
        <button class="icon quiet pin ${r.pinned ? 'on' : ''}" data-pin="${r.id}" aria-label="${r.pinned ? 'Unpin' : 'Pin'} ${esc(r.name)}" aria-pressed="${r.pinned}">${pinIcon(r.pinned)}</button>
      </div>
      <div class="small muted">${esc(recipeLine(r))}</div>
      ${st.count ? h`<div class="small" style="margin-top:6px">${starsHtml(st.avg)} <span class="muted">${st.count} bake${st.count > 1 ? 's' : ''}</span></div>` : ''}
    </div>`;
}
/** Wire recipe cards in `root`: open on tap, pin toggles in place. */
export function wireRecipeCards(root, rerender) {
  root.querySelectorAll('[data-pin]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const r = recipeById(b.dataset.pin);
    r.pinned = !r.pinned; save(); rerender();
    toast(r.pinned ? `Pinned ${r.name}` : `Unpinned ${r.name}`);
  });
  tapOpen(root, '[data-open-recipe]', el => goFrom({ screen: 'recipe', id: el.dataset.openRecipe }));
}

let filterText = '';
export function renderRecipes() {
  const all = sortRecipes(state.recipes);
  const q = filterText.trim().toLowerCase();
  const list = q ? all.filter(r => `${r.name} ${recipeLine(r)}`.toLowerCase().includes(q)) : all;
  keepScroll(() => {
    app.innerHTML = h`
      <div class="topbar">
        <div class="left"><button class="icon quiet" aria-label="Back" data-act="back">${chevron()}</button><h1>Recipes</h1></div>
        <button class="primary" data-act="new-recipe">New recipe</button>
      </div>
      ${all.length >= 6 ? h`<input type="search" placeholder="Find a recipe" value="${esc(filterText)}" data-filter aria-label="Find a recipe" style="margin-bottom:14px">` : ''}
      <p class="small muted">Pinned recipes stay at the top here and show on the home screen.</p>
      ${list.length ? list.map(recipeCard).join('') : h`<p class="muted">${all.length ? 'No recipes match.' : 'No recipes yet.'}</p>`}
    `;
  });
  on(app, '[data-act="back"]', () => { filterText = ''; goBack(); });
  on(app, '[data-act="new-recipe"]', () => openRecipeEditor(null));
  const f = app.querySelector('[data-filter]');
  if (f) f.oninput = () => { filterText = f.value; renderRecipes(); const g = app.querySelector('[data-filter]'); g.focus(); g.setSelectionRange(g.value.length, g.value.length); };
  wireRecipeCards(app, renderRecipes);
}

export function renderRecipe(r) {
  const sc = state.settings.loafScale;
  const flour = totalFlour(r);
  const st = recipeStats(r);
  const timings = TIMING_FIELDS.filter(f => r.timings?.[f.key] > 0);
  const bakes = st.bakes.slice().sort((a, b) => b.startAt - a.startAt);
  keepScroll(() => {
    app.innerHTML = h`
      <div class="topbar">
        <div class="left"><button class="icon quiet" aria-label="Back" data-act="back">${chevron()}</button><h1>${esc(r.name)}</h1></div>
        <button class="icon quiet pin ${r.pinned ? 'on' : ''}" data-act="pin" aria-label="${r.pinned ? 'Unpin' : 'Pin'}" aria-pressed="${r.pinned}">${pinIcon(r.pinned)}</button>
      </div>
      ${st.count ? h`<div class="small" style="margin:-8px 0 14px">${starsHtml(st.avg)} <span class="muted">${st.count} bake${st.count > 1 ? 's' : ''}</span></div>` : ''}
      <div class="card">
        <div class="row spread"><h3>Medium loaf</h3><span class="small muted">${Math.round(hydration(r) * 100)}% hydration</span></div>
        <div class="recipe-grid" style="margin-top:10px">
          <span>Starter</span><strong>${grams(r.starter)}</strong>
          ${r.flours.map(f => h`<span>${esc(f.name)}</span><strong>${grams(f.g)}</strong>`).join('')}
          <span>Warm water</span><strong>${grams(r.water)}</strong>
          <span>Salt</span><strong>${grams(r.salt)}</strong>
          ${(r.extras || []).map(x => h`<span>${esc(x.name)}</span><strong>${grams(x.g)}</strong>`).join('')}
        </div>
        <div class="small muted" style="margin-top:8px">About ${grams(doughWeight(r))} of dough. Small loaves use ${grams(flour * sc.small)} flour, large ${grams(flour * sc.large)}; everything else scales with it.</div>
      </div>
      <div class="card">
        <h3>Timings</h3>
        <div class="small" style="margin-top:6px">${timings.length
          ? esc(timings.map(f => `${f.label} ${fmtDur(r.timings[f.key])}`).join(' · '))
          : '<span class="muted">Uses your usual timings from Settings.</span>'}</div>
      </div>
      <div class="row" style="margin-bottom:12px">
        <button class="primary" data-act="bake" style="flex:1">Bake this</button>
        <button data-act="edit">Edit</button>
        <button data-act="copy">Duplicate</button>
      </div>
      <div class="card">
        <h3>Notes</h3>
        <div style="margin-top:10px">${notesBlock(`rc-${r.id}`, r.notes, 'Where it came from, tweaks to try, what works…')}</div>
      </div>
      <div class="section-head"><h2>Bakes with this recipe</h2></div>
      ${bakes.length ? bakes.map(b => (isFinished(b) ? pastBakeCard(b) : activeBakeCard(b))).join('') : h`<p class="muted">None yet. Bakes made with it will show here with their ratings and notes.</p>`}
      <div class="stack" style="margin-top:22px">
        <button class="quiet" data-act="delete" style="color:var(--warn)">Delete this recipe</button>
      </div>
    `;
  });
  const commit = () => { save(); keepScroll(() => renderRecipe(r)); };
  on(app, '[data-act="back"]', goBack);
  on(app, '[data-act="pin"]', () => { r.pinned = !r.pinned; commit(); toast(r.pinned ? 'Pinned' : 'Unpinned'); });
  on(app, '[data-act="bake"]', () => openNewBake({ recipeId: r.id }));
  on(app, '[data-act="edit"]', () => openRecipeEditor(r));
  on(app, '[data-act="copy"]', () => {
    const { name, starter, flours, water, salt, extras, timings } = clone(r);
    const copy = newRecipe({ name: `${name} (copy)`, starter, flours, water, salt, extras, timings });
    state.recipes.push(copy); save();
    go({ screen: 'recipe', id: copy.id, back: state.view.back });
    toast('Copied. Edit it to make your variation.', 3000);
  });
  on(app, '[data-act="delete"]', () => {
    const msg = st.count ? `Delete "${r.name}"? Its ${st.count} bake${st.count > 1 ? 's' : ''} keep their own copy of the ingredients.` : `Delete "${r.name}"?`;
    if (!confirm(msg)) return;
    state.recipes = state.recipes.filter(x => x.id !== r.id);
    state.bakes.forEach(b => { if (b.recipeId === r.id) b.recipeId = null; });
    save(); goBack();
  });
  tapOpen(app, '[data-open-bake]', el => goFrom({ screen: 'bake', id: el.dataset.openBake }));
  wireNotes(app, `rc-${r.id}`, r.notes, commit);
}

/** Create a recipe (r is null) or edit one. */
function openRecipeEditor(r) {
  const base = r || newRecipe({ name: '' });
  const draft = clone({ name: base.name, starter: base.starter, flours: base.flours, water: base.water, salt: base.salt, extras: base.extras || [], timings: base.timings || {} });
  if (!draft.flours.length) draft.flours.push({ name: 'Bread flour', g: 0 });
  const usual = state.settings.durs;
  const usualFor = f => fmtDur(usual[f.steps[0]]);
  const timingValue = f => {
    const v = draft.timings[f.key];
    if (!(v > 0)) return '';
    return f.unit === 'h' ? String(Math.round((v / 60) * 100) / 100) : String(v);
  };
  const num = (label, path, value, step = 1) => h`
    <label class="field" style="flex:1">${label}<input type="number" min="0" step="${step}" inputmode="decimal" value="${value}" data-num="${path}" style="margin-top:4px"></label>`;
  const listRows = (key, items, namePh) => items.map((x, i) => h`
    <div class="ingredient-row">
      <input type="text" value="${esc(x.name)}" placeholder="${esc(namePh)}" data-list="${key}" data-i="${i}" data-k="name" aria-label="Name">
      <input type="number" min="0" step="1" inputmode="decimal" value="${x.g || ''}" placeholder="g" data-list="${key}" data-i="${i}" data-k="g" aria-label="Grams">
      <button class="icon quiet" data-remove="${key}" data-i="${i}" aria-label="Remove">✕</button>
    </div>`).join('');
  const draw = () => {
    openSheet(h`
      <h2>${r ? 'Edit recipe' : 'New recipe'}</h2>
      <div class="stack" style="margin-top:14px">
        <label class="field">Name<input type="text" value="${esc(draft.name)}" placeholder="e.g. 20% wholemeal" data-name style="margin-top:4px"></label>
        <h3 style="margin-top:6px">For one medium loaf</h3>
        <div class="row">${num('Starter (g)', 'starter', draft.starter)}${num('Water (g)', 'water', draft.water)}${num('Salt (g)', 'salt', draft.salt)}</div>
        <div class="field">Flours</div>
        ${listRows('flours', draft.flours, 'Bread flour')}
        <button class="quiet" data-add="flours" style="align-self:flex-start">+ Add a flour</button>
        <div class="field">Extras <span class="small">(seeds, oil, honey…)</span></div>
        ${listRows('extras', draft.extras, 'Sunflower seeds')}
        <button class="quiet" data-add="extras" style="align-self:flex-start">+ Add an extra</button>
        <div class="small muted" data-summary>${esc(summary())}</div>

        <h3 style="margin-top:6px">Timings <span class="small muted">(optional)</span></h3>
        <div class="small muted">Leave blank to use your usual times. Whatever you set here is used when you bake this recipe.</div>
        ${TIMING_FIELDS.map(f => h`
          <label class="field">${f.label} (${f.unit === 'h' ? 'hours' : 'minutes'})
            <input type="number" min="0" step="${f.unit === 'h' ? 0.25 : 5}" inputmode="decimal" value="${timingValue(f)}" placeholder="usual: ${usualFor(f)}" data-timing="${f.key}" data-unit="${f.unit}" style="margin-top:4px">
          </label>`).join('')}
        <button class="primary wide" data-save>${r ? 'Save changes' : 'Add recipe'}</button>
        <button class="quiet" data-close>Cancel</button>
      </div>
    `);
    const refreshSummary = () => { sheet.querySelector('[data-summary]').textContent = summary(); };
    sheet.querySelector('[data-name]').oninput = e => { draft.name = e.target.value; };
    sheet.querySelectorAll('[data-num]').forEach(i => i.oninput = () => { draft[i.dataset.num] = Number(i.value) || 0; refreshSummary(); });
    sheet.querySelectorAll('[data-list]').forEach(i => i.oninput = () => {
      const item = draft[i.dataset.list][Number(i.dataset.i)];
      item[i.dataset.k] = i.dataset.k === 'g' ? Number(i.value) || 0 : i.value;
      refreshSummary();
    });
    sheet.querySelectorAll('[data-timing]').forEach(i => i.oninput = () => {
      const v = Number(i.value);
      draft.timings[i.dataset.timing] = v > 0 ? Math.round(i.dataset.unit === 'h' ? v * 60 : v) : 0;
    });
    sheet.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { draft[b.dataset.add].push({ name: '', g: 0 }); draw(); });
    sheet.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => { draft[b.dataset.remove].splice(Number(b.dataset.i), 1); draw(); });
    on(sheet, '[data-close]', closeSheet);
    on(sheet, '[data-save]', () => {
      const name = draft.name.trim();
      const flours = draft.flours.filter(f => f.g > 0).map(f => ({ name: f.name.trim() || 'Flour', g: f.g }));
      const extras = draft.extras.filter(x => x.g > 0 && x.name.trim()).map(x => ({ name: x.name.trim(), g: x.g }));
      if (!name) { toast('Give the recipe a name'); return; }
      if (!flours.length) { toast('Add at least one flour with a weight'); return; }
      if (!(draft.water > 0) || !(draft.starter > 0)) { toast('Starter and water need a weight'); return; }
      const timings = Object.fromEntries(Object.entries(draft.timings).filter(([, v]) => v > 0));
      const fields = { name, starter: draft.starter, flours, water: draft.water, salt: draft.salt || 0, extras, timings };
      if (r) { Object.assign(r, fields); save(); closeSheet(); renderRecipe(r); toast('Recipe saved'); }
      else {
        const created = newRecipe(fields);
        state.recipes.push(created); save(); closeSheet();
        goFrom({ screen: 'recipe', id: created.id }); toast('Recipe added');
      }
    });
  };
  function summary() {
    const probe = { ...draft, flours: draft.flours.filter(f => f.g > 0), extras: draft.extras.filter(x => x.g > 0) };
    const f = totalFlour(probe);
    return f ? `${Math.round(f)} g flour in total, ${Math.round((probe.water / f) * 100)}% hydration, about ${grams(doughWeight(probe))} of dough.` : 'Add a flour weight to see hydration.';
  }
  draw();
}
export { openRecipeEditor };
