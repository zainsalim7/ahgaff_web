"""
Simple in-memory TTL cache for frequently accessed, rarely changing data.

Usage:
    from cache import cache

    data = cache.get("departments")
    if data is None:
        data = await fetch_from_db()
        cache.set("departments", data, ttl=3600)

    # Invalidate on write
    cache.invalidate("departments")
    cache.invalidate_prefix("roles")   # clears all keys starting with "roles"
"""

import time
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Default TTLs (seconds)
TTL_DEPARTMENTS = 3600   # 1 hour  – rarely changes
TTL_ROLES       = 3600   # 1 hour  – rarely changes
TTL_SETTINGS    = 1800   # 30 min  – rarely changes
TTL_TEACHERS    = 1800   # 30 min  – changes occasionally


class TTLCache:
    """Thread-safe (asyncio-safe) in-memory cache with per-key TTL."""

    def __init__(self) -> None:
        # { key: (value, expiry_timestamp) }
        self._store: dict[str, tuple[Any, float]] = {}

    # ------------------------------------------------------------------
    # Core API
    # ------------------------------------------------------------------

    def get(self, key: str) -> Optional[Any]:
        """Return cached value or None if missing / expired."""
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expiry = entry
        if time.monotonic() > expiry:
            del self._store[key]
            logger.debug("Cache expired: %s", key)
            return None
        logger.debug("Cache hit: %s", key)
        return value

    def set(self, key: str, value: Any, ttl: int = 300) -> None:
        """Store *value* under *key* for *ttl* seconds."""
        self._store[key] = (value, time.monotonic() + ttl)
        logger.debug("Cache set: %s (ttl=%ds)", key, ttl)

    def invalidate(self, key: str) -> None:
        """Remove a single key from the cache."""
        if key in self._store:
            del self._store[key]
            logger.debug("Cache invalidated: %s", key)

    def invalidate_prefix(self, prefix: str) -> None:
        """Remove all keys that start with *prefix*."""
        keys = [k for k in self._store if k.startswith(prefix)]
        for k in keys:
            del self._store[k]
        if keys:
            logger.debug("Cache invalidated prefix '%s': %d key(s)", prefix, len(keys))

    def clear(self) -> None:
        """Flush the entire cache."""
        self._store.clear()
        logger.debug("Cache cleared")

    def __len__(self) -> int:
        return len(self._store)


# Module-level singleton used across all route modules
cache = TTLCache()
