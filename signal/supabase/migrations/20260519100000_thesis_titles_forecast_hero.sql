-- Align DB display titles with catalog: thesis hero = market forecast (no Buy/Sell imperatives).

UPDATE public.theses SET title = 'Gold will fall as a peace deal removes the war-risk premium the market has been paying within weeks', updated_at = now()
WHERE id = 'th-gold';

UPDATE public.theses SET title = 'USO will rerate higher as Hormuz chokepoint risk spikes within weeks', updated_at = now()
WHERE id = 'th-hormuz';

UPDATE public.theses SET title = 'USO will find a floor as OPEC holds barrels tight while US shale slows this quarter', updated_at = now()
WHERE id = 'th-opec';

UPDATE public.theses SET title = 'TLT will stay under pressure as the Fed delays rate cuts longer than the market expects this year', updated_at = now()
WHERE id = 'th-tlt';

UPDATE public.theses SET title = 'RTX will rerate higher as named Pentagon contracts lock in its order book this quarter', updated_at = now()
WHERE id = 'th-defense';

UPDATE public.theses SET title = 'QQQ will underperform as AI spending squeezes margins before revenue catches up this earnings season', updated_at = now()
WHERE id = 'th-qqq';

UPDATE public.theses SET title = 'Copper will stay bid as China''s infrastructure buildout keeps demand above available supply', updated_at = now()
WHERE id = 'th-copper';

UPDATE public.theses SET title = 'META will underperform as EU platform rules tighten within months', updated_at = now()
WHERE id = 'th-eutech';
