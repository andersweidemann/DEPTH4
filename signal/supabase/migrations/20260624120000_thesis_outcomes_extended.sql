-- Extend thesis_outcomes for track-record accuracy (price + narrative post-mortem).

ALTER TABLE public.thesis_outcomes
  ADD COLUMN IF NOT EXISTS outcome_category text CHECK (
    outcome_category IS NULL
    OR outcome_category IN (
      'target_hit',
      'stop_hit',
      'time_expired',
      'invalidated',
      'manual_close'
    )
  ),
  ADD COLUMN IF NOT EXISTS actual_return_pct numeric(10, 4),
  ADD COLUMN IF NOT EXISTS entry_price numeric(12, 4),
  ADD COLUMN IF NOT EXISTS exit_price numeric(12, 4),
  ADD COLUMN IF NOT EXISTS target_price numeric(12, 4),
  ADD COLUMN IF NOT EXISTS stop_loss_price numeric(12, 4),
  ADD COLUMN IF NOT EXISTS thesis_prediction text,
  ADD COLUMN IF NOT EXISTS what_actually_happened text,
  ADD COLUMN IF NOT EXISTS narrative_fulfilled boolean,
  ADD COLUMN IF NOT EXISTS post_mortem text;

CREATE INDEX IF NOT EXISTS idx_thesis_outcomes_category
  ON public.thesis_outcomes (outcome_category)
  WHERE outcome_category IS NOT NULL;
