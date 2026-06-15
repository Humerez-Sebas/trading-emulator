"""Runtime feature flags via Flagsmith (self-hosted), with env-var fallback.

The schema-level Timescale decision is governed by the ``TIMESCALE_ENABLED``
env var read in the Alembic migrations -- it must match what was actually built
in the database and therefore can't be a runtime toggle. These flags only steer
*read-path* behaviour (which coverage query /symbols runs, whether
/ingest/refresh does anything) and the registration gate, all of which can be
flipped from the Flagsmith dashboard without a redeploy.

If ``FLAGSMITH_KEY`` is unset, or Flagsmith is unreachable, every flag falls
back to the matching value in :class:`~app.config.Settings`, so the test suite
and a bare ``uvicorn`` run work with no Flagsmith at all. The Flagsmith import
is lazy (inside ``_client``) so the package isn't even required when no key is
configured.
"""

import logging
from functools import lru_cache

from .config import get_settings

logger = logging.getLogger("uvicorn.error")

# Flag names as defined in the Flagsmith environment.
TIMESCALE_FLAG = "timescale_enabled"
REGISTRATION_FLAG = "registration_enabled"


def _default_handler(feature_name: str):
    """Flagsmith default when a flag is missing or the API is unreachable."""
    from flagsmith.models import DefaultFlag

    s = get_settings()
    defaults = {
        TIMESCALE_FLAG: s.timescale_enabled,
        REGISTRATION_FLAG: s.registration_enabled,
    }
    return DefaultFlag(enabled=defaults.get(feature_name, False), value=None)


@lru_cache
def _client():
    """A cached Flagsmith client, or ``None`` when no key is configured.

    Local evaluation mode polls the environment document in the background and
    evaluates flags in-process, so per-request reads don't make a network call.
    """
    s = get_settings()
    if not s.flagsmith_key:
        return None
    try:
        from flagsmith import Flagsmith

        kwargs = {
            "environment_key": s.flagsmith_key,
            "enable_local_evaluation": True,
            "environment_refresh_interval_seconds": 60,
            "request_timeout_seconds": 3,
            "default_flag_handler": _default_handler,
        }
        if s.flagsmith_api_url:
            kwargs["api_url"] = s.flagsmith_api_url
        return Flagsmith(**kwargs)
    except Exception:  # pragma: no cover - never block startup on Flagsmith
        logger.warning("Flagsmith client init failed; using env fallbacks", exc_info=True)
        return None


def _is_enabled(flag_name: str, fallback: bool) -> bool:
    client = _client()
    if client is None:
        return fallback
    try:
        return client.get_environment_flags().is_feature_enabled(flag_name)
    except Exception:  # pragma: no cover - degrade to env fallback
        logger.warning("Flagsmith read failed for %r; using fallback", flag_name, exc_info=True)
        return fallback


def is_timescale_enabled() -> bool:
    return _is_enabled(TIMESCALE_FLAG, get_settings().timescale_enabled)


def is_registration_enabled() -> bool:
    return _is_enabled(REGISTRATION_FLAG, get_settings().registration_enabled)


def reset_cache() -> None:
    """Drop the cached client (used by tests after changing settings)."""
    _client.cache_clear()
