-- Incentive analysis: 1:1 JSONB on theses (political/economic "why" behind predictions).

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS incentive_analysis jsonb;

COMMENT ON COLUMN public.theses.incentive_analysis IS
  'Actor → goal → constraint → required action chain powering the thesis (DEPTH4 differentiator).';

-- Backfill flagship catalog theses (by slug).
UPDATE public.theses
SET incentive_analysis = '{
  "actor": "Trump administration",
  "goal": "Win 2026 midterm elections",
  "constraint": "Ongoing war is deeply unpopular; base demands resolution before campaigning",
  "required_action": "End war before November 2026",
  "alternative_actions": ["Win war decisively", "Negotiate peace", "Withdraw troops"],
  "most_likely_action": "Negotiate peace deal within 3-6 months",
  "confidence": 85,
  "time_window": "Before November 2026",
  "catalyst_events": ["Peace talks announced", "Ceasefire observed", "Troop withdrawal begins"],
  "reasoning": "Presidential parties historically lose midterms during unpopular wars. Trump campaigned on ending foreign conflicts. The incentive structure is clear: resolve the war or lose congressional majority — which makes a peace premium exit in gold the tradable expression."
}'::jsonb
WHERE slug = 'war-peace-gold-short';

UPDATE public.theses
SET incentive_analysis = '{
  "actor": "Federal Reserve / FOMC",
  "goal": "Bring inflation to 2% without breaking labor or financial stability",
  "constraint": "Growth and fiscal deficits keep services inflation sticky; markets price cuts too early",
  "required_action": "Hold rates higher for longer than futures imply",
  "alternative_actions": ["Cut aggressively if labor cracks", "Pause and signal data dependence", "Hike again if inflation re-accelerates"],
  "most_likely_action": "Delayed cuts — front-end yields stay elevated vs priced path",
  "confidence": 78,
  "time_window": "Next 2-4 FOMC cycles",
  "catalyst_events": ["Hot CPI/PCE print", "Dot plot shifts hawkish", "Labor market re-acceleration"],
  "reasoning": "The Fed cannot declare victory while supercore and fiscal impulse argue otherwise. Markets embed a fast pivot; the incentive is to validate disinflation with data before easing — bearish for duration / TLT until the repricing catches up."
}'::jsonb
WHERE slug = 'fed-pivot-delayed-tlt-weakness';

UPDATE public.theses
SET incentive_analysis = '{
  "actor": "Chinese policymakers (PBoC / State Council)",
  "goal": "Stabilize growth and property without a full balance-sheet crisis",
  "constraint": "Local government debt and weak property sales cap how aggressive stimulus can be",
  "required_action": "Targeted fiscal + credit easing that lifts industrial metals demand",
  "alternative_actions": ["Shock property bailout", "Export-led recovery only", "Under-deliver and accept slower GDP"],
  "most_likely_action": "Measured stimulus package that improves copper-intensive activity",
  "confidence": 72,
  "time_window": "Next 1-2 quarters",
  "catalyst_events": ["PBoC RRR/credit measures", "Infrastructure bond quota rise", "Property support rules"],
  "reasoning": "Beijing needs visible growth into the political calendar but fears moral hazard in property. Copper is the high-beta read on whether stimulus is real — the incentive is enough industrial impulse to matter, not a 2009-style blank check."
}'::jsonb
WHERE slug = 'china-stimulus-copper-long';
