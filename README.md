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

- Every step has a duration. Hands-on moments are: mix, each fold, shape start and end, bake start and end.
- Only upcoming moments are checked. Steps you've done, or times already past, never flag.
- **Sleep window with grace.** Moments deep in the window are clashes (red). Moments within the grace margin of either edge (30 min by default) only warn (yellow).
- **I'm out for a while.** Add a leaving and back time to a bake; hands-on steps in that span are clashes too.
- **Fix it** offers replans, gentlest first, each showing the new times: adjust the fridge proof, tighten the folds, shorten or lengthen bulk, or folds and bulk together. Limits are in Settings under "How far Fix it may bend".
- **I'll be up / I'll do it anyway** overrides a single moment. Undo from the step.
- **Time between folds** is one slider covering every fold still ahead. *Done now* on a fold records it as done at that moment; on a waiting step it records the real duration.
- New bakes: the solver picks a fridge proof that keeps every hands-on moment out of the sleep window, forward from now or backward from a ready time.

## Files

- `index.html` — the whole app (model, solver, UI)
- `manifest.json`, `sw.js`, `icon.svg`, `icon-192.png`, `icon-512.png` — PWA install and offline support
