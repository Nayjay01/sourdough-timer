// The only file that talks to ntfy. Everything goes as "simple" requests (JSON as text/plain, GET for deletes),
// so browsers skip the CORS preflight. https://docs.ntfy.sh/publish/
//
// Limits on ntfy.sh that shape the rest of the app: messages up to 4,096 bytes, cached for 12 hours,
// scheduled up to 3 days ahead (at least 10 s), and about 250 messages a day per internet connection.

/** Server base URL. Tests point this at a stand-in with localStorage 'sourdough.ntfyBase'. */
export const NTFY_BASE = (() => {
  try { return localStorage.getItem('sourdough.ntfyBase') || 'https://ntfy.sh'; } catch { return 'https://ntfy.sh'; }
})();
export const NTFY_HOST = NTFY_BASE.replace(/^https?:\/\//, '');
export const MAX_DELAY_MS = 3 * 24 * 60 * 60 * 1000;
export const MIN_DELAY_MS = 15 * 1000;

async function ok(res) {
  if (!res.ok) throw new Error(`ntfy ${res.status}`);
  return res;
}

/**
 * Publish one message. `msg` uses ntfy's JSON fields: topic, message, title, priority, tags, click,
 * sequence_id, delay (unix seconds as a string), firebase ('no'), cache ('no').
 */
export async function publish(msg) {
  return ok(await fetch(`${NTFY_BASE}/`, { method: 'POST', body: JSON.stringify(msg) }));
}

/** Cancel a scheduled message (or delete a delivered one) by its sequence ID. */
export async function cancel(topic, sequenceId) {
  return ok(await fetch(`${NTFY_BASE}/${topic}/${sequenceId}/delete`));
}

/**
 * Listen to a topic while the app is open. Calls onMessage(json) for every message event,
 * including cached ones since `since` (unix seconds, or 'all'). Returns a function that stops listening.
 */
export function subscribe(topic, since, onMessage, onState = () => {}) {
  const es = new EventSource(`${NTFY_BASE}/${topic}/sse?since=${since}`);
  es.onopen = () => onState('open');
  es.onerror = () => onState('error');
  es.onmessage = e => {
    try {
      const m = JSON.parse(e.data);
      if (m.event === 'message') onMessage(m);
    } catch { /* ignore anything that isn't ours */ }
  };
  return () => es.close();
}
