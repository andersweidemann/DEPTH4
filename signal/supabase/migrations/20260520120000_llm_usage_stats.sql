-- Aggregated daily LLM usage for internal ops dashboards (no prompts / PII).

CREATE TABLE public.llm_usage_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  task_type text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  tier text NOT NULL,
  calls integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  escalations integer NOT NULL DEFAULT 0,
  validation_failures integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(10, 4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT llm_usage_stats_dtpmt_unique UNIQUE (date, task_type, provider, model, tier)
);

CREATE INDEX idx_llm_usage_stats_date_task_provider ON public.llm_usage_stats (date, task_type, provider);

ALTER TABLE public.llm_usage_stats ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.llm_usage_stats IS 'Daily aggregates of LLM calls from API telemetry; updated via increment_llm_usage_stat RPC.';

-- Increment-or-insert aggregate row (called from FastAPI service_role).
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
    task_type,
    provider,
    model,
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
    p_task_type,
    p_provider,
    p_model,
    p_tier,
    1,
    COALESCE(p_input_tokens, 0),
    COALESCE(p_output_tokens, 0),
    COALESCE(p_escalation, 0),
    COALESCE(p_validation_fail, 0),
    COALESCE(p_cost, 0)::numeric(10, 4)
  )
  ON CONFLICT (date, task_type, provider, model, tier)
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
