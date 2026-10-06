// Household sync. Every phone keeps its own full copy of bakes, starters and recipes. When something changes,
// the phone sends the changed records through an ntfy topic, encrypted with the household key from the QR code,
// and the other phones merge them in: per record, the newest change wins. Settings stay on each phone.
//
// ntfy only keeps messages for 12 hours, so a phone that has been closed for longer can miss changes. To cover
// that, a phone sends everything it has when it opens (at most every 6 hours) and whenever another phone says
// hello, which every phone does when it joins.
import { uid } from './format.js';
import { state, save, setSaveHooks, normalizeBake } from './store.js';
import { normalizeStarter } from './starter.js';
import { normalizeRecipe } from './recipes.js';
import { publish, cancel, subscribe } from './ntfy.js';
import { planAlerts } from './alerts.js';

const HH_KEY = 'sourdough.household';
const DEV_KEY = 'sourdough.device';
const CHUNK = 3500;            // characters per message, under ntfy's 4,096-byte limit
const FULL_EVERY = 6 * 3600e3; // resend everything at most this often
const TOMB_KEEP = 30 * 86400e3;

/* ---------- Local bookkeeping ---------- */

function readJson(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } }
function writeJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full; sync catches up later */ } }

const deviceId = (() => {
  let d = null;
  try { d = localStorage.getItem(DEV_KEY); } catch { /* private mode */ }
  if (!d) { d = uid(); try { localStorage.setItem(DEV_KEY, d); } catch { /* fine */ } }
  return d;
})();

/**
 * hh: { id, key, lastTime, lastFull, outbox: [recordKey], cancels: [{ topic, seq }], seen: [msgId] } or null.
 * Tombstones (deleted records) live alongside so deletes travel too.
 */
let hh = readJson(HH_KEY, null);
let tombs = readJson(`${HH_KEY}.tombs`, {});
const persist = () => { writeJson(HH_KEY, hh); writeJson(`${HH_KEY}.tombs`, tombs); };

export const dataTopic = h => `sourdough-${h.id}-sync`;
export const alertTopic = h => `sourdough-${h.id}`;
export function household() { return hh; }
export function joinCode() { return hh ? `${hh.id}.${hh.key}` : null; }
export function appUrl() { return location.origin + location.pathname; }
export function joinUrl() { return hh ? `${appUrl()}#join=${joinCode()}` : null; }
/** Pull a household code out of a scanned QR, a pasted link or the bare code. */
export function parseCode(text) {
  const m = String(text || '').match(/([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})/);
  return m ? { id: m[1], key: m[2] } : null;
}

/* ---------- Status for the household screen ---------- */

let status = { conn: 'off', lastIn: 0, lastOut: 0, error: '' };
const listeners = new Set();
export function syncStatus() { return { ...status, pending: hh ? hh.outbox.length : 0 }; }
export function onSyncStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setStatus(patch) { status = { ...status, ...patch }; listeners.forEach(fn => fn(syncStatus())); }

let onRemote = () => {};
/** Called after records from another phone are merged in, so the screen can redraw. */
export function setRemoteHandler(fn) { onRemote = fn; }

/* ---------- Records ---------- */

const TYPES = {
  bake:    { list: () => state.bakes,    set: a => { state.bakes = a; },    norm: normalizeBake },
  starter: { list: () => state.starters, set: a => { state.starters = a; }, norm: normalizeStarter },
  recipe:  { list: () => state.recipes,  set: a => { state.recipes = a; },  norm: normalizeRecipe },
};
const keyOf = (type, id) => `${type}:${id}`;
const splitKey = k => { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)]; };
/** What counts as a change: everything except bookkeeping. Undo history stays on the phone. */
function viewOf(rec) { const { updatedAt, alertsSent, history, ...rest } = rec; return JSON.stringify(rest); }
function wireOf(rec) { const { history, ...rest } = rec; return rest; }
function findRec(type, id) { return TYPES[type].list().find(r => r.id === id) || null; }

const known = new Map();      // record key -> view at last save
const knownAlerts = new Map(); // bake id -> alertsSent at last save, to cancel alerts of deleted bakes
let primed = false;

function prime() {
  for (const [type, t] of Object.entries(TYPES)) for (const r of t.list()) known.set(keyOf(type, r.id), viewOf(r));
  for (const b of state.bakes) knownAlerts.set(b.id, b.alertsSent || {});
  primed = true;
}

function markDirty(k) {
  if (!hh) return;
  if (!hh.outbox.includes(k)) hh.outbox.push(k);
}

/** Runs before every save: stamps changed records with the time and queues them to send. */
function beforeSave() {
  if (!primed) prime();
  const now = Date.now();
  const seen = new Set();
  for (const [type, t] of Object.entries(TYPES)) {
    for (const r of t.list()) {
      const k = keyOf(type, r.id);
      seen.add(k);
      const v = viewOf(r);
      if (known.get(k) !== v) { r.updatedAt = now; markDirty(k); known.set(k, v); delete tombs[k]; }
    }
  }
  for (const k of [...known.keys()]) {
    if (seen.has(k)) continue;
    known.delete(k);
    tombs[k] = now;
    markDirty(k);
    const [type, id] = splitKey(k);
    if (type === 'bake' && hh) {
      // A deleted bake takes its upcoming alerts with it.
      for (const [aid, t] of Object.entries(knownAlerts.get(id) || {})) {
        if (t > now) hh.cancels.push({ topic: alertTopic(hh), seq: alertSeq(id, aid) });
      }
    }
  }
  knownAlerts.clear();
  for (const b of state.bakes) knownAlerts.set(b.id, b.alertsSent || {});
  for (const [k, t] of Object.entries(tombs)) if (now - t > TOMB_KEEP) delete tombs[k];
  if (hh) persist();
}

function afterSave() {
  if (!hh) return;
  schedule('flush', flush, 1500);
  schedule('alerts', syncAlerts, 1500);
}
setSaveHooks({ before: beforeSave, after: afterSave });

const timers = {};
function schedule(name, fn, ms) { clearTimeout(timers[name]); timers[name] = setTimeout(fn, ms); }

/* ---------- Encryption ---------- */

const b64u = {
  enc(bytes) { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec(str) { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); },
};
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

let cryptoKey = null, cryptoKeyFor = null;
async function getKey() {
  if (cryptoKeyFor !== hh.key) {
    cryptoKey = await crypto.subtle.importKey('raw', b64u.dec(hh.key), 'AES-GCM', false, ['encrypt', 'decrypt']);
    cryptoKeyFor = hh.key;
  }
  return cryptoKey;
}
/** Object -> 'z' or 'p' (gzipped or plain) + base64url(iv + AES-GCM ciphertext). */
async function seal(obj) {
  let bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (canZip) bytes = await pipe(bytes, new CompressionStream('gzip'));
  const iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await getKey(), bytes));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return (canZip ? 'z' : 'p') + b64u.enc(out);
}
async function unseal(str) {
  const raw = b64u.dec(str.slice(1));
  let bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await getKey(), raw.slice(12)));
  if (str[0] === 'z') bytes = await pipe(bytes, new DecompressionStream('gzip'));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/* ---------- Sending ---------- */

/** Send one envelope, split into as many messages as it needs: "sd1 <group> <i>/<n> <part>". */
async function send(envelope) {
  const sealed = await seal({ v: 1, dev: deviceId, ...envelope });
  const gid = uid();
  const n = Math.ceil(sealed.length / CHUNK);
  for (let i = 0; i < n; i++) {
    await publish({ topic: dataTopic(hh), message: `sd1 ${gid} ${i + 1}/${n} ${sealed.slice(i * CHUNK, (i + 1) * CHUNK)}`, firebase: 'no' });
  }
  setStatus({ lastOut: Date.now(), error: '' });
}

function recordFor(k) {
  const [type, id] = splitKey(k);
  if (!TYPES[type]) return null;
  const r = findRec(type, id);
  if (r) return { type, id, updatedAt: r.updatedAt || 0, data: wireOf(r) };
  if (tombs[k]) return { type, id, updatedAt: tombs[k], deleted: true };
  return null;
}

let flushing = false;
/** Send everything waiting in the outbox. Failures stay queued for next time. */
export async function flush() {
  if (!hh || flushing || !hh.outbox.length) return;
  flushing = true;
  const keys = [...hh.outbox];
  try {
    const recs = keys.map(recordFor).filter(Boolean);
    if (recs.length) await send({ kind: 'recs', recs });
    hh.outbox = hh.outbox.filter(k => !keys.includes(k));
    persist();
  } catch (e) {
    setStatus({ error: navigator.onLine === false ? 'offline' : 'send' });
  } finally {
    flushing = false;
    setStatus({});
  }
}

/** Send every record and recent delete, so a phone that missed messages catches up. */
export async function sendAll() {
  if (!hh) return;
  const recs = [];
  for (const [type, t] of Object.entries(TYPES)) for (const r of t.list()) recs.push({ type, id: r.id, updatedAt: r.updatedAt || 0, data: wireOf(r) });
  for (const [k, at] of Object.entries(tombs)) { const [type, id] = splitKey(k); recs.push({ type, id, updatedAt: at, deleted: true }); }
  try {
    await send({ kind: 'recs', recs, full: true });
    hh.lastFull = Date.now(); hh.outbox = []; persist();
  } catch { setStatus({ error: navigator.onLine === false ? 'offline' : 'send' }); }
}

/* ---------- Receiving ---------- */

const parts = new Map(); // group id -> { n, got: [] }

async function receive(m) {
  if (!hh || hh.seen.includes(m.id)) return;
  hh.seen = [...hh.seen.slice(-299), m.id];
  hh.lastTime = Math.max(Number(hh.lastTime) || 0, m.time || 0);
  const match = /^sd1 (\S+) (\d+)\/(\d+) (\S+)$/.exec(m.message || '');
  if (!match) return;
  const [, gid, i, n, part] = match;
  const g = parts.get(gid) || { n: Number(n), got: [] };
  g.got[Number(i) - 1] = part;
  parts.set(gid, g);
  if (g.got.filter(Boolean).length < g.n) return;
  parts.delete(gid);
  let env;
  try { env = await unseal(g.got.join('')); } catch { return; } // a different household key, or damaged
  setStatus({ lastIn: Date.now() });
  if (env.dev === deviceId) return;
  if (env.kind === 'hello') schedule('full', sendAll, 4000);
  if (env.kind === 'recs') applyRecords(env.recs || []);
  schedule('persist', persist, 1000);
}

/** Merge records from another phone. Newest change wins; a delete beats older edits. */
export function applyRecords(recs) {
  let changed = false;
  for (const rec of recs) {
    const t = TYPES[rec.type];
    if (!t || !rec.id) continue;
    const k = keyOf(rec.type, rec.id);
    const local = findRec(rec.type, rec.id);
    const at = rec.updatedAt || 0;
    if (rec.deleted) {
      if (local && (local.updatedAt || 0) > at) continue;
      if (local) { t.set(t.list().filter(r => r.id !== rec.id)); changed = true; }
      tombs[k] = Math.max(tombs[k] || 0, at);
      known.delete(k);
      continue;
    }
    if (tombs[k] && tombs[k] >= at) continue;
    if (local && (local.updatedAt || 0) > at) continue;
    const incoming = t.norm({ ...rec.data, id: rec.id, updatedAt: at });
    if (local && viewOf(local) === viewOf(incoming) && JSON.stringify(local.alertsSent || {}) === JSON.stringify(incoming.alertsSent || {})) continue;
    if (rec.type === 'bake') incoming.history = []; // undo can't reach across phones
    if (local) {
      // Change it in place, so a screen or sheet that's open on this record keeps working on the live copy.
      for (const key of Object.keys(local)) delete local[key];
      Object.assign(local, incoming);
    } else t.set([...t.list(), incoming]);
    known.set(k, viewOf(incoming));
    if (rec.type === 'bake') knownAlerts.set(rec.id, incoming.alertsSent || {});
    delete tombs[k];
    changed = true;
  }
  if (changed) { dedupeRecipes(); save(); onRemote(); }
  return changed;
}

/**
 * Every phone starts with its own "My usual" recipe, so joining would leave two identical copies.
 * Identical recipes collapse into the one with the smallest id; every phone picks the same one.
 */
function dedupeRecipes() {
  const sig = r => { const { id, createdAt, updatedAt, lastUsedAt, pinned, ...rest } = r; return JSON.stringify(rest); };
  const keep = new Map();
  for (const r of [...state.recipes].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const k = sig(r);
    const first = keep.get(k);
    if (!first) { keep.set(k, r); continue; }
    if (r.pinned) first.pinned = true;
    first.lastUsedAt = Math.max(first.lastUsedAt || 0, r.lastUsedAt || 0) || null;
    for (const b of state.bakes) if (b.recipeId === r.id) b.recipeId = first.id;
    state.recipes = state.recipes.filter(x => x !== r);
  }
}

/* ---------- Connection ---------- */

let stop = null;
function connect() {
  if (!hh || stop) return;
  setStatus({ conn: 'connecting' });
  stop = subscribe(dataTopic(hh), hh.lastTime ? Math.max(0, Number(hh.lastTime) - 60) : 'all', receive, s => {
    setStatus({ conn: s === 'open' ? 'live' : 'connecting' });
    if (s === 'open') { flush(); syncAlerts(); }
  });
}
function disconnect() { if (stop) { stop(); stop = null; } setStatus({ conn: 'off' }); }

/** Start syncing on app start, if this phone is in a household. */
export function startSync() {
  if (!primed) prime();
  if (!hh) return;
  connect();
  if (Date.now() - (hh.lastFull || 0) > FULL_EVERY) schedule('full', sendAll, 5000);
}
document.addEventListener('visibilitychange', () => {
  if (!hh) return;
  if (document.visibilityState === 'hidden') { disconnect(); flush(); } else connect();
});
window.addEventListener('online', () => { if (hh) { disconnect(); connect(); } });

/* ---------- Household changes ---------- */

function newHousehold(id = b64u.enc(rand(16)), key = b64u.enc(rand(32))) {
  return { id, key, lastTime: 0, lastFull: 0, outbox: [], cancels: [], seen: [] };
}
/** Bakes keep a note of the alerts they've scheduled; a new topic starts that afresh. */
function forgetAlerts() { for (const b of state.bakes) delete b.alertsSent; knownAlerts.clear(); }

export async function createHousehold() {
  if (hh) return;
  hh = newHousehold();
  persist();
  forgetAlerts(); save();
  connect();
  await sendAll();
  syncAlerts();
}

/** Join from a scanned or pasted code. This phone's own records are merged into the household. */
export async function joinHousehold(code) {
  const c = parseCode(code);
  if (!c) throw new Error('bad code');
  if (hh && hh.id === c.id) return;
  disconnect();
  hh = newHousehold(c.id, c.key);
  persist();
  forgetAlerts(); save();
  connect();
  await send({ kind: 'hello' }).catch(() => {});
  await sendAll();
}

/** Stop syncing. Everything stays on this phone; the rest of the household carries on. */
export function leaveHousehold() {
  disconnect();
  hh = null;
  try { localStorage.removeItem(HH_KEY); } catch { /* fine */ }
  forgetAlerts(); save();
}

/** New code and topics, for when the old code got out. Cancels alerts on the old topic. */
export async function resetHousehold() {
  if (!hh) return;
  const oldTopic = alertTopic(hh);
  const pending = state.bakes.flatMap(b => Object.entries(b.alertsSent || {}).filter(([, t]) => t > Date.now()).map(([aid]) => alertSeq(b.id, aid)));
  disconnect();
  hh = newHousehold();
  hh.cancels = pending.map(seq => ({ topic: oldTopic, seq }));
  persist();
  forgetAlerts(); save();
  connect();
  await sendAll();
  syncAlerts();
}

/* ---------- Alerts ---------- */

export const alertSeq = (bakeId, aid) => `${String(bakeId).replace(/[^A-Za-z0-9_-]/g, '')}_${aid}`.slice(0, 64);

let alerting = false, alertAgain = false;
// ntfy.sh writes in batches, so two changes to the same alert a moment apart can land out of order.
// Keep at least this long between changes to any one alert.
const SEQ_GAP = 5000;
const lastSeqOp = new Map();
async function paced(seq, op) {
  const wait = (lastSeqOp.get(seq) || 0) + SEQ_GAP - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  try { return await op(); } finally { lastSeqOp.set(seq, Date.now()); }
}
/**
 * Bring every bake's scheduled alerts in line with its timeline: schedule new ones, move ones whose time
 * changed (same sequence ID replaces them on the server) and cancel ones no longer needed.
 */
export async function syncAlerts() {
  if (!hh) return;
  if (alerting) { alertAgain = true; return; }
  alerting = true;
  try {
    const topic = alertTopic(hh);
    while (hh.cancels.length) {
      const c = hh.cancels[0];
      await paced(c.seq, () => cancel(c.topic, c.seq));
      hh.cancels.shift(); persist();
    }
    let touched = false;
    for (const bake of state.bakes) {
      const plan = planAlerts(bake, Date.now());
      if (!plan.publish.length && !plan.cancel.length) continue;
      const sent = { ...(bake.alertsSent || {}) };
      for (const a of plan.cancel) {
        const seq = alertSeq(bake.id, a.aid);
        await paced(seq, () => cancel(topic, seq));
        delete sent[a.aid];
      }
      for (const a of plan.publish) {
        const seq = alertSeq(bake.id, a.aid);
        await paced(seq, () => publish({ topic, sequence_id: seq, delay: String(Math.floor(a.t / 1000)), title: a.title,
          message: a.message, priority: a.priority, tags: ['bread'], click: appUrl() }));
        sent[a.aid] = a.t;
      }
      bake.alertsSent = sent;
      knownAlerts.set(bake.id, sent);
      markDirty(keyOf('bake', bake.id)); // others need to know what's scheduled; not an edit, so no new timestamp
      touched = true;
    }
    if (touched) { save(); }
    setStatus({ error: '' });
  } catch {
    setStatus({ error: navigator.onLine === false ? 'offline' : 'send' });
  } finally {
    alerting = false;
    if (alertAgain) { alertAgain = false; schedule('alerts', syncAlerts, 500); }
  }
}

/** An alert right now, so people can check their ntfy app is set up. */
export async function sendTestAlert() {
  if (!hh) return;
  await publish({ topic: alertTopic(hh), title: 'Sourdough test alert', message: 'Alerts for your bakes will arrive like this.', priority: 5, tags: ['bread'], click: appUrl() });
}
