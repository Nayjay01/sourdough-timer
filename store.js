// App state, storage, migrations and navigation. Screens register a renderer with setRenderer.
import { clone } from './format.js';
import { DEFAULT_SETTINGS } from './schedule.js';
import { normalizeStarter } from './starter.js';
import { normalizeRecipe, recipeFromLegacy, recipeSnapshot, effectiveSettings } from './recipes.js';

const LS_KEY = 'sourdough.v1';

/** Saved settings over the defaults. Older versions kept one recipe and loaf flour weights here. */
export function mergeSettings(saved = {}) {
  const { recipe, loafFlour, ...rest } = saved;
  const fromFlour = loafFlour?.medium ? { small: loafFlour.small / loafFlour.medium, medium: 1, large: loafFlour.large / loafFlour.medium } : null;
  return {
    ...clone(DEFAULT_SETTINGS), ...rest,
    durs: { ...DEFAULT_SETTINGS.durs, ...(saved.durs || {}) },
    loafScale: { ...DEFAULT_SETTINGS.loafScale, ...(saved.loafScale || fromFlour || {}) },
  };
}

/** Fill in fields added after a bake was first saved. */
export function normalizeBake(b) {
  const out = {
    overrides: {}, busy: [], done: {}, withFeed: false, loaves: null, starterId: null, recipeId: null, recipeSnap: null,
    scales: null, late: {}, notes: [], rating: 0, history: [], ...b,
  };
  out.durs = { ...DEFAULT_SETTINGS.durs, ...(b.durs || {}) };
  // Bakes from before plans were kept are compared against themselves, so they report no false differences.
  if (!out.plan) out.plan = { ...out.durs };
  return out;
}

function load() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { s = {}; }
  const settings = mergeSettings(s.settings);
  const migrating = !Array.isArray(s.recipes);
  const recipes = migrating ? [recipeFromLegacy(s.settings?.recipe)] : s.recipes.map(normalizeRecipe);
  const bakes = (Array.isArray(s.bakes) ? s.bakes : []).map(normalizeBake);
  if (migrating) {
    // The old single recipe becomes "My usual", and bakes that used it point at it.
    const usual = recipes[0];
    for (const b of bakes) {
      if (b.loaves && !b.recipeSnap) { b.recipeId = usual.id; b.recipeSnap = recipeSnapshot(usual); b.scales = b.scales || { ...settings.loafScale }; }
    }
  }
  return {
    bakes,
    starters: Array.isArray(s.starters) ? s.starters.map(normalizeStarter) : [],
    recipes,
    settings,
    view: { screen: 'home' },
  };
}

export const state = load();

let onSaveError = () => {};
export function setSaveErrorHandler(fn) { onSaveError = fn; }
export function save() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ bakes: state.bakes, starters: state.starters, recipes: state.recipes, settings: state.settings }));
  } catch { onSaveError(); }
}

export const bakeById = id => state.bakes.find(b => b.id === id);
export const starterById = id => (id ? state.starters.find(s => s.id === id) : null);
export const recipeById = id => (id ? state.recipes.find(r => r.id === id) : null);
export const activeStarters = () => state.starters.filter(s => !s.retiredAt);
/** Settings with the bake's recipe timings applied. */
export const bakeSettings = bake => effectiveSettings(state.settings, bake.recipeSnap);

/* ---------- Navigation ---------- */
let renderer = () => {};
export function setRenderer(fn) { renderer = fn; }
export function render() { renderer(); }
export function go(view) { state.view = view; window.scrollTo(0, 0); renderer(); }
/** Open a screen that returns to the current one. */
export function goFrom(view) { go({ ...view, back: state.view }); }
export function goBack() { go(state.view.back || { screen: 'home' }); }
