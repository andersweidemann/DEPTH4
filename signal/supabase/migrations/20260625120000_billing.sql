-- Stripe subscription fields on public.users (complements existing tier + stripe_* columns).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS subscription_period_end timestamptz;

-- Backfill from legacy tier column
UPDATE public.users
SET
  subscription_tier = CASE
    WHEN lower(trim(coalesce(tier, ''))) IN ('pro', 'analyst', 'creator') THEN 'pro'
    ELSE 'free'
  END,
  subscription_status = CASE
    WHEN stripe_subscription_id IS NOT NULL
      AND lower(trim(coalesce(tier, ''))) IN ('pro', 'analyst', 'creator') THEN 'active'
    ELSE coalesce(subscription_status, 'inactive')
  END
WHERE subscription_tier IS NULL OR subscription_tier = 'free';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_subscription_tier_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_subscription_tier_check
  CHECK (subscription_tier IN ('free', 'pro'));

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer
  ON public.users (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
