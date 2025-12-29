"""
Scraper Rate Limiter - Domain-keyed rate limiting for web scraping.

Separate from Flask-Limiter (which is user-keyed for API rate limiting).
Uses Redis in production, in-memory fallback for development.

Key format: scrape:{domain}:{route_group}
"""
import os
import time
import logging
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional

import yaml

logger = logging.getLogger(__name__)

# Redis URL from environment
REDIS_URL = os.environ.get("REDIS_URL")


class ScraperRateLimiter:
    """Rate limiter for web scraping with domain/route granularity."""

    def __init__(self, config_path: Optional[str] = None):
        """
        Initialize rate limiter.

        Args:
            config_path: Path to YAML config file.
                        Defaults to backend/config/scraper_rate_limits.yaml
        """
        self.config_path = config_path or self._default_config_path()
        self._config = None
        self._redis = None
        self._memory_store: Dict[str, list] = defaultdict(list)

    def _default_config_path(self) -> str:
        """Get default config path."""
        return str(
            Path(__file__).parent.parent / "config" / "scraper_rate_limits.yaml"
        )

    @property
    def config(self) -> Dict[str, Any]:
        """Load config (cached)."""
        if self._config is None:
            self._config = self._load_config()
        return self._config

    def _load_config(self) -> Dict[str, Any]:
        """Load rate limit configuration from YAML."""
        try:
            with open(self.config_path, "r") as f:
                config = yaml.safe_load(f)
                logger.info(f"Loaded rate limits from {self.config_path}")
                return config
        except FileNotFoundError:
            logger.warning(
                f"Rate limit config not found at {self.config_path}, using defaults"
            )
            return {
                "defaults": {
                    "requests_per_minute": 10,
                    "requests_per_hour": 100,
                    "burst_limit": 3,
                },
                "domains": {},
            }

    @property
    def redis(self):
        """Get Redis client (lazy init)."""
        if self._redis is None and REDIS_URL:
            try:
                import redis
                self._redis = redis.from_url(REDIS_URL)
                self._redis.ping()  # Test connection
                logger.info("Scraper rate limiter using Redis")
            except Exception as e:
                logger.warning(f"Failed to connect to Redis: {e}")
                self._redis = False  # Sentinel to prevent retries
        return self._redis if self._redis else None

    def _get_limits(
        self, domain: str, route_group: str = "default"
    ) -> Dict[str, int]:
        """
        Get rate limits for a domain/route combination.

        Args:
            domain: Domain name
            route_group: Route group within domain

        Returns:
            Dict with requests_per_minute, requests_per_hour, burst_limit
        """
        defaults = self.config.get("defaults", {})
        domain_config = self.config.get("domains", {}).get(domain, {})

        # Start with defaults
        limits = {
            "requests_per_minute": defaults.get("requests_per_minute", 10),
            "requests_per_hour": defaults.get("requests_per_hour", 100),
            "burst_limit": defaults.get("burst_limit", 3),
        }

        # Override with domain-level config
        for key in limits:
            if key in domain_config:
                limits[key] = domain_config[key]

        # Override with route-level config
        route_config = domain_config.get("routes", {}).get(route_group, {})
        for key in limits:
            if key in route_config:
                limits[key] = route_config[key]

        return limits

    def _make_key(self, domain: str, route_group: str = "default") -> str:
        """Create rate limit key."""
        return f"scrape:{domain}:{route_group}"

    def wait(self, domain: str, route_group: str = "default"):
        """
        Wait if rate limited, then record the request.

        Uses sliding window rate limiting:
        - Check requests in last minute
        - If over limit, sleep until allowed
        - Record this request

        Args:
            domain: Domain being scraped
            route_group: Route group within domain
        """
        limits = self._get_limits(domain, route_group)

        if self.redis:
            self._wait_redis(domain, route_group, limits)
        else:
            self._wait_memory(domain, route_group, limits)

    def _wait_redis(
        self, domain: str, route_group: str, limits: Dict[str, int]
    ):
        """Redis-backed rate limiting with sliding window."""
        key = self._make_key(domain, route_group)
        minute_key = f"{key}:minute"
        hour_key = f"{key}:hour"

        max_attempts = 60  # Max wait time ~60 seconds
        attempt = 0

        while attempt < max_attempts:
            now = time.time()
            now_int = int(now)

            # Clean old entries and count recent
            pipe = self.redis.pipeline()
            pipe.zremrangebyscore(minute_key, 0, now - 60)
            pipe.zremrangebyscore(hour_key, 0, now - 3600)
            pipe.zcard(minute_key)
            pipe.zcard(hour_key)
            results = pipe.execute()

            minute_count = results[2]
            hour_count = results[3]

            # Check limits
            if (
                minute_count < limits["requests_per_minute"]
                and hour_count < limits["requests_per_hour"]
            ):
                # Record this request
                pipe = self.redis.pipeline()
                pipe.zadd(minute_key, {str(now): now})
                pipe.zadd(hour_key, {str(now): now})
                pipe.expire(minute_key, 120)
                pipe.expire(hour_key, 7200)
                pipe.execute()
                return

            # Calculate wait time
            wait_time = 60 / limits["requests_per_minute"]
            logger.debug(
                f"Rate limited for {domain}, waiting {wait_time:.1f}s"
            )
            time.sleep(wait_time)
            attempt += 1

        raise RuntimeError(f"Rate limit wait timeout for {domain}")

    def _wait_memory(
        self, domain: str, route_group: str, limits: Dict[str, int]
    ):
        """In-memory rate limiting (for development)."""
        key = self._make_key(domain, route_group)
        now = time.time()

        # Clean old entries
        self._memory_store[key] = [
            t for t in self._memory_store[key] if now - t < 60
        ]

        # Check if over limit
        if len(self._memory_store[key]) >= limits["requests_per_minute"]:
            wait_time = 60 / limits["requests_per_minute"]
            logger.debug(
                f"Rate limited for {domain}, waiting {wait_time:.1f}s (memory)"
            )
            time.sleep(wait_time)

        # Record request
        self._memory_store[key].append(now)

    def is_allowed(self, domain: str, route_group: str = "default") -> bool:
        """
        Check if a request is allowed without waiting.

        Args:
            domain: Domain being scraped
            route_group: Route group within domain

        Returns:
            True if request is allowed
        """
        limits = self._get_limits(domain, route_group)

        if self.redis:
            key = self._make_key(domain, route_group)
            minute_key = f"{key}:minute"
            now = time.time()

            self.redis.zremrangebyscore(minute_key, 0, now - 60)
            count = self.redis.zcard(minute_key)
            return count < limits["requests_per_minute"]
        else:
            key = self._make_key(domain, route_group)
            now = time.time()
            recent = [
                t for t in self._memory_store[key] if now - t < 60
            ]
            return len(recent) < limits["requests_per_minute"]

    def get_status(self, domain: str, route_group: str = "default") -> Dict:
        """
        Get current rate limit status for a domain.

        Args:
            domain: Domain to check
            route_group: Route group within domain

        Returns:
            Dict with current counts and limits
        """
        limits = self._get_limits(domain, route_group)
        key = self._make_key(domain, route_group)

        if self.redis:
            minute_key = f"{key}:minute"
            hour_key = f"{key}:hour"
            now = time.time()

            self.redis.zremrangebyscore(minute_key, 0, now - 60)
            self.redis.zremrangebyscore(hour_key, 0, now - 3600)

            minute_count = self.redis.zcard(minute_key)
            hour_count = self.redis.zcard(hour_key)
        else:
            now = time.time()
            minute_count = len([
                t for t in self._memory_store[key] if now - t < 60
            ])
            hour_count = len([
                t for t in self._memory_store[key] if now - t < 3600
            ])

        return {
            "domain": domain,
            "route_group": route_group,
            "minute": {
                "current": minute_count,
                "limit": limits["requests_per_minute"],
            },
            "hour": {
                "current": hour_count,
                "limit": limits["requests_per_hour"],
            },
            "is_allowed": minute_count < limits["requests_per_minute"],
        }


# Global instance (lazy init)
_rate_limiter = None


def get_scraper_rate_limiter() -> ScraperRateLimiter:
    """Get the global scraper rate limiter instance."""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = ScraperRateLimiter()
    return _rate_limiter
