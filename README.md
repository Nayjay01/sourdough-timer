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

- **Recipe and loaves.** Pick a recipe, then how many small, medium and large loaves. Recipes are written for one medium loaf; small and large scale by the percentages in Settings (70% and 150% by default). The bake keeps its own copy of the recipe, so editing a recipe later doesn't rewrite past bakes.
- **Feed the starter first** (optional). Adds a feed step before mixing and works out how much to feed so there's enough for the dough plus what you keep. The planner picks the wait, and so the ratio, that keeps hands-on steps out of your sleep window. "Fed it now" logs the feed on the chosen starter.
- **Planning.** Start now, or work back from a ready time. Hands-on moments are feed, mix, each fold, shape start and end, bake start and end. The fridge proof stretches to dodge sleep.
- **Real life.** Only upcoming moments are checked. Steps within the grace margin of the sleep window warn instead of clashing. "I'm out for a while" blocks time on a bake. *Fix it* offers replans within the limits in Settings, and "I'll be up" overrides a single step.
- **Done times.** Completed steps show when they were actually done, and how far off plan when that's 10 minutes or more. Tapping Done more than an hour after the planned time asks whether it happened at the planned time (nothing moves), just now (later steps move) or at a time you pick. When several steps are already past, "Mark the rest done as planned" catches the bake up in one tap. The most recent step can be undone.
- **Notes and rating.** Add notes any time. A finished bake asks how it turned out, with a 1–5 rating and a summary of what ran differently from the plan. Finished bakes move to Past bakes.

## Recipes

- Ingredients for one medium loaf: starter, any number of flours, water, salt and extras (seeds, oil…), with hydration worked out for you.
- Optional timings (first rest, time between folds, bulk, bake) override your usual settings whenever the recipe is baked.
- Pin favourites: pinned recipes show on the home screen and sort to the top everywhere. The full list can be searched once there are six or more.
- Each recipe has its own notes and lists every bake made with it, with ratings.
- The single recipe from earlier versions becomes "My usual".

## Starters

- **From scratch:** day-by-day guidance through the false rise and the lull, and signs it has come alive.
- **Strengthening ladder:** choose Quick (1:1 → 1:2 → 1:5 → 1:10), Balanced (adds 1:3) or Gentle (every step to 1:10). Each ratio needs three feeds that double; a feed that doesn't just gets repeated. Completing 1:10:10 marks it mature.
- **Feed log:** ratio, amounts, and whether the previous feed doubled. Logging well after a feed was due asks whether it was fed just now or when due. Gaps of a day or more are marked in the log, with guidance on what a missed feed means. Undo the last feed if you mis-tap.
- **Journal** for notes that aren't about one feed.
- **Status:** next feed due while building it; rising, peak, past peak or hungry once mature; weekly-feed and revival prompts while it lives in the fridge.
- **Retire** a starter you no longer keep: it moves to Past starters with its history, and can be brought back.

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
| `app.js` | Home screen, guide, routing and start-up |
| `store.js` | Saved data, migrations and navigation |
| `ui.js` | Shared pieces: sheets, toasts, notes, ratings, alarms, icons |
| `bake-view.js` | New bake, bake page, done times, Fix it, past bakes |
| `starter-view.js` | Starter page, feed logging, past starters |
| `recipe-view.js` | Recipe list, recipe page and editor |
| `settings-view.js` | Settings |
| `schedule.js` | Bake steps, timelines, clash checks, solvers, Fix it, done times, deviations |
| `starter.js` | Starter ladders, feed log, status |
| `recipes.js` | Recipe scaling, timings and sorting |
| `guide.js` | How-to guide content |
| `format.js` | Time, number and HTML helpers |
| `sw.js`, `manifest.json`, `icon*` | Install and offline support |
