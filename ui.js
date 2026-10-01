// Shared UI pieces: sheets, toasts, notes, ratings, alarms, icons.
import { MIN, DAY, fmtTime, fmtWhen, h, esc, slug } from './format.js';
import { state, goFrom } from './store.js';

export const app = document.getElementById('app');
export const sheet = document.getElementById('sheet');
const backdrop = document.getElementById('backdrop');

export function on(root, sel, fn) { const el = root.querySelector(sel); if (el) el.onclick = fn; }
export function keepScroll(fn) { const y = window.scrollY; fn(); window.scrollTo(0, y); }
/** Cards that open something on tap or Enter/Space. */
export function tapOpen(root, sel, fn) {
  root.querySelectorAll(sel).forEach(el => {
    el.addEventListener('click', e => { if (!e.target.closest('button, a, input, select, textarea') || e.target === el) fn(el); });
    el.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); fn(el); } });
  });
}
export function fmtSleep() {
  const f = hm => { const [H, M] = hm.split(':').map(Number); const d = new Date(); d.setHours(H, M, 0, 0); return fmtTime(d.getTime()); };
  return `${f(state.settings.sleepStart)}–${f(state.settings.sleepEnd)}`;
}

/* ---------- Sheets ---------- */
let onBackdrop = () => {};
export function setBackdropHandler(fn) { onBackdrop = fn; }
export function openSheet(html) {
  sheet.innerHTML = `<div class="handle"></div>${html}`;
  sheet.classList.add('open'); backdrop.classList.add('open');
  sheet.scrollTop = 0;
}
export function closeSheet() { sheet.classList.remove('open'); backdrop.classList.remove('open'); }
export function sheetOpen() { return sheet.classList.contains('open'); }
backdrop.onclick = () => { closeSheet(); onBackdrop(); };

/* ---------- Toast ---------- */
let toastTimer;
export function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/* ---------- Guide links ---------- */
export function guideLink(id, text) { return h`<button class="linkish" data-guide="${id}">${esc(text)}</button>`; }
export function wireGuideLinks(root) {
  root.querySelectorAll('[data-guide]').forEach(b => b.onclick = () => { closeSheet(); goFrom({ screen: 'guide', open: b.dataset.guide }); });
}

/* ---------- Notes ---------- */
// Unsaved text survives the 30-second refresh and moving between screens.
const noteDrafts = {};

/** A box for adding notes, then the notes newest first. key must be letters, digits and dashes. */
export function notesBlock(key, notes, placeholder = 'Add a note…') {
  const list = notes.map((n, i) => ({ ...n, i })).reverse();
  return h`
    <div class="notes" data-notes="${key}">
      <textarea rows="2" data-note-input placeholder="${esc(placeholder)}" aria-label="New note">${esc(noteDrafts[key] || '')}</textarea>
      <div class="row" style="justify-content:flex-end"><button data-note-add>Add note</button></div>
      ${list.map(n => h`
        <div class="note">
          <div class="row spread"><span class="small muted">${fmtWhen(n.t)}</span><button class="quiet small" data-note-edit="${n.i}">Edit</button></div>
          <div class="note-text">${esc(n.text)}</div>
        </div>`).join('')}
    </div>`;
}
export function wireNotes(root, key, notes, onChange) {
  const box = root.querySelector(`[data-notes="${key}"]`);
  if (!box) return;
  const ta = box.querySelector('[data-note-input]');
  ta.oninput = () => { noteDrafts[key] = ta.value; };
  box.querySelector('[data-note-add]').onclick = () => {
    const text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    notes.push({ t: Date.now(), text });
    delete noteDrafts[key];
    onChange(); toast('Note added');
  };
  box.querySelectorAll('[data-note-edit]').forEach(b => b.onclick = () => openNoteSheet(notes, Number(b.dataset.noteEdit), onChange));
}
function openNoteSheet(notes, i, onChange) {
  openSheet(h`
    <h2>Edit note</h2>
    <div class="small muted" style="margin-top:4px">${fmtWhen(notes[i].t)}</div>
    <div class="stack" style="margin-top:12px">
      <textarea rows="6" data-text aria-label="Note">${esc(notes[i].text)}</textarea>
      <button class="primary wide" data-save>Save note</button>
      <button class="quiet" data-del style="color:var(--warn)">Delete note</button>
      <button class="quiet" data-close>Cancel</button>
    </div>`);
  on(sheet, '[data-close]', closeSheet);
  on(sheet, '[data-save]', () => {
    const text = sheet.querySelector('[data-text]').value.trim();
    if (!text) { toast('A note can’t be empty. Delete it instead.'); return; }
    notes[i].text = text; closeSheet(); onChange(); toast('Note saved');
  });
  on(sheet, '[data-del]', () => {
    if (!confirm('Delete this note?')) return;
    notes.splice(i, 1); closeSheet(); onChange(); toast('Note deleted');
  });
}

/* ---------- Ratings ---------- */
export function starsHtml(rating) {
  return rating ? h`<span class="stars" aria-label="${rating} out of 5">${'★'.repeat(rating)}<span class="off">${'★'.repeat(5 - rating)}</span></span>` : '';
}
export function starPicker(rating) {
  return h`<div class="star-picker" role="group" aria-label="Rating">${[1, 2, 3, 4, 5].map(n => h`
    <button class="star ${n <= rating ? 'on' : ''}" data-star="${n}" aria-label="${n} out of 5" aria-pressed="${n === rating}">★</button>`).join('')}</div>`;
}
/** Tapping the current rating again clears it. */
export function wireStars(root, get, set) {
  root.querySelectorAll('[data-star]').forEach(b => b.onclick = () => { const n = Number(b.dataset.star); set(n === get() ? 0 : n); });
}

/* ---------- Alarms and calendar ---------- */
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
export function downloadIcs(owner, moments, filename) {
  const url = URL.createObjectURL(new Blob([buildIcs(owner, moments)], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
}
export function openAlarmSheet(owner, t, label) {
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
export function alarmHelp() {
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

/** A row that opens a list, e.g. "Past bakes 4 ›". */
export function listLink(act, label, count) {
  return h`<button class="list-link" data-act="${act}"><span>${esc(label)}</span><span class="muted">${count} ›</span></button>`;
}

/* ---------- Icons ---------- */
const svg = (w, body, sw = 1.8) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const gear = () => svg(20, '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>');
export const bell = () => svg(16, '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>', 2);
export const cal = () => svg(16, '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', 2);
export const chevron = () => svg(22, '<path d="M15 18l-6-6 6-6"/>', 2);
export const shareIcon = () => svg(20, '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>');
export const bookIcon = () => svg(20, '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/>');
export const pinIcon = filled => `<svg width="20" height="20" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4h6l-1 6 4 4H6l4-4z"/><path d="M12 14v7"/></svg>`;
