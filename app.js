// Entry point: home screen, guide, routing between screens, shared-link import and start-up.
import { h, esc } from './format.js';
import { isFinished } from './schedule.js';
import { sortRecipes } from './recipes.js';
import { GUIDE, GUIDE_GROUPS } from './guide.js';
import { state, save, setRenderer, setSaveErrorHandler, bakeById, starterById, recipeById, activeStarters, goFrom, goBack } from './store.js';
import { app, on, tapOpen, toast, sheetOpen, setBackdropHandler, listLink, bookIcon, gear, chevron } from './ui.js';
import { renderBake, openNewBake, renderPastBakes, activeBakeCard, decodeBake } from './bake-view.js';
import { renderStarter, openNewStarter, renderPastStarters, starterCard } from './starter-view.js';
import { renderRecipes, renderRecipe, recipeCard, wireRecipeCards, openRecipeEditor } from './recipe-view.js';
import { openSettings } from './settings-view.js';

/* ============================================================
   Home
   ============================================================ */
function renderHome() {
  const now = Date.now();
  const active = state.bakes.filter(b => !isFinished(b)).sort((a, b) => a.startAt - b.startAt);
  const pastCount = state.bakes.length - active.length;
  const starters = activeStarters().sort((a, b) => a.createdAt - b.createdAt);
  const retiredCount = state.starters.length - starters.length;
  const recipes = sortRecipes(state.recipes);
  const pinned = recipes.filter(r => r.pinned);
  const shown = pinned.length ? pinned : recipes.slice(0, 3);

  app.innerHTML = h`
    <div class="topbar">
      <div class="left"><h1>Sourdough</h1></div>
      <div class="row">
        <button class="icon quiet" aria-label="How-to guide" data-act="guide">${bookIcon()}</button>
        <button class="icon quiet" aria-label="Settings" data-act="settings">${gear()}</button>
      </div>
    </div>

    <div class="section-head"><h2>Bakes</h2><button class="primary" data-act="new-bake">New bake</button></div>
    ${active.length === 0 ? h`<p class="muted">No bakes on the go. Plan one from now, or work back from when you want to eat.</p>` : ''}
    ${active.map(b => activeBakeCard(b, now)).join('')}
    ${pastCount ? listLink('past-bakes', 'Past bakes', pastCount) : ''}

    <div class="section-head"><h2>Starters</h2><button data-act="new-starter">New starter</button></div>
    ${starters.length === 0 ? h`<p class="muted">Track a starter from day one, or add the one you already have.</p>` : ''}
    ${starters.map(st => starterCard(st, now)).join('')}
    ${retiredCount ? listLink('past-starters', 'Past starters', retiredCount) : ''}

    <div class="section-head"><h2>Recipes</h2><button data-act="new-recipe">New recipe</button></div>
    ${recipes.length === 0 ? h`<p class="muted">Save the recipes you bake so you can pick one when you start a bake.</p>` : ''}
    ${shown.map(recipeCard).join('')}
    ${recipes.length ? listLink('recipes', 'All recipes', recipes.length) : ''}

    <div class="card tap guide-card" data-act="guide" role="button" tabindex="0" style="margin-top:22px">
      <div class="row">${bookIcon()}<h3>How-to guide</h3></div>
      <div class="small muted" style="margin-top:4px">Starters, flours, storage, hooch, dough, Dutch oven vs open baking, fixes and safety.</div>
    </div>
  `;
  tapOpen(app, '[data-open-bake]', el => goFrom({ screen: 'bake', id: el.dataset.openBake }));
  tapOpen(app, '[data-open-starter]', el => goFrom({ screen: 'starter', id: el.dataset.openStarter }));
  wireRecipeCards(app, renderHome);
  tapOpen(app, '.guide-card', () => goFrom({ screen: 'guide' }));
  on(app, '.topbar [data-act="guide"]', () => goFrom({ screen: 'guide' }));
  on(app, '[data-act="new-bake"]', () => openNewBake());
  on(app, '[data-act="new-starter"]', openNewStarter);
  on(app, '[data-act="new-recipe"]', () => openRecipeEditor(null));
  on(app, '[data-act="settings"]', openSettings);
  on(app, '[data-act="past-bakes"]', () => goFrom({ screen: 'past-bakes' }));
  on(app, '[data-act="past-starters"]', () => goFrom({ screen: 'past-starters' }));
  on(app, '[data-act="recipes"]', () => goFrom({ screen: 'recipes' }));
}

/* ============================================================
   Guide
   ============================================================ */
function renderGuide(openId) {
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
  on(app, '[data-act="back"]', goBack);
  if (openId) requestAnimationFrame(() => document.getElementById(`g-${openId}`)?.scrollIntoView({ block: 'start' }));
}

/* ============================================================
   Routing
   ============================================================ */
let tick = null;
function render() {
  clearInterval(tick);
  const v = state.view;
  if (v.screen === 'bake' && bakeById(v.id)) renderBake(bakeById(v.id));
  else if (v.screen === 'starter' && starterById(v.id)) renderStarter(starterById(v.id));
  else if (v.screen === 'recipe' && recipeById(v.id)) renderRecipe(recipeById(v.id));
  else if (v.screen === 'recipes') renderRecipes();
  else if (v.screen === 'past-bakes') renderPastBakes();
  else if (v.screen === 'past-starters') renderPastStarters();
  else if (v.screen === 'guide') renderGuide(v.open);
  else { state.view = { screen: 'home' }; renderHome(); }
  // Refresh countdowns on live screens, but never while a sheet is open or someone is typing.
  if (['home', 'bake', 'starter'].includes(state.view.screen)) {
    tick = setInterval(() => {
      const typing = app.contains(document.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
      if (!sheetOpen() && !typing) render();
    }, 30 * 1000);
  }
}
setRenderer(render);
setBackdropHandler(render);
setSaveErrorHandler(() => toast('Could not save on this device'));

/* ============================================================
   Start-up
   ============================================================ */
(function boot() {
  const m = location.hash.match(/#b=([A-Za-z0-9_-]+)/);
  if (m) {
    const shared = decodeBake(m[1]);
    history.replaceState(null, '', location.pathname + location.search);
    if (shared) {
      const existing = state.bakes.find(b => b.startAt === shared.startAt && b.name === shared.name);
      if (existing) {
        const { id, notes, rating, history, recipeId, starterId, ...incoming } = shared;
        Object.assign(existing, incoming);
        state.view = { screen: 'bake', id: existing.id }; toast('Bake updated from link');
      } else {
        state.bakes.push(shared); state.view = { screen: 'bake', id: shared.id }; toast('Bake added from link');
      }
      save();
    }
  }
  save(); // writes any migrated data straight away
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
