-- Align catalog thesis titles with DEPTH4 retail display format (directional, ticker-first).

UPDATE public.theses SET title = 'Sell GLD because peace progress will continue', updated_at = now()
WHERE slug = 'war-peace-gold-short';

UPDATE public.theses SET title = 'Buy USO because Hormuz transit risk will rise', updated_at = now()
WHERE slug = 'strait-hormuz-oil-long';

UPDATE public.theses SET title = 'Buy USO because OPEC will hold prices if US shale slows', updated_at = now()
WHERE slug = 'opec-unity-fracturing';

UPDATE public.theses SET title = 'Sell TLT because Fed cuts will land later than priced', updated_at = now()
WHERE slug = 'fed-pivot-delayed-tlt-weakness';

UPDATE public.theses SET title = 'Buy RTX because Pentagon awards will firm backlog', updated_at = now()
WHERE slug = 'us-defense-repricing-rtx-lmt';

UPDATE public.theses SET title = 'Avoid QQQ adds because AI capex will squeeze margins first', updated_at = now()
WHERE slug = 'ai-capex-squeeze-qqq-rotation';

UPDATE public.theses SET title = 'Buy HG because China stimulus will speed up again', updated_at = now()
WHERE slug = 'china-stimulus-copper-long';

UPDATE public.theses SET title = 'Sell META because EU platform rules will get tougher', updated_at = now()
WHERE slug = 'eu-tech-crackdown-megacap';
