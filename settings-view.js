// Settings sheet.
import { fmtDur, h, esc } from './format.js';
import { ALL_DEFS } from './schedule.js';
import { state, save, render, mergeSettings } from './store.js';
import { sheet, on, openSheet, closeSheet } from './ui.js';

export function openSettings() {
  const s = state.settings;
  const pair = (label, lo, hi, min, max, step) => h`
    <div>
      <div class="row spread"><span>${label}</span><span class="muted" id="pair-${lo}">${fmtDur(s[lo])} to ${fmtDur(s[hi])}</span></div>
      <div class="row">
        <input type="range" min="${min}" max="${max}" step="${step}" value="${s[lo]}" data-pair="${lo}" data-lo="${lo}" data-hi="${hi}" aria-label="${label} shortest">
        <input type="range" min="${min}" max="${max}" step="${step}" value="${s[hi]}" data-pair="${hi}" data-lo="${lo}" data-hi="${hi}" aria-label="${label} longest">
      </div>
    </div>`;
  const pct = size => Math.round(s.loafScale[size] * 100);
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

      <h3 style="margin-top:10px">Loaf sizes</h3>
      <div class="small muted">Recipes are written for a medium loaf. Small and large scale everything by these amounts.</div>
      <div class="row">
        <label class="field" style="flex:1">Small (% of medium)<input type="number" min="20" max="100" step="5" inputmode="numeric" value="${pct('small')}" data-scale="small" style="margin-top:4px"></label>
        <label class="field" style="flex:1">Large (% of medium)<input type="number" min="100" max="300" step="5" inputmode="numeric" value="${pct('large')}" data-scale="large" style="margin-top:4px"></label>
      </div>
      <label class="field">Starter kept after a bake feed (g)<input type="number" min="5" max="200" step="1" inputmode="numeric" value="${s.starterKeep}" data-keep style="margin-top:4px"></label>

      <h3 style="margin-top:10px">How far Fix it may bend</h3>
      <div>
        <div class="row spread"><span>Tightest gap between folds</span><span class="muted" id="foldmin-val">${s.foldMin} min</span></div>
        <input type="range" min="15" max="30" step="5" value="${s.foldMin}" data-foldmin aria-label="Tightest gap between folds">
      </div>
      ${pair('Bulk ferment', 'bulkMin', 'bulkMax', 120, 600, 15)}
      ${pair('Fridge proof', 'coldMin', 'coldMax', 240, 2160, 30)}

      <h3 style="margin-top:10px">Usual times for new bakes</h3>
      <p class="muted small" style="margin:0">Existing bakes keep their own times. A recipe can set its own first rest, fold gap, bulk and bake.</p>
      ${ALL_DEFS.filter(d => !d.flex).map(d => h`
        <div>
          <div class="row spread"><span>${esc(d.feed ? 'Starter feed to mixing' : d.name)}</span><span class="muted" id="set-${d.id}">${fmtDur(s.durs[d.id])}</span></div>
          <input type="range" min="${d.min}" max="${d.max}" step="${d.inc}" value="${s.durs[d.id]}" data-dur="${d.id}" aria-label="${esc(d.name)} usual duration">
        </div>`).join('')}
      <button class="quiet" data-reset>Reset to defaults</button>
      <button class="primary wide" data-close>Done</button>
    </div>
  `);
  // Every change saves and redraws the page underneath, so flags update straight away.
  const apply = () => { save(); render(); };
  sheet.querySelectorAll('[data-s]').forEach(i => i.onchange = () => { if (i.value) { s[i.dataset.s] = i.value; apply(); } });
  sheet.querySelectorAll('[data-scale]').forEach(i => i.onchange = () => {
    const v = Number(i.value);
    const ok = i.dataset.scale === 'small' ? v >= 20 && v <= 100 : v >= 100 && v <= 300;
    if (ok) { s.loafScale = { ...s.loafScale, [i.dataset.scale]: v / 100 }; apply(); }
  });
  sheet.querySelector('[data-keep]').onchange = e => { const n = Math.round(Number(e.target.value)); if (n >= 5 && n <= 200) { s.starterKeep = n; apply(); } };
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
  on(sheet, '[data-reset]', () => {
    if (!confirm('Reset sleep, loaf sizes, limits and usual times to the defaults? Recipes, bakes and starters are not touched.')) return;
    state.settings = mergeSettings(); apply(); openSettings();
  });
  on(sheet, '[data-close]', () => { closeSheet(); render(); });
}
