"""
URA Data Service API Client - Transaction data fetching

URA API Documentation: https://eservice.ura.gov.sg/maps/api/

Authentication:
- AccessKey provided via email upon account activation
- Token obtained via GET /insertNewToken (daily validity)
- Both AccessKey and Token required for data endpoints

Endpoints:
- Token: GET /uraDataService/insertNewToken/v1
- Transactions: GET /uraDataService/invokeUraDS/v1?service=PMI_Resi_Transaction&batch={1-4}

Rate Limits:
- Conservative: 6 requests/minute (no official limit documented)
- Token refresh: Once per day

Usage:
    from services.ura_api_client import URAAPIClient

    client = URAAPIClient()

    # Fetch all transaction batches
    for batch_num, projects in client.fetch_all_transactions():
        for project in projects:
            for txn in project.get('transaction', []):
                print(f"{project['project']}: ${txn['price']}")
"""

import os
import time
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Iterator, Tuple, Any
from dataclasses import dataclass, field

import requests

from scrapers.rate_limiter import get_scraper_rate_limiter

logger = logging.getLogger(__name__)


# =============================================================================
# Configuration
# =============================================================================

URA_TOKEN_URL = "https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1"
URA_DATA_URL = "https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1"
URA_DOMAIN = "eservice.ura.gov.sg"

# Transaction batches cover different postal districts
# Batch 1: D01-D07, Batch 2: D08-D14, Batch 3: D15-D21, Batch 4: D22-D28
TRANSACTION_BATCHES = [1, 2, 3, 4]

# Retry configuration
MAX_RETRIES = 3
INITIAL_BACKOFF_SECONDS = 1.0
BACKOFF_MULTIPLIER = 2.0

# Token cache TTL (23 hours - 1 hour safety margin from 24h validity)
TOKEN_CACHE_TTL_HOURS = 23


def _utcnow() -> datetime:
    """Get current UTC time (timezone-aware)."""
    return datetime.now(timezone.utc)


@dataclass
class URAToken:
    """Cached URA API token with expiry tracking."""
    value: str
    obtained_at: datetime = field(default_factory=_utcnow)

    def is_expired(self) -> bool:
        """Check if token has expired (23h TTL)."""
        expiry = self.obtained_at + timedelta(hours=TOKEN_CACHE_TTL_HOURS)
        return _utcnow() >= expiry

    def time_until_expiry(self) -> timedelta:
        """Get time remaining until expiry."""
        expiry = self.obtained_at + timedelta(hours=TOKEN_CACHE_TTL_HOURS)
        return expiry - _utcnow()


@dataclass
class URAAPIResponse:
    """Wrapper for URA API response."""
    success: bool
    data: Optional[List[Dict]] = None
    error: Optional[str] = None
    status_code: Optional[int] = None
    batch_num: Optional[int] = None
    duration_seconds: Optional[float] = None
    retry_count: int = 0


class URAAPIError(Exception):
    """Base exception for URA API errors."""
    pass


class URATokenError(URAAPIError):
    """Token-related errors."""
    pass


class URADataError(URAAPIError):
    """Data fetching errors."""
    pass


class URAAPIClient:
    """
    URA Data Service API client for fetching property transaction data.

    Features:
    - Token caching with 23h TTL
    - Automatic token refresh before expiry
    - Retry with exponential backoff
    - Rate limiting integration
    - Batch fetching for all districts

    Example:
        client = URAAPIClient()

        # Fetch single batch
        response = client.fetch_transactions(batch=1)
        if response.success:
            for project in response.data:
                print(project['project'])

        # Fetch all batches
        for batch_num, projects in client.fetch_all_transactions():
            print(f"Batch {batch_num}: {len(projects)} projects")
    """

    def __init__(self, access_key: Optional[str] = None):
        """
        Initialize URA API client.

        Args:
            access_key: URA API access key. Defaults to URA_ACCESS_KEY env var.
        """
        self.access_key = access_key or os.environ.get("URA_ACCESS_KEY")
        if not self.access_key:
            raise URAAPIError(
                "URA_ACCESS_KEY not found. Set URA_ACCESS_KEY environment variable "
                "or pass access_key to constructor."
            )

        self._token: Optional[URAToken] = None
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": "SGPropertyAnalytics/1.0 (property research platform)"
        })
        self._rate_limiter = get_scraper_rate_limiter()

        logger.info("URA API client initialized")

    # =========================================================================
    # Token Management
    # =========================================================================

    def _get_token(self) -> str:
        """
        Get valid token, refreshing if expired or not yet obtained.

        Returns:
            Valid API token string.

        Raises:
            URATokenError: If token refresh fails.
        """
        if self._token is None or self._token.is_expired():
            self._refresh_token()

        return self._token.value

    def _refresh_token(self) -> None:
        """
        Refresh the API token from URA.

        Raises:
            URATokenError: If token refresh fails after retries.
        """
        logger.info("Refreshing URA API token")

        for attempt in range(MAX_RETRIES):
            try:
                # Rate limit token requests
                self._rate_limiter.wait(URA_DOMAIN, "token")

                response = self._session.get(
                    URA_TOKEN_URL,
                    headers={"AccessKey": self.access_key},
                    timeout=30
                )

                if response.status_code == 401:
                    raise URATokenError("Invalid AccessKey - check URA_ACCESS_KEY")

                response.raise_for_status()
                data = response.json()

                # URA returns {"Status": "Success", "Result": "token_value"}
                if data.get("Status") == "Success" and data.get("Result"):
                    self._token = URAToken(value=data["Result"])
                    logger.info(
                        f"Token refreshed successfully, expires in "
                        f"{self._token.time_until_expiry()}"
                    )
                    return
                else:
                    raise URATokenError(f"Unexpected token response: {data}")

            except requests.exceptions.RequestException as e:
                backoff = INITIAL_BACKOFF_SECONDS * (BACKOFF_MULTIPLIER ** attempt)
                logger.warning(
                    f"Token refresh attempt {attempt + 1}/{MAX_RETRIES} failed: {e}. "
                    f"Retrying in {backoff}s"
                )
                if attempt < MAX_RETRIES - 1:
                    time.sleep(backoff)
                else:
                    raise URATokenError(f"Token refresh failed after {MAX_RETRIES} attempts: {e}")

    def ensure_valid_token(self) -> None:
        """
        Ensure we have a valid token, refreshing if needed.

        Call this before starting a batch of requests to avoid
        token expiry mid-sync.
        """
        if self._token is None:
            self._refresh_token()
        elif self._token.is_expired():
            self._refresh_token()
        elif self._token.time_until_expiry() < timedelta(hours=1):
            # Proactively refresh if less than 1 hour remaining
            logger.info("Token expiring soon, proactively refreshing")
            self._refresh_token()

    # =========================================================================
    # Data Fetching
    # =========================================================================

    def fetch_transactions(self, batch: int) -> URAAPIResponse:
        """
        Fetch transaction data for a single batch.

        Args:
            batch: Batch number (1-4), covering different postal districts.
                   Batch 1: D01-D07
                   Batch 2: D08-D14
                   Batch 3: D15-D21
                   Batch 4: D22-D28

        Returns:
            URAAPIResponse with list of projects containing transactions.

        Raises:
            URADataError: If fetching fails after retries.
        """
        if batch not in TRANSACTION_BATCHES:
            raise ValueError(f"Invalid batch {batch}, must be one of {TRANSACTION_BATCHES}")

        start_time = time.time()
        retry_count = 0

        for attempt in range(MAX_RETRIES):
            try:
                # Ensure valid token
                token = self._get_token()

                # Rate limit
                self._rate_limiter.wait(URA_DOMAIN, "transactions")

                response = self._session.get(
                    URA_DATA_URL,
                    params={
                        "service": "PMI_Resi_Transaction",
                        "batch": batch
                    },
                    headers={
                        "AccessKey": self.access_key,
                        "Token": token
                    },
                    timeout=60  # Larger timeout for data requests
                )

                # Handle 401 - token may have expired server-side
                if response.status_code == 401:
                    logger.warning("Got 401, refreshing token and retrying")
                    self._token = None  # Force refresh
                    retry_count += 1
                    if attempt < MAX_RETRIES - 1:
                        continue
                    else:
                        duration = time.time() - start_time
                        return URAAPIResponse(
                            success=False,
                            error="Authentication failed after token refresh",
                            status_code=401,
                            batch_num=batch,
                            duration_seconds=duration,
                            retry_count=retry_count
                        )

                response.raise_for_status()
                data = response.json()

                # Check for URA error response format
                if data.get("Status") == "Error" or "error" in str(data).lower():
                    error_msg = data.get("Message", str(data))
                    logger.error(f"URA API error for batch {batch}: {error_msg}")
                    duration = time.time() - start_time
                    return URAAPIResponse(
                        success=False,
                        error=f"URA API error: {error_msg}",
                        status_code=response.status_code,
                        batch_num=batch,
                        duration_seconds=duration,
                        retry_count=retry_count
                    )

                # URA returns {"Result": [...projects...]}
                result = data.get("Result", [])

                # Handle empty/null response
                if result is None:
                    logger.warning(f"Batch {batch}: Result is null, treating as empty")
                    result = []

                duration = time.time() - start_time
                logger.info(
                    f"Batch {batch}: {len(result)} projects, "
                    f"{duration:.2f}s, retries={retry_count}"
                )

                return URAAPIResponse(
                    success=True,
                    data=result,
                    status_code=response.status_code,
                    batch_num=batch,
                    duration_seconds=duration,
                    retry_count=retry_count
                )

            except requests.exceptions.RequestException as e:
                retry_count += 1
                backoff = INITIAL_BACKOFF_SECONDS * (BACKOFF_MULTIPLIER ** attempt)
                logger.warning(
                    f"Batch {batch} attempt {attempt + 1}/{MAX_RETRIES} failed: {e}. "
                    f"Retrying in {backoff:.1f}s"
                )
                if attempt < MAX_RETRIES - 1:
                    time.sleep(backoff)
                else:
                    duration = time.time() - start_time
                    return URAAPIResponse(
                        success=False,
                        error=f"Failed after {MAX_RETRIES} attempts: {e}",
                        batch_num=batch,
                        duration_seconds=duration,
                        retry_count=retry_count
                    )

        # Should not reach here
        duration = time.time() - start_time
        return URAAPIResponse(
            success=False,
            error="Unexpected error",
            batch_num=batch,
            duration_seconds=duration,
            retry_count=retry_count
        )

    def fetch_all_transactions(self) -> Iterator[Tuple[int, List[Dict]]]:
        """
        Fetch transactions from all batches.

        Yields:
            Tuple of (batch_number, list of projects with transactions).

        Raises:
            URADataError: If any batch fails.

        Example:
            client = URAAPIClient()
            all_projects = []
            for batch_num, projects in client.fetch_all_transactions():
                all_projects.extend(projects)
        """
        # Ensure token is valid before starting
        self.ensure_valid_token()

        for batch in TRANSACTION_BATCHES:
            response = self.fetch_transactions(batch)

            if not response.success:
                raise URADataError(
                    f"Failed to fetch batch {batch}: {response.error}"
                )

            yield batch, response.data

    def fetch_all_transactions_flat(self) -> List[Dict]:
        """
        Fetch all transactions and return flattened list of projects.

        Returns:
            Combined list of all projects from all batches.

        Raises:
            URADataError: If any batch fails.
        """
        all_projects = []
        for batch_num, projects in self.fetch_all_transactions():
            all_projects.extend(projects)

        logger.info(f"Fetched {len(all_projects)} total projects from all batches")
        return all_projects

    # =========================================================================
    # Utility Methods
    # =========================================================================

    def get_token_status(self) -> Dict[str, Any]:
        """
        Get current token status for monitoring.

        Returns:
            Dict with token status information.
        """
        if self._token is None:
            return {
                "has_token": False,
                "is_expired": True,
                "time_until_expiry": None
            }

        return {
            "has_token": True,
            "is_expired": self._token.is_expired(),
            "time_until_expiry": str(self._token.time_until_expiry()),
            "obtained_at": self._token.obtained_at.isoformat()
        }

    def health_check(self) -> Dict[str, Any]:
        """
        Perform health check by fetching a token and small data sample.

        Returns:
            Dict with health check results.
        """
        result = {
            "status": "unknown",
            "token_ok": False,
            "data_ok": False,
            "error": None
        }

        try:
            # Test token refresh
            self._refresh_token()
            result["token_ok"] = True

            # Test data fetch (batch 1 only for speed)
            response = self.fetch_transactions(batch=1)
            result["data_ok"] = response.success
            result["sample_projects"] = len(response.data) if response.data else 0

            if result["token_ok"] and result["data_ok"]:
                result["status"] = "healthy"
            else:
                result["status"] = "degraded"
                result["error"] = response.error

        except Exception as e:
            result["status"] = "unhealthy"
            result["error"] = str(e)

        return result

    def close(self) -> None:
        """Close the HTTP session."""
        self._session.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


# =============================================================================
# Module-level convenience functions
# =============================================================================

_client: Optional[URAAPIClient] = None


def get_ura_client() -> URAAPIClient:
    """
    Get global URA API client instance (lazy initialization).

    Returns:
        Shared URAAPIClient instance.
    """
    global _client
    if _client is None:
        _client = URAAPIClient()
    return _client


def fetch_all_ura_transactions() -> List[Dict]:
    """
    Convenience function to fetch all URA transactions.

    Returns:
        List of all projects with transaction data.
    """
    return get_ura_client().fetch_all_transactions_flat()


# =============================================================================
# Smoke Test (E2E validation)
# =============================================================================

if __name__ == "__main__":
    """
    Integration smoke test - validates end-to-end API flow.

    Usage:
        URA_ACCESS_KEY=xxx python -m services.ura_api_client

    Expected output:
        - Token fetch success
        - 4 batches fetched with timing
        - Total transaction count
        - Exit 0 on success
    """
    import sys

    # Configure logging for smoke test
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S"
    )

    print("=" * 60)
    print("URA API Client - Integration Smoke Test")
    print("=" * 60)

    try:
        client = URAAPIClient()
        print(f"[OK] Client initialized")

        # Test 1: Token fetch
        client.ensure_valid_token()
        token_status = client.get_token_status()
        print(f"[OK] Token obtained, expires in {token_status['time_until_expiry']}")

        # Test 2: Fetch all batches
        total_projects = 0
        total_transactions = 0

        for batch_num, projects in client.fetch_all_transactions():
            batch_txn_count = sum(
                len(p.get("transaction", [])) for p in projects
            )
            total_projects += len(projects)
            total_transactions += batch_txn_count
            print(
                f"[OK] Batch {batch_num}: {len(projects)} projects, "
                f"{batch_txn_count} transactions"
            )

        print("=" * 60)
        print(f"SUMMARY:")
        print(f"  Total projects:     {total_projects}")
        print(f"  Total transactions: {total_transactions}")
        print("=" * 60)

        if total_transactions == 0:
            print("[WARN] No transactions returned - check date range")
            sys.exit(1)

        print("[SUCCESS] Smoke test passed")
        sys.exit(0)

    except Exception as e:
        print(f"[FAIL] Smoke test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
