from supabase import create_client, Client

from app.core.config import settings

_client: Client | None = None
_admin_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_key)
    return _client


def get_supabase_admin() -> Client:
    """Returns a service-role client that bypasses RLS. Use only server-side."""
    global _admin_client
    if _admin_client is None:
        key = settings.supabase_secret_key or settings.supabase_key
        _admin_client = create_client(settings.supabase_url, key)
    return _admin_client
