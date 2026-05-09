-- Align catalog thesis titles with DEPTH4 thesis-book template (trade line + time window).

UPDATE public.theses SET title = 'Sell GLD because peace progress will continue within weeks', updated_at = now()
WHERE slug = 'war-peace-gold-short';

UPDATE public.theses SET title = 'Buy USO because Hormuz chokepoint risk will spike within weeks', updated_at = now()
WHERE slug = 'strait-hormuz-oil-long';

UPDATE public.theses SET title = 'Buy USO because OPEC will hold prices if US shale slows this quarter', updated_at = now()
WHERE slug = 'opec-unity-fracturing';

UPDATE public.theses SET title = 'Sell TLT because Fed cuts will land later than futures price this year', updated_at = now()
WHERE slug = 'fed-pivot-delayed-tlt-weakness';

UPDATE public.theses SET title = 'Buy RTX because Pentagon awards will firm backlog this quarter', updated_at = now()
WHERE slug = 'us-defense-repricing-rtx-lmt';

UPDATE public.theses SET title = 'Buy HG because China stimulus will speed up again within months', updated_at = now()
WHERE slug = 'china-stimulus-copper-long';

UPDATE public.theses SET title = 'Sell META because EU platform rules will bite within months', updated_at = now()
WHERE slug = 'eu-tech-crackdown-megacap';
