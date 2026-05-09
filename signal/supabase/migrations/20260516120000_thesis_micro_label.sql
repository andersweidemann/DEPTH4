-- Short conversational micro-label above canonical retail title (`public.theses.title`).
-- UI reads `micro_label`; never render legacy internal names.

ALTER TABLE public.theses ADD COLUMN IF NOT EXISTS micro_label text;

UPDATE public.theses SET micro_label = 'War risk keeps gold bid', updated_at = now()
WHERE slug = 'war-peace-gold-short';

UPDATE public.theses SET micro_label = 'Gulf routes keep oil on edge', updated_at = now()
WHERE slug = 'strait-hormuz-oil-long';

UPDATE public.theses SET micro_label = 'Oil supply unity cracking', updated_at = now()
WHERE slug = 'opec-unity-fracturing';

UPDATE public.theses SET micro_label = 'Rates stay higher for longer', updated_at = now()
WHERE slug = 'fed-pivot-delayed-tlt-weakness';

UPDATE public.theses SET micro_label = 'Wars drive steady defense spend', updated_at = now()
WHERE slug = 'us-defense-repricing-rtx-lmt';

UPDATE public.theses SET micro_label = 'AI costs before AI profits', updated_at = now()
WHERE slug = 'ai-capex-squeeze-qqq-rotation';

UPDATE public.theses SET micro_label = 'China''s build-out lifts copper', updated_at = now()
WHERE slug = 'china-stimulus-copper-long';

UPDATE public.theses SET micro_label = 'Ad machine funding AI dreams', updated_at = now()
WHERE slug = 'eu-tech-crackdown-megacap';
