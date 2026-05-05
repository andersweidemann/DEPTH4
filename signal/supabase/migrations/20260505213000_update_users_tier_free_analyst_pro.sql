-- Update users.tier to free|analyst|pro (remove legacy institutional)

DO $$
DECLARE
  c_name text;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'public.users'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%tier%IN%';

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

-- Data migration: keep pro; everything else -> free.
UPDATE public.users
SET tier = CASE
  WHEN lower(tier) = 'pro' THEN 'pro'
  WHEN lower(tier) = 'analyst' THEN 'analyst'
  ELSE 'free'
END;

ALTER TABLE public.users
  ADD CONSTRAINT users_tier_check CHECK (tier IN ('free', 'analyst', 'pro'));

