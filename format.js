// Time, number and HTML helpers shared by every screen. No DOM access here.

export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export function sameDay(a, b) {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}
export function fmtTime(t) {
  return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '');
}
export function fmtDayWord(t, now = Date.now()) {
  if (sameDay(t, now)) return 'Today';
  if (sameDay(t, now + DAY)) return 'Tomorrow';
  if (sameDay(t, now - DAY)) return 'Yesterday';
  return new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}
export function fmtWhen(t, now = Date.now()) { return `${fmtDayWord(t, now)} ${fmtTime(t)}`; }
export function fmtDate(t) { return new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }); }
export function fmtDur(mins) {
  mins = Math.round(mins);
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
/** "in 2h 5m" / "35m overdue" / "now". */
export function fmtCountdown(ms) {
  const neg = ms < 0; ms = Math.abs(ms);
  const mins = Math.round(ms / MIN);
  if (mins < 1) return 'now';
  return neg ? `${fmtDur(mins)} overdue` : `in ${fmtDur(mins)}`;
}
/** "3h ago", "2 days ago". */
export function fmtAgo(ms) {
  const mins = Math.round(ms / MIN);
  if (mins < 1) return 'just now';
  if (mins < 48 * 60) return `${fmtDur(mins)} ago`;
  return `${Math.round(mins / (24 * 60))} days ago`;
}
export function toLocalInput(t) {
  const d = new Date(t);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function roundTo(t, mins) { return Math.round(t / (mins * MIN)) * mins * MIN; }
export function grams(n) { return `${Math.round(n)} g`; }
export function ratioText(r) { return r ? `1:${r}:${r}` : 'first mix'; }

/** Tagged template that just joins; values are escaped by the caller with esc(). */
export function h(strings, ...vals) {
  return strings.reduce((out, s, i) => out + s + (i < vals.length ? vals[i] : ''), '');
}
export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'; }
export function uid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36); }
