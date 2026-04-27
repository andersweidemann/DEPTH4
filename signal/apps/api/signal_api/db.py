from supabase import Client, create_client

from signal_api.config import Settings, get_settings


def supabase_admin(settings: Settings | None = None) -> Client:
  s = settings or get_settings()
  url, key = s.supabase_url, s.supabase_service_key.get_secret_value()
  if not url or not key:
    raise RuntimeError("Supabase URL and SUPABASE_SERVICE_ROLE_KEY are required")
  return create_client(url, key)
