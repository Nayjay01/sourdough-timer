// Bread recipes: ingredients for one medium loaf, optional timings, and scaling to a set of loaves.
// Pure functions only; the UI lives in app.js.
import { uid, clone } from './format.js';
import { LOAF_SIZES } from './schedule.js';

/** Timings a recipe may set. Values are stored in minutes; blank means "use my usual settings". */
export const TIMING_FIELDS = [
  { key: 'rest', label: 'First rest', unit: 'min', steps: ['rest'] },
  { key: 'fold', label: 'Time between folds', unit: 'min', steps: ['fold1', 'fold2', 'fold3', 'fold4'] },
  { key: 'bulk', label: 'Bulk ferment', unit: 'h', steps: ['bulk'] },
  { key: 'bake', label: 'Bake', unit: 'min', steps: ['bake'] },
];

export const DEFAULT_RECIPE = { starter: 100, flours: [{ name: 'Bread flour', g: 500 }], water: 350, salt: 10, extras: [] };

export function normalizeRecipe(r) {
  return { pinned: false, lastUsedAt: null, ...clone(DEFAULT_RECIPE), timings: {}, notes: [], ...r };
}
export function newRecipe(fields = {}, now = Date.now()) {
  return normalizeRecipe({ id: uid(), name: 'New recipe', createdAt: now, ...fields });
}
/** The single recipe that used to live in Settings becomes "My usual". */
export function recipeFromLegacy(rec = {}, now = Date.now()) {
  const r = { ...{ starter: 100, flour: 500, water: 350, salt: 10 }, ...rec };
  return newRecipe({ name: 'My usual', pinned: true, starter: r.starter, flours: [{ name: 'Bread flour', g: r.flour }], water: r.water, salt: r.salt }, now);
}
/** Copy of what a bake needs, so later edits to the recipe don't rewrite past bakes. */
export function recipeSnapshot(r) {
  const { id, name, starter, flours, water, salt, extras, timings } = r;
  return clone({ id, name, starter, flours, water, salt, extras, timings });
}

export function totalFlour(r) { return (r.flours || []).reduce((a, f) => a + (Number(f.g) || 0), 0); }
export function hydration(r) { const f = totalFlour(r); return f ? r.water / f : 0; }
export function doughWeight(r) {
  return r.starter + totalFlour(r) + r.water + r.salt + (r.extras || []).reduce((a, x) => a + (Number(x.g) || 0), 0);
}

/**
 * Ingredients for a set of loaves. loaves = { small: n, medium: n, large: n },
 * scales = { small: 0.7, medium: 1, large: 1.5 } relative to the recipe's medium loaf.
 */
export function scaleRecipe(r, loaves, scales) {
  const items = [];
  for (const size of LOAF_SIZES) {
    for (let i = 0; i < (loaves[size] || 0); i++) items.push({ size, k: scales[size], dough: doughWeight(r) * scales[size] });
  }
  const K = items.reduce((a, i) => a + i.k, 0);
  const scaleList = list => (list || []).map(x => ({ name: x.name, g: (Number(x.g) || 0) * K }));
  const total = {
    starter: r.starter * K, flours: scaleList(r.flours), water: r.water * K, salt: r.salt * K, extras: scaleList(r.extras),
    flour: totalFlour(r) * K, dough: doughWeight(r) * K,
  };
  return { items, total, K, hydration: hydration(r) };
}

/** One-line summary, e.g. "100 g starter · 500 g bread flour · 350 g water · 10 g salt". */
export function recipeLine(r) {
  const flours = r.flours || [];
  const flourText = flours.length === 1
    ? `${Math.round(flours[0].g)} g ${flours[0].name.toLowerCase()}`
    : `${Math.round(totalFlour(r))} g flour (${flours.map(f => f.name.toLowerCase()).join(', ')})`;
  const extras = (r.extras || []).length ? ` · ${r.extras.map(x => x.name.toLowerCase()).join(', ')}` : '';
  return `${Math.round(r.starter)} g starter · ${flourText} · ${Math.round(r.water)} g water · ${Math.round(r.salt)} g salt${extras}`;
}

/** Settings with a recipe's own timings applied, widening Fix it limits so they still make sense. */
export function effectiveSettings(settings, r) {
  const t = r?.timings || {};
  if (!Object.values(t).some(v => v > 0)) return settings;
  const durs = { ...settings.durs };
  for (const f of TIMING_FIELDS) if (t[f.key] > 0) f.steps.forEach(id => { durs[id] = t[f.key]; });
  const s = { ...settings, durs };
  if (t.bulk > 0) { s.bulkMin = Math.min(settings.bulkMin, t.bulk - 60); s.bulkMax = Math.max(settings.bulkMax, t.bulk + 60); }
  if (t.fold > 0) s.foldMin = Math.min(settings.foldMin, t.fold);
  return s;
}

/** Pinned first, then most recently used or added, then by name. */
export function sortRecipes(list) {
  return list.slice().sort((a, b) =>
    (b.pinned - a.pinned) || ((b.lastUsedAt || b.createdAt || 0) - (a.lastUsedAt || a.createdAt || 0)) || a.name.localeCompare(b.name));
}
