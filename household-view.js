// "Share and alerts": link phones with a QR code, join by scanning one, and set up ntfy alerts.
import { h, esc, fmtTime } from './format.js';
import qrcode from './vendor/qrcode.mjs';
import { NTFY_HOST } from './ntfy.js';
import {
  household, joinCode, joinUrl, parseCode, alertTopic, syncStatus, onSyncStatus,
  createHousehold, joinHousehold, leaveHousehold, resetHousehold, sendTestAlert,
} from './sync.js';
import { render } from './store.js';
import { sheet, on, openSheet, closeSheet, sheetOpen, toast, IS_IOS } from './ui.js';

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 12, scalable: true, alt: 'Household code' });
}

async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); toast(`${what} copied`); } catch { prompt(`Copy the ${what.toLowerCase()}`, text); }
}

function statusText(s) {
  if (s.error === 'offline' || navigator.onLine === false) return s.pending ? `Offline. ${s.pending} change${s.pending > 1 ? 's' : ''} will send when you're back online.` : 'Offline. Changes will send when you’re back online.';
  if (s.error === 'send') return 'Couldn’t reach ntfy just now. Changes will send on the next try.';
  if (s.conn === 'connecting') return 'Connecting…';
  if (s.pending) return `Sending ${s.pending} change${s.pending > 1 ? 's' : ''}…`;
  if (s.lastIn || s.lastOut) return `Up to date. Last synced ${fmtTime(Math.max(s.lastIn, s.lastOut))}.`;
  return 'Linked.';
}

let unlisten = null;

export function openHousehold() {
  if (unlisten) { unlisten(); unlisten = null; }
  const hh = household();
  if (!hh) {
    openSheet(h`
      <h2>Share and alerts</h2>
      <p class="muted small" style="margin-top:6px">Link phones so they share bakes, starters and recipes, and so everyone gets an alert when it's time for the next step. Alerts come through the free ntfy app.</p>
      <div class="stack">
        <button class="primary wide" data-act="create">Share with someone</button>
        <button class="wide" data-act="join">Join a household</button>
        <p class="small muted" style="margin:0">Just you? Tap <strong>Share with someone</strong> anyway to set up alerts, and ignore the code.</p>
        <button class="quiet" data-close>Close</button>
      </div>`);
    on(sheet, '[data-act="create"]', async () => {
      try { await createHousehold(); } catch { toast('Set up, but couldn’t reach ntfy yet. It will catch up.'); }
      openHousehold();
    });
    on(sheet, '[data-act="join"]', () => openJoin());
    on(sheet, '[data-close]', () => { closeSheet(); render(); });
    return;
  }

  const topic = alertTopic(hh);
  openSheet(h`
    <h2>Share and alerts</h2>
    <p class="small muted" style="margin-top:6px" data-status>${esc(statusText(syncStatus()))}</p>
    <div class="stack">
      <h3>Add someone</h3>
      <div class="qr">${qrSvg(joinUrl())}</div>
      <p class="small muted" style="margin:0">On their phone: open this app, go to Settings, <strong>Share and alerts</strong>, <strong>Join a household</strong>, and scan this. They'll get everything on this phone, and it stays linked.</p>
      <button data-act="copy-code">Copy code instead</button>

      <h3 style="margin-top:10px">Alerts on this phone</h3>
      <ol class="small" style="margin:0;padding-left:20px">
        <li>Install <strong>ntfy</strong> from the ${IS_IOS ? 'App Store' : 'Play Store'}.</li>
        <li>Tap <strong>+</strong> and subscribe to this topic (server ${esc(NTFY_HOST)}):<div class="code">${esc(topic)}</div></li>
        <li>Tap <strong>Send a test alert</strong> below to check it works.</li>
      </ol>
      <div class="row wrap">
        <button data-act="copy-topic">Copy topic</button>
        <button data-act="test">Send a test alert</button>
      </div>
      <p class="small muted" style="margin:0">${IS_IOS
        ? 'Allow notifications for ntfy. Silent mode and Focus can mute it, so add ntfy to any Focus you bake through.'
        : 'Bake alerts use ntfy’s top priority: long vibration and a pop-up. Keep ntfy’s notifications on.'}
        Every bake schedules its own alerts and moves them when times change. Anyone subscribed to the topic gets them.</p>

      <h3 style="margin-top:10px">This phone</h3>
      <button data-act="leave">Leave household</button>
      <button class="quiet" data-act="reset" style="color:var(--warn)">Reset code</button>
      <p class="small muted" style="margin:0">Reset if the code got out. Everyone else will need to join again with the new one.</p>
      <button class="primary wide" data-close>Done</button>
    </div>`);
  unlisten = onSyncStatus(s => { const el = sheet.querySelector('[data-status]'); if (el) el.textContent = statusText(s); });
  on(sheet, '[data-act="copy-code"]', () => copy(joinCode(), 'Code'));
  on(sheet, '[data-act="copy-topic"]', () => copy(topic, 'Topic'));
  on(sheet, '[data-act="test"]', async () => {
    try { await sendTestAlert(); toast('Test alert sent'); } catch { toast('Couldn’t reach ntfy. Check your connection.'); }
  });
  on(sheet, '[data-act="leave"]', () => {
    if (!confirm('Leave this household? Everything stays on this phone, but it stops syncing and this phone stops scheduling alerts.')) return;
    leaveHousehold(); toast('Left the household'); openHousehold();
  });
  on(sheet, '[data-act="reset"]', async () => {
    if (!confirm('Make a new code? The old code stops working, and everyone else must join again with the new one. In ntfy, subscribe to the new topic.')) return;
    try { await resetHousehold(); } catch { /* catches up later */ }
    toast('New code made'); openHousehold();
  });
  on(sheet, '[data-close]', () => { if (unlisten) { unlisten(); unlisten = null; } closeSheet(); render(); });
}

/* ---------- Joining ---------- */

let stream = null;
function stopCamera() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }

function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/jsQR.js';
    s.onload = () => resolve(window.jsQR);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/** Read QR codes from the camera: the built-in detector where there is one (Android), jsQR otherwise (iPhone). */
async function scan(video, onCode) {
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  video.srcObject = stream;
  await video.play();
  let detect;
  if ('BarcodeDetector' in window) {
    const bd = new window.BarcodeDetector({ formats: ['qr_code'] });
    detect = async () => (await bd.detect(video))[0]?.rawValue;
  } else {
    const jsQR = await loadJsQR();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    detect = async () => {
      const w = video.videoWidth, hgt = video.videoHeight;
      if (!w) return null;
      const scale = Math.min(1, 640 / Math.max(w, hgt));
      canvas.width = Math.round(w * scale); canvas.height = Math.round(hgt * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data;
    };
  }
  const tick = async () => {
    if (!stream) return;
    if (!sheetOpen() || !document.body.contains(video)) { stopCamera(); return; }
    try {
      const text = await detect();
      if (text && parseCode(text)) { stopCamera(); onCode(text); return; }
    } catch { /* try the next frame */ }
    setTimeout(tick, 250);
  };
  tick();
}

export function openJoin(prefill = '') {
  if (unlisten) { unlisten(); unlisten = null; }
  stopCamera();
  const hh = household();
  const iosTab = IS_IOS && !standalone();
  openSheet(h`
    <h2>Join a household</h2>
    ${iosTab ? h`<div class="notice soft" style="margin-top:10px">Open this app from your home screen first and join there. A Safari tab keeps its own separate copy, so joining here won't reach the app.</div>` : ''}
    ${hh ? h`<div class="notice" style="margin-top:10px">This phone is already in a household. Joining another moves everything on this phone across, and it stops syncing with the old one.</div>` : ''}
    <div class="stack" style="margin-top:12px">
      <div class="scanner"><video playsinline muted></video><div class="scanner-msg small muted" data-cam-msg>Starting the camera…</div></div>
      <p class="small muted" style="margin:0">Point the camera at the code on the other phone (Settings, Share and alerts).</p>
      <label class="field">Or paste the code or link
        <input type="text" data-code value="${esc(prefill)}" autocomplete="off" autocapitalize="off" spellcheck="false" style="margin-top:4px">
      </label>
      <button class="primary wide" data-act="join">Join</button>
      <button class="quiet" data-close>Cancel</button>
    </div>`);
  const done = async text => {
    if (!parseCode(text)) { toast('That isn’t a household code'); return; }
    if (household()?.id === parseCode(text).id) { stopCamera(); toast('Already in this household'); openHousehold(); return; }
    if (household() && !confirm('Join this household instead? Everything on this phone moves across.')) return;
    stopCamera();
    try { await joinHousehold(text); toast('Joined. Syncing now…', 3000); } catch { toast('Joined. Couldn’t reach ntfy yet, it will catch up.', 3500); }
    openHousehold();
  };
  on(sheet, '[data-act="join"]', () => done(sheet.querySelector('[data-code]').value));
  on(sheet, '[data-close]', () => { stopCamera(); closeSheet(); render(); });
  const video = sheet.querySelector('video');
  const msg = sheet.querySelector('[data-cam-msg]');
  if (!navigator.mediaDevices?.getUserMedia) { msg.textContent = 'No camera here. Paste the code instead.'; return; }
  scan(video, done).then(() => { msg.textContent = ''; }).catch(() => {
    msg.textContent = 'Couldn’t use the camera. Allow camera access, or paste the code instead.';
    stopCamera();
  });
}
