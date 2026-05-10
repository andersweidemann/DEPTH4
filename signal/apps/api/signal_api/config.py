from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  model_config = SettingsConfigDict(env_file=".env", extra="ignore")

  supabase_url: str = Field(default="", validation_alias="SUPABASE_URL")
  supabase_service_key: SecretStr = Field(
    default=SecretStr(""), validation_alias="SUPABASE_SERVICE_ROLE_KEY"
  )

  anthropic_api_key: SecretStr = Field(default=SecretStr(""), validation_alias="ANTHROPIC_API_KEY")
  # Cheaper default for pre-launch; override ANTHROPIC_MODEL for production (e.g. claude-sonnet-4-6).
  # List: https://docs.anthropic.com/en/api/models
  anthropic_model: str = Field(
    default="claude-3-5-haiku-20241022",
    validation_alias="ANTHROPIC_MODEL",
  )
  # Premium tier (Opus-class) for interactive / escalation.
  anthropic_model_premium: str = Field(
    default="claude-opus-4-7",
    validation_alias="ANTHROPIC_MODEL_PREMIUM",
  )
  # Anthropic model when Kimi is unavailable but tier is still cheap/standard.
  anthropic_model_cheap: str = Field(
    default="claude-3-5-haiku-20241022",
    validation_alias="ANTHROPIC_MODEL_CHEAP",
  )

  # Base provider (used as fallback when per-task provider is not set).
  llm_provider: str = Field(
    default="anthropic", validation_alias="LLM_PROVIDER"
  )  # anthropic | nvidia | nim | kimi

  # Optional routing (lets you do: cheap classify + premium analysis).
  # Examples:
  # - LLM_PROVIDER_CLASSIFY=nvidia
  # - LLM_PROVIDER_ANALYSIS=anthropic  (or kimi)
  llm_provider_classify: str | None = Field(default=None, validation_alias="LLM_PROVIDER_CLASSIFY")
  llm_provider_analysis: str | None = Field(default=None, validation_alias="LLM_PROVIDER_ANALYSIS")
  # When set (e.g. nvidia), ALL automated LLM work uses this: RSS/Yahoo ingest, consequence trees, repair,
  # briefings, scenario refinement, and per-user alert personalization. Leave empty to use CLASSIFY/ANALYSIS/LLM_PROVIDER above.
  llm_provider_background: str = Field(default="", validation_alias="LLM_PROVIDER_BACKGROUND")
  # Used only for explicit user-triggered API routes (premium personalize). Default anthropic.
  llm_provider_interactive: str = Field(default="anthropic", validation_alias="LLM_PROVIDER_INTERACTIVE")

  nvidia_api_key: SecretStr = Field(default=SecretStr(""), validation_alias="NVIDIA_API_KEY")
  nvidia_base_url: str = Field(
    default="https://integrate.api.nvidia.com/v1", validation_alias="NVIDIA_BASE_URL"
  )
  nvidia_model: str = Field(
    default="meta/llama-3.1-8b-instruct", validation_alias="NVIDIA_MODEL"
  )

  # Kimi (Moonshot) — OpenAI-compatible /chat/completions.
  kimi_api_key: SecretStr = Field(default=SecretStr(""), validation_alias="KIMI_API_KEY")
  kimi_base_url: str = Field(default="https://api.moonshot.cn/v1", validation_alias="KIMI_BASE_URL")
  kimi_model: str = Field(default="kimi-k2.6", validation_alias="KIMI_MODEL")

  # When true, cheap-path failures (empty / JSON validation) escalate once to ANTHROPIC_MODEL_PREMIUM.
  llm_routing_escalation: bool = Field(default=True, validation_alias="LLM_ROUTING_ESCALATION")

  redis_url: str = Field(default="redis://localhost:6379/0", validation_alias="REDIS_URL")

  # If set, POST /cron/ingest-once with header X-Depth4-Ingest-Secret: <value> runs one RSS cycle (free Render spin-up).
  ingest_cron_secret: SecretStr = Field(default=SecretStr(""), validation_alias="INGEST_CRON_SECRET")

  stripe_api_key: SecretStr | None = Field(default=None, validation_alias="STRIPE_API_KEY")
  stripe_webhook_secret: SecretStr | None = Field(default=None, validation_alias="STRIPE_WEBHOOK_SECRET")
  stripe_price_analyst_monthly: str = Field(default="", validation_alias="STRIPE_PRICE_ANALYST_MONTHLY")
  stripe_price_analyst_yearly: str = Field(default="", validation_alias="STRIPE_PRICE_ANALYST_YEARLY")
  stripe_price_pro_monthly: str = Field(default="", validation_alias="STRIPE_PRICE_PRO_MONTHLY")
  stripe_price_pro_yearly: str = Field(default="", validation_alias="STRIPE_PRICE_PRO_YEARLY")

  one_signal_app_id: str | None = Field(default=None, validation_alias="ONE_SIGNAL_APP_ID")
  one_signal_api_key: SecretStr | None = Field(default=None, validation_alias="ONE_SIGNAL_API_KEY")

  cdn_public_url: str = Field(default="http://localhost:3000", validation_alias="FRONTEND_URL")

  # When false, no in-process RSS/Yahoo/briefing/refinement loops — zero idle LLM. Use POST /cron/ingest-once
  # (secret) or POST /market/ingest-session (logged-in user, rate-limited) to pull news.
  enable_background_llm_loops: bool = Field(default=True, validation_alias="ENABLE_BACKGROUND_LLM_LOOPS")
  rss_interval_seconds: int = Field(default=60, validation_alias="RSS_INTERVAL_SECONDS")
  yahoo_fx_ticker: str = "SEK=X"

  yahoo_ticker_ingest_enabled: bool = True
  yahoo_ticker_ingest_interval_seconds: int = 120
  yahoo_ticker_ingest_max_tickers_per_cycle: int = 20

  scenario_refinement_interval_seconds: int = 900
  scenario_refinement_max_per_cycle: int = 3
  polymarket_enabled: bool = True

  default_rss_feeds: list[str] = Field(
    default_factory=lambda: [
      "https://feeds.reuters.com/reuters/topNews",
      "https://feeds.reuters.com/reuters/businessNews",
      "https://www.aljazeera.com/xml/rss/all.xml",
      "https://www.ft.com/?format=rss",
      "https://feeds.bloomberg.com/markets/news.rss",
      "https://seekingalpha.com/feed.xml",
    ]
  )


@lru_cache
def get_settings() -> Settings:
  return Settings()  # type: ignore[call-arg]
