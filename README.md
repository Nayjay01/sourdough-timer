# Sourdough timer

A small offline-first PWA that plans a sourdough bake around your sleep window, lets you nudge each step as the dough dictates, and hands each hands-on moment to your phone's alarm or calendar.

No build step. Four files plus icons. Everything lives in your phone's local storage; a share link carries the whole bake in the URL.

## Deploy to GitHub Pages

1. Create a new public repo (for example `sourdough-timer`) on your personal account.
2. Add the files in this folder to the root of the repo.
3. Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)` → Save.
4. Open `https://<username>.github.io/sourdough-timer/` on each phone.
   - Android (Chrome): menu → *Add to Home screen*.
   - iPhone (Safari): share sheet → *Add to Home Screen*.

When you change `index.html`, bump `CACHE` in `sw.js` so installed phones pick up the new version.

## iPhone alarms

iOS has no URL that sets an alarm directly, so the app calls a Shortcut. One-time setup on the iPhone:

1. Shortcuts → + → name it exactly **Sourdough alarm**.
2. Add **Split Text** — Input: *Shortcut Input*, Separator: *Custom* `|`.
3. Add **Get Item from List** (First Item), and another **Get Item from List** (Last Item) on the split text.
4. Add **Create Alarm** — Time: first item, Label: last item.

The app sends text like `7:30 am|Stretch and fold 2`.

Android needs nothing: the alarm button opens the Clock app with the time and label pre-filled.

## How the planner works

- Every step has a duration. The cold proof is the only *flexible* one (8–24 h by default).
- Hands-on moments are: mix, each fold, shape start and end, bake start and end.
- With *Avoid sleep window* on, the solver picks the shortest cold proof that keeps every hands-on moment outside 10pm–8am. Backward mode ("ready by") does the same working back from the eating time.
- If nothing fits it tells you why and offers the nearest workable time.
- Sliders on any future step shift everything after it. *Done now* on a waiting step records the real duration; on a fold it re-anchors the next fold 30 min from now.

## Files

- `index.html` — the whole app (model, solver, UI)
- `manifest.json`, `sw.js`, `icon.svg`, `icon-192.png`, `icon-512.png` — PWA install and offline support
