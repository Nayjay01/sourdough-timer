# Sourdough timer

An offline-first PWA for planning sourdough bakes around your day, tracking a starter from day one to bread-ready, and a how-to guide for everything in between.

No build step: plain HTML, CSS and ES modules. Everything is stored on the phone; a share link carries a whole bake in the URL.

## Deploy to GitHub Pages

1. Put every file in this folder at the root of the repo.
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `/ (root)` → Save.
3. Open `https://<username>.github.io/sourdough-timer/` and add it to the home screen:
   - Android (Chrome): menu → *Add to Home screen* / *Install app*.
   - iPhone (Safari): share sheet → *Add to Home Screen*.

The service worker fetches fresh files whenever there's a connection and falls back to its cache offline, so updates show up on the next open. Bump `CACHE` in `sw.js` when you add or rename files.

## Bakes

- **Loaves.** Pick how many small, medium and large loaves. The recipe scales from the medium recipe in Settings (100 g starter, 500 g flour, 350 g water, 10 g salt by default) by flour weight: small 350 g, large 750 g.
- **Feed the starter first** (optional). Adds a feed step before mixing and works out how much to feed so there's enough for the dough plus what you keep. The planner picks the wait, and so the ratio (1:1:1 ≈ 4½ h, 1:2:2 ≈ 6½ h, 1:5:5 ≈ 9 h, 1:10:10 ≈ 12 h), that keeps hands-on steps out of your sleep window. "Fed it now" logs the feed on the chosen starter.
- **Planning.** Start now, or work back from a ready time. Hands-on moments are feed, mix, each fold, shape start and end, bake start and end. The fridge proof stretches to dodge sleep.
- **Real life.** Only upcoming moments are checked. Steps within the grace margin of the sleep window (30 min by default) warn instead of clashing. "I'm out for a while" blocks time on a bake. *Fix it* offers replans (fridge, tighter folds, bulk shorter or longer, or both) within the limits in Settings, and "I'll be up" overrides a single step.

## Starters

- **From scratch:** day-by-day guidance through the false rise and the lull, and signs it has come alive.
- **Strengthening ladder:** choose Quick (1:1 → 1:2 → 1:5 → 1:10), Balanced (adds 1:3) or Gentle (every step to 1:10). Each ratio needs three feeds that double; a feed that doesn't just gets repeated. Completing 1:10:10 marks it mature.
- **Feed log:** each feed records the ratio and amounts, and whether the previous feed doubled. Undo the last feed if you mis-tap.
- **Status:** next feed due while building it; rising, peak, past peak or hungry once mature; weekly-feed and revival prompts while it lives in the fridge.

## iPhone alarms

iOS has no URL that sets an alarm directly, so the app calls a Shortcut. One-time setup on the iPhone:

1. Shortcuts → + → name it exactly **Sourdough alarm**.
2. Add **Split Text**: Input *Shortcut Input*, Separator *Custom* `|`.
3. Add **Get Item from List** (First Item), and another **Get Item from List** (Last Item) on the split text.
4. Add **Create Alarm**: Time the first item, Label the last item.

Android needs nothing: the alarm button opens the Clock app with the time and label filled in. Either phone can use "Add to calendar" instead.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | Page shell |
| `styles.css` | All styles |
| `app.js` | State, storage, screens and sheets |
| `schedule.js` | Bake steps, timelines, clash checks, solvers, Fix it, recipe and feed maths |
| `starter.js` | Starter ladders, feed log, status |
| `guide.js` | How-to guide content |
| `format.js` | Time, number and HTML helpers |
| `sw.js`, `manifest.json`, `icon*` | Install and offline support |
