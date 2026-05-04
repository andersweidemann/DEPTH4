from urllib.parse import urlparse

from supabase import Client, create_client

from signal_api.config import Settings, get_settings


def _normalize_supabase_url(raw: str) -> str:
  """Match web `normalizeSupabaseUrl`: trim, strip quotes, https + *.supabase.co for hosted projects."""
  v = (raw or "").strip()
  if not v:
    return ""
  v = v.strip().strip("'\"")
  v = "".join(v.split())
  v = v.rstrip("/")
  try:
    parsed = urlparse(v)
    host = (parsed.hostname or "").lower()
    if not host:
      return ""
    is_local = host in ("localhost", "127.0.0.1")
    if is_local:
      if parsed.scheme not in ("http", "https"):
        return ""
    elif parsed.scheme != "https" or not host.endswith(".supabase.co"):
      return ""
    return f"{parsed.scheme}://{parsed.netloc}"
  except Exception:
    return ""


def _normalize_service_role_key(raw: str) -> str:
  v = (raw or "").strip().strip("'\"")
  if v.lower().startswith("bearer "):
    v = v[7:].strip()
  v = "".join(v.split())
  return v


def supabase_admin(settings: Settings | None = None) -> Client:
  s = settings or get_settings()
  raw_url = s.supabase_url
  key = _normalize_service_role_key(s.supabase_service_key.get_secret_value())
  url = _normalize_supabase_url(raw_url)
  if not url or not key:
    raise RuntimeError(
      "Supabase URL and SUPABASE_SERVICE_ROLE_KEY are required (check Render env: "
      "https://…supabase.co, no quotes, service role not anon key)."
    )
  try:
    return create_client(url, key)
  except Exception as e:
    msg = f"Supabase client init failed: {e!s}. "
    msg += "Verify SUPABASE_URL is https://YOUR-PROJECT.supabase.co and SUPABASE_SERVICE_ROLE_KEY is the service_role secret."
    raise RuntimeError(msg) from e
