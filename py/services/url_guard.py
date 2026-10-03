"""Outbound URL guard for backend proxies (SSRF mitigation).

Several routes (Ollama chat, Tagger VLM, Eagle, Unsloth relay) connect to a backend whose
address is supplied by the browser. Without a check, any caller that can reach ComfyUI could
make the server connect to an arbitrary host (cloud metadata, LAN services, file://).

Allowed targets:
  - loopback hosts (localhost / 127.0.0.1 / ::1), any port
  - hosts listed by the operator in the WFS_ALLOWED_BACKEND_HOSTS environment variable
    (comma-separated "host" or "host:port"; e.g. "192.168.1.20:11434,gpu-box")

Only http(s) URLs without credentials are accepted, and redirects are never followed.
"""

import os
import urllib.request
from urllib.parse import urlparse

LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}
ALLOWED_HOSTS_ENV = "WFS_ALLOWED_BACKEND_HOSTS"

HINT = (
    "Backend URL must point to localhost/127.0.0.1/::1. To use another host, list it in the "
    f"{ALLOWED_HOSTS_ENV} environment variable (e.g. 192.168.1.20:11434) and restart ComfyUI."
)


def _operator_allowlist():
    raw = os.environ.get(ALLOWED_HOSTS_ENV, "")
    return {item.strip().lower() for item in raw.split(",") if item.strip()}


def is_allowed_backend_url(url):
    """True if url is an http(s) URL without credentials whose host[:port] is permitted."""
    try:
        parsed = urlparse((url or "").strip())
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return False
        if parsed.username or parsed.password:
            return False
        host = parsed.hostname.lower()
        if host in LOOPBACK_HOSTS:
            return True
        allow = _operator_allowlist()
        return host in allow or (parsed.port is not None and f"{host}:{parsed.port}" in allow)
    except Exception:
        return False


def require_backend_url(url):
    """Return url stripped of trailing slashes, or raise ValueError(HINT)."""
    url = (url or "").strip()
    if not is_allowed_backend_url(url):
        raise ValueError(HINT)
    return url.rstrip("/")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_opener = urllib.request.build_opener(_NoRedirect)


def urlopen(req, timeout):
    """urllib urlopen that never follows redirects (a 3xx surfaces as HTTPError)."""
    return _opener.open(req, timeout=timeout)
