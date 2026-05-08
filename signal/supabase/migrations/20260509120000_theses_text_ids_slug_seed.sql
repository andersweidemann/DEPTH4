-- Align thesis primary keys with v2 UI (string IDs like th-defense, not UUIDs).
-- Also seed system theses so thesis_evidence_log / thesis_stars FK targets exist.

-- 1) Drop FKs that reference public.theses(id)
ALTER TABLE public.thesis_evidence_log DROP CONSTRAINT IF EXISTS thesis_evidence_log_thesis_id_fkey;
ALTER TABLE public.thesis_stars DROP CONSTRAINT IF EXISTS thesis_stars_thesis_id_fkey;

-- 2) Widen id / thesis_id to text
ALTER TABLE public.theses ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.theses ALTER COLUMN id TYPE text USING id::text;

ALTER TABLE public.thesis_stars ALTER COLUMN thesis_id TYPE text USING thesis_id::text;
ALTER TABLE public.thesis_evidence_log ALTER COLUMN thesis_id TYPE text USING thesis_id::text;

-- 3) Optional slug for admin links / future sync
ALTER TABLE public.theses ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_theses_slug ON public.theses (slug) WHERE slug IS NOT NULL;

-- 4) Restore FKs
ALTER TABLE public.thesis_stars
  ADD CONSTRAINT thesis_stars_thesis_id_fkey
  FOREIGN KEY (thesis_id) REFERENCES public.theses (id) ON DELETE CASCADE;

ALTER TABLE public.thesis_evidence_log
  ADD CONSTRAINT thesis_evidence_log_thesis_id_fkey
  FOREIGN KEY (thesis_id) REFERENCES public.theses (id) ON DELETE CASCADE;

-- 5) Seed system theses (IDs must match signal/apps/web mock-data.ts `TID`)
INSERT INTO public.theses (id, title, status, scenario_probabilities, insider_flow, slug, updated_at)
VALUES
  (
    'th-gold',
    'WAR / PEACE — GOLD SHORT',
    'ready',
    '{"base":40,"bull":35,"bear":25}'::jsonb,
    '{"bullInstruments":["BTC","TLT"],"bearInstruments":["XAUUSD","WTI","ITA"],"confirmTags":["ceasefire","peace talks","tanker deal","de-escalation"]}'::jsonb,
    'war-peace-gold-short',
    now()
  ),
  (
    'th-hormuz',
    'STRAIT OF HORMUZ RISK — OIL LONG',
    'active',
    '{"base":40,"bull":35,"bear":25}'::jsonb,
    '{"bullInstruments":["USOIL","WTI","BRENT"],"bearInstruments":[],"confirmTags":["hormuz","strait","tanker","oil","opec"]}'::jsonb,
    'strait-hormuz-oil-long',
    now()
  ),
  (
    'th-opec',
    'OPEC UNITY FRACTURING — OIL VOLATILITY',
    'watching',
    '{"base":40,"bull":35,"bear":25}'::jsonb,
    '{"bullInstruments":["USOIL"],"bearInstruments":[],"confirmTags":["opec","quota","production","meeting"]}'::jsonb,
    'opec-unity-fracturing',
    now()
  ),
  (
    'th-tlt',
    'FED PIVOT DELAYED — TLT WEAKNESS',
    'active',
    '{"base":40,"bull":35,"bear":25}'::jsonb,
    '{"bullInstruments":[],"bearInstruments":["TLT","IEF"],"confirmTags":["fed","cpi","payrolls","rates","inflation"]}'::jsonb,
    'fed-pivot-delayed-tlt-weakness',
    now()
  ),
  (
    'th-defense',
    'US DEFENSE RESET — RTX / LMT LONG',
    'ready',
    '{"base":40,"bull":35,"bear":25}'::jsonb,
    '{"bullInstruments":["RTX","LMT"],"bearInstruments":[],"confirmTags":["defense","appropriations","pentagon","contract","backlog"]}'::jsonb,
    'us-defense-repricing-rtx-lmt',
    now()
  ),
  (
    'th-qqq',
    'AI CAPEX SQUEEZE — QQQ ROTATION',
    'watching',
    '{"base":40,"bull":35,"bear":25}'::jsonb,
    '{"bullInstruments":["QQQ"],"bearInstruments":[],"confirmTags":["ai","capex","margin","guidance","nvidia"]}'::jsonb,
    'ai-capex-squeeze-qqq-rotation',
    now()
  ),
  (
    'th-copper',
    'CHINA STIMULUS REACCELERATION — COPPER LONG',
    'ready',
    '{"base":40,"bull":35,"bear":25}'::jsonb,
    '{"bullInstruments":["HG","COPPER"],"bearInstruments":[],"confirmTags":["china","stimulus","copper","infrastructure"]}'::jsonb,
    'china-stimulus-copper-long',
    now()
  ),
  (
    'th-eutech',
    'EU TECH CRACKDOWN — MEGA-CAP MULTIPLE COMPRESSION',
    'active',
    '{"base":40,"bull":35,"bear":25}'::jsonb,
    '{"bullInstruments":[],"bearInstruments":["META"],"confirmTags":["european commission","dma","antitrust","meta","fine"]}'::jsonb,
    'eu-tech-crackdown-megacap',
    now()
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  scenario_probabilities = EXCLUDED.scenario_probabilities,
  insider_flow = EXCLUDED.insider_flow,
  slug = COALESCE(EXCLUDED.slug, public.theses.slug),
  updated_at = now();
