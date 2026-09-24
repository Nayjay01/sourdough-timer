// How-to guide content. Each section: id (for deep links), group, title, html body.

export const GUIDE = [
  /* ---------------- Starter ---------------- */
  {
    id: 'what-is-starter', group: 'Starter', title: 'What a starter is',
    html: `<p>A starter is flour and water colonised by wild yeast and lactic acid bacteria. The yeast makes the gas that raises the bread; the bacteria make the acids that give sourdough its tang and help it keep.</p>
<p>Every feed gives them fresh food. They multiply, the starter rises, and once the food runs out it falls back. Reading that rise and fall is most of the skill.</p>`,
  },
  {
    id: 'creating', group: 'Starter', title: 'Creating one from scratch',
    html: `<ol>
<li><strong>Day 1.</strong> Mix 50 g flour with 50 g water, about 25°C. Wholemeal or rye gets going fastest. Cover loosely.</li>
<li><strong>Every day after.</strong> Keep 20 g, add 20 g flour and 20 g water (1:1:1). Stir well, scrape down the sides, mark the level with a rubber band.</li>
<li><strong>Days 2–4.</strong> Often a big rise and bad smells. This is the <em>false rise</em>: bacteria, not yeast. Keep going.</li>
<li><strong>Days 4–8.</strong> Often a quiet lull. Normal. Don't give up.</li>
<li><strong>Day 7–14.</strong> It is alive when it doubles within about 12 hours of a feed two days running and smells pleasant.</li>
</ol>
<p>Then strengthen it with the ratio ladder before relying on it for bread.</p>`,
  },
  {
    id: 'ratios', group: 'Starter', title: 'Feeding ratios (1:2:2 and so on)',
    html: `<p>The ratio is starter : flour : water by weight. 1:2:2 means 20 g starter, 40 g flour, 40 g water.</p>
<ul>
<li><strong>Higher ratios</strong> (1:5:5, 1:10:10) give more food, so it takes longer to peak and tastes milder.</li>
<li><strong>Lower ratios</strong> (1:1:1) peak fast and turn sour quickly.</li>
</ul>
<p>Rough time to peak for a healthy starter at about 24°C:</p>
<table class="gtable"><tr><td>1:1:1</td><td>4–5 h</td></tr><tr><td>1:2:2</td><td>6–7 h</td></tr><tr><td>1:5:5</td><td>8–10 h</td></tr><tr><td>1:10:10</td><td>11–13 h</td></tr></table>
<p>Warmer is faster, cooler is slower. The bake planner uses these times to choose a feed that peaks when you mix.</p>`,
  },
  {
    id: 'ladder', group: 'Starter', title: 'The strengthening ladder',
    html: `<p>A young starter that has just come alive is still weak. Stepping up the ratio, three doublings at each step, builds a population that can raise a loaf reliably.</p>
<ul>
<li><strong>Quick</strong> 1:1 → 1:2 → 1:5 → 1:10. Fastest, least flour, but the jump to 1:5 can stall a young culture.</li>
<li><strong>Balanced</strong> 1:1 → 1:2 → 1:3 → 1:5 → 1:10. A softer middle step.</li>
<li><strong>Gentle</strong> 1:1 up to 1:10 one step at a time. About a month, very reliable.</li>
</ul>
<p>If a feed doesn't double, just repeat that ratio the next day. Doubling at 1:10:10 inside a day means it is ready for bread.</p>`,
  },
  {
    id: 'hungry', group: 'Starter', title: 'Hungry, peaking or past it',
    html: `<p><strong>At its peak:</strong> highest point, top domed or just flattening, bubbles right through, pleasant tang. Best time to use it.</p>
<p><strong>Past peak and hungry:</strong> fallen back with streaks on the jar above the surface, flat or sunken top, runny texture, a liquid layer, or a sharp alcohol or nail-polish-remover smell.</p>
<p>A rubber band at the level just after feeding makes this easy to judge.</p>
<p><strong>The float test</strong> (drop a spoonful in water) often works for white-flour starters but misleads with wholemeal or very wet starters. Trust rise and smell over it.</p>`,
  },
  {
    id: 'hooch', group: 'Starter', title: 'What hooch is',
    html: `<p>Hooch is the grey, brown or dark liquid that collects on top when the starter has run out of food. It is mostly alcohol and water from the yeast. It isn't harmful.</p>
<p>Pour it off for a milder starter, or stir it back in for more sour. Either way, it means feed it, and feed a little more often or at a higher ratio if it keeps appearing.</p>`,
  },
  {
    id: 'wet-dry', group: 'Starter', title: 'Wet vs stiff starter',
    html: `<ul>
<li><strong>Wet</strong> (100% hydration or more, equal flour and water): ferments faster, milder and more yoghurty, easy to stir, peaks and collapses quickly.</li>
<li><strong>Stiff</strong> (50–60% hydration): slower and more forgiving, holds its peak longer, tends toward a sharper, more vinegary sour. Handy if you can't feed on a tight schedule.</li>
</ul>
<p>Switching changes how much water your dough gets from the starter, so adjust the dough water slightly.</p>`,
  },
  {
    id: 'flours', group: 'Starter', title: 'Flours and how they behave',
    html: `<ul>
<li><strong>Rye</strong> and <strong>wholemeal</strong> have more nutrients, minerals and wild microbes, so they ferment noticeably faster and more sourly. Great for kick-starting or reviving a starter.</li>
<li><strong>White bread flour</strong> is slower and milder, with a cleaner rise that is easier to read. Its higher protein gives dough strength.</li>
<li><strong>Plain flour</strong> works for feeding but makes weaker dough.</li>
<li>Use unbleached flour where you can.</li>
</ul>
<p>A dough with some wholemeal ferments faster, so expect a shorter bulk ferment.</p>`,
  },
  {
    id: 'water-temp', group: 'Starter', title: 'Water and temperature',
    html: `<p>24–27°C is the sweet spot. Below about 20°C everything slows a lot; in the fridge at about 4°C it is nearly dormant.</p>
<p>Warm spots: the oven with only the light on (check it doesn't get above 30°C), on top of the fridge, or a seed-raising mat.</p>
<p>Tap water is usually fine. If a new starter won't get going, try filtered water or tap water left out overnight.</p>`,
  },
  {
    id: 'storing', group: 'Starter', title: 'Storing it in the fridge',
    html: `<p>The fridge slows fermentation right down so you don't have to feed daily.</p>
<ol>
<li>Feed it, leave it on the bench 1–2 hours so it starts rising.</li>
<li>Into the fridge with the lid loose.</li>
<li>About once a week, take it out, discard to your keep weight, feed, leave an hour or two, back in.</li>
</ol>
<p>For a long break, dry some: spread a thin layer on baking paper, let it dry completely, break into flakes and store airtight. It revives with a few feeds.</p>`,
  },
  {
    id: 'reviving', group: 'Starter', title: 'Reviving a stored starter',
    html: `<ol>
<li>Take it out and let it warm up. Pour off any hooch.</li>
<li>Keep 20 g and feed 1:1:1 or 1:2:2, somewhere warm.</li>
<li>Feed every 12–24 hours until it doubles on schedule again, usually 2–3 feeds, longer after a month or more.</li>
<li>Only bake once it is predictable again. A sluggish starter makes dense bread.</li>
</ol>
<p>A little wholemeal or rye in the first feeds speeds recovery.</p>`,
  },
  {
    id: 'discard', group: 'Starter', title: 'Why discard, and what to do with it',
    html: `<p>Without discarding, each feed would have to double in size to keep the same ratio and the jar would grow out of control. Keeping a small amount, like 20 g, keeps feeds cheap.</p>
<p>Discard can go into pancakes, crackers or pizza dough, or be kept in a jar in the fridge for up to about a week.</p>`,
  },
  {
    id: 'mould', group: 'Starter', title: 'Mould and when to throw it out',
    html: `<ul>
<li><strong>Pink, orange or red streaks</strong>: harmful bacteria. Throw the whole lot out. Don't try to save it.</li>
<li><strong>Fuzzy mould</strong> (white, green, blue or black): throw it out. Mould roots go deeper than you can see.</li>
<li><strong>Flat white film</strong> (kahm yeast): harmless but a sign of stress. Scrape off, feed more often, keep it warmer.</li>
<li><strong>Dark liquid</strong>: that's hooch, not mould.</li>
</ul>
<p>Keep a dried backup so losing a jar isn't a disaster. Use a clean jar every week or two.</p>`,
  },

  /* ---------------- Dough ---------------- */
  {
    id: 'bakers-percent', group: 'Dough', title: 'Your recipe in baker’s percentages',
    html: `<p>Everything is a percentage of the flour. For 500 g flour, 100 g starter, 350 g water and 10 g salt:</p>
<ul>
<li>Starter 20%, water 70%, salt 2%.</li>
<li>Counting the starter's own flour and water, true hydration is about 73%.</li>
</ul>
<p>Scaling the loaf keeps these the same, which is how the app's small and large sizes work. More water (75%+) gives a more open crumb but is harder to shape; less (65%) is easier to handle and tighter.</p>`,
  },
  {
    id: 'bulk', group: 'Dough', title: 'Reading bulk fermentation',
    html: `<p>Watch the dough, not the clock. Bulk is done when it has:</p>
<ul>
<li>grown about 50–75% (less for wholemeal),</li>
<li>a domed top that pulls away from the container edges,</li>
<li>bubbles on the surface and sides,</li>
<li>a jiggly, airy feel when you shake the container.</li>
</ul>
<p>Warm kitchens (26°C+) can finish in 4 hours; cool ones (20°C) may need 8 or more. That is what the bulk slider is for.</p>`,
  },
  {
    id: 'folds', group: 'Dough', title: 'Stretch and folds',
    html: `<p>Folds build strength without kneading. With wet hands, lift one side of the dough, stretch it up until it resists, fold it over, turn the bowl a quarter and repeat four times.</p>
<p>Spacing isn't critical. 20–30 minutes apart works; tightening them to fit your day is fine, as long as the dough gets its full bulk time afterwards.</p>`,
  },
  {
    id: 'shaping', group: 'Dough', title: 'Shaping and the banneton',
    html: `<p>Aim for a tight skin on the outside without tearing it. Pre-shape into a loose round, rest 20 minutes, then shape properly.</p>
<p>Dust the banneton with rice flour, not wheat flour: rice flour doesn't absorb moisture, so the dough won't stick. Put the loaf in seam side up.</p>`,
  },
  {
    id: 'cold-proof', group: 'Dough', title: 'Cold proof in the fridge',
    html: `<p>A night in the fridge slows everything down, deepens the flavour and firms the dough so it is easier to score. 8–16 hours is typical; up to 24 is usually fine, with a sourer loaf.</p>
<p><strong>Poke test</strong> for readiness: a floured fingertip dent should spring back slowly and leave a slight dip. Springs straight back: needs longer. Doesn't spring back at all: over-proofed, bake it now.</p>`,
  },

  /* ---------------- Baking ---------------- */
  {
    id: 'dutch-oven', group: 'Baking', title: 'Dutch oven with the lid on',
    html: `<p>A lidded pot traps the steam coming out of the dough. That keeps the crust soft for the first part of the bake, so the loaf can expand fully (oven spring), and gives a glossy, crackly crust.</p>
<ol>
<li>Preheat the oven with the empty pot inside at 250°C for 45–60 minutes.</li>
<li>Turn the dough out onto baking paper, score it, lower it in by the paper and put the lid on.</li>
<li>20 minutes lid on at 250°C.</li>
<li>Lid off, reduce to about 230°C, 20–25 minutes more until deep brown.</li>
</ol>
<p>A tray on the rack below stops the base burning.</p>`,
  },
  {
    id: 'open-bake', group: 'Baking', title: 'Open oven with steam',
    html: `<p>Without a lid you have to add steam yourself for the first 15–20 minutes, or the crust sets too early and the loaf stays small and pale.</p>
<ul>
<li>Preheat a baking stone or steel and a metal tray on the bottom rack.</li>
<li>Load the loaf, then carefully pour a cup of boiling water into the tray and shut the door fast.</li>
<li>After 15–20 minutes remove the tray to let the steam out and let the crust colour.</li>
</ul>
<p>Open baking suits bigger or longer loaves, and several at once. The Dutch oven is more reliable for a single round loaf.</p>`,
  },
  {
    id: 'scoring', group: 'Baking', title: 'Scoring',
    html: `<p>A score controls where the loaf opens. Use a razor blade (lame) or very sharp knife, one confident cut about 1 cm deep at a shallow 30–45° angle for an "ear". Score straight from the fridge: cold dough cuts cleanly.</p>`,
  },
  {
    id: 'done-cooling', group: 'Baking', title: 'Knowing it’s done, and cooling',
    html: `<p>Done when deep brown, hollow-sounding when tapped underneath, and about 96–98°C inside if you have a probe.</p>
<p>Cool at least an hour on a rack before cutting. The inside is still setting; cutting early makes it gummy.</p>`,
  },

  /* ---------------- Troubleshooting ---------------- */
  {
    id: 'troubleshooting', group: 'Troubleshooting', title: 'Common problems',
    html: `<ul>
<li><strong>Dense and gummy:</strong> under-fermented (short bulk, cold kitchen, weak starter) or cut too early.</li>
<li><strong>Flat and spreading:</strong> over-proofed, too little strength (more folds, tighter shaping), or too much water for your flour.</li>
<li><strong>Big hole under the crust</strong> with tight crumb below: under-proofed or shaping trapped air.</li>
<li><strong>Burnt base:</strong> tray on the rack below, or a sprinkle of semolina under the paper.</li>
<li><strong>Stuck to the banneton:</strong> use rice flour, more of it.</li>
<li><strong>Too sour:</strong> use the starter nearer its peak, a higher feed ratio, less wholemeal, shorter cold proof.</li>
<li><strong>Not sour enough:</strong> longer cold proof, a stiffer starter, some wholemeal or rye.</li>
<li><strong>Pale crust:</strong> longer with the lid off, or a hotter oven.</li>
</ul>`,
  },
  {
    id: 'starter-problems', group: 'Troubleshooting', title: 'Starter not rising',
    html: `<ul>
<li>Too cold: find somewhere 24–27°C.</li>
<li>Still in the lull (days 4–8 of a new starter): be patient.</li>
<li>Fed too little, too long ago: feed more often or at a lower ratio for a few days.</li>
<li>Only white flour: add some wholemeal or rye.</li>
<li>Recently out of the fridge: give it 2–3 warm feeds first.</li>
</ul>`,
  },

  /* ---------------- Safety ---------------- */
  {
    id: 'safety', group: 'Safety', title: 'Hazards to watch for',
    html: `<ul>
<li><strong>The pot is at 250°C.</strong> Use proper long oven gloves, not a folded tea towel. Lower dough in on baking paper rather than by hand.</li>
<li><strong>Lid knobs:</strong> some enamelled pots have plastic knobs rated below 250°C. Check yours, or swap for a metal knob.</li>
<li><strong>Steam burns:</strong> tip the lid away from you when opening. Stand back when pouring water into a hot tray.</li>
<li><strong>Oven glass:</strong> never spray or splash water on the hot oven door or light; the glass can crack.</li>
<li><strong>Sealed jars:</strong> a tightly sealed starter jar can build pressure. Keep the lid loose.</li>
<li><strong>Raw flour and dough</strong> can carry bacteria. Don't eat them raw, and wash hands and surfaces afterwards.</li>
<li><strong>Pink or orange starter:</strong> throw it out (see Mould).</li>
</ul>`,
  },
];

export const GUIDE_GROUPS = [...new Set(GUIDE.map(s => s.group))];
