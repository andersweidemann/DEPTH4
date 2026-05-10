-- Align llm_usage_stats with ops dashboard spec: wider cost column, unique key order, indexes.

ALTER TABLE public.llm_usage_stats
  ALTER COLUMN estimated_cost_usd TYPE numeric(12, 4);

ALTER TABLE public.llm_usage_stats DROP CONSTRAINT IF EXISTS llm_usage_stats_dtpmt_unique;

ALTER TABLE public.llm_usage_stats ADD CONSTRAINT llm_usage_stats_dpmt_unique UNIQUE (date, provider, model, task_type, tier);

DROP INDEX IF EXISTS idx_llm_usage_stats_date_task_provider;

CREATE INDEX idx_llm_usage_stats_date_provider ON public.llm_usage_stats (date, provider);

CREATE INDEX idx_llm_usage_stats_date_task_type ON public.llm_usage_stats (date, task_type);

CREATE OR REPLACE FUNCTION public.increment_llm_usage_stat(
  p_date date,
  p_task_type text,
  p_provider text,
  p_model text,
  p_tier text,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_escalation integer,
  p_validation_fail integer,
  p_cost numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.llm_usage_stats (
    date,
    provider,
    model,
    task_type,
    tier,
    calls,
    input_tokens,
    output_tokens,
    escalations,
    validation_failures,
    estimated_cost_usd
  )
  VALUES (
    p_date,
    p_provider,
    p_model,
    p_task_type,
    p_tier,
    1,
    COALESCE(p_input_tokens, 0),
    COALESCE(p_output_tokens, 0),
    COALESCE(p_escalation, 0),
    COALESCE(p_validation_fail, 0),
    COALESCE(p_cost, 0)::numeric(12, 4)
  )
  ON CONFLICT (date, provider, model, task_type, tier)
  DO UPDATE SET
    calls = llm_usage_stats.calls + 1,
    input_tokens = llm_usage_stats.input_tokens + COALESCE(EXCLUDED.input_tokens, 0),
    output_tokens = llm_usage_stats.output_tokens + COALESCE(EXCLUDED.output_tokens, 0),
    escalations = llm_usage_stats.escalations + EXCLUDED.escalations,
    validation_failures = llm_usage_stats.validation_failures + EXCLUDED.validation_failures,
    estimated_cost_usd = llm_usage_stats.estimated_cost_usd + EXCLUDED.estimated_cost_usd,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.increment_llm_usage_stat(date, text, text, text, text, bigint, bigint, integer, integer, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_llm_usage_stat(date, text, text, text, text, bigint, bigint, integer, integer, numeric) TO service_role;
