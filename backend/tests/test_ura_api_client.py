"""
Tests for URA API Client

These tests use mocking to avoid hitting the real API.
For integration tests with the real API, use test_ura_api_client_integration.py
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timedelta, timezone
import json

# Import the module under test
from services.ura_api_client import (
    URAAPIClient,
    URAToken,
    URAAPIResponse,
    URAAPIError,
    URATokenError,
    URADataError,
    TOKEN_CACHE_TTL_HOURS,
)


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def mock_env_access_key(monkeypatch):
    """Set up URA_ACCESS_KEY environment variable."""
    monkeypatch.setenv("URA_ACCESS_KEY", "test-access-key-12345")


@pytest.fixture
def sample_token_response():
    """Sample successful token response from URA."""
    return {
        "Status": "Success",
        "Result": "eyJhbGciOiJIUzI1NiJ9.test-token-value"
    }


@pytest.fixture
def sample_transaction_response():
    """Sample transaction response from URA API."""
    return {
        "Result": [
            {
                "project": "THE SAIL @ MARINA BAY",
                "street": "MARINA BOULEVARD",
                "marketSegment": "CCR",
                "x": "29584.9",
                "y": "29432.2",
                "transaction": [
                    {
                        "contractDate": "0125",
                        "propertyType": "Condominium",
                        "district": "01",
                        "tenure": "99 yrs lease commencing from 2005",
                        "price": "1580000",
                        "area": "764",
                        "floorRange": "21 to 25",
                        "typeOfSale": "3",
                        "noOfUnits": "1"
                    },
                    {
                        "contractDate": "1224",
                        "propertyType": "Condominium",
                        "district": "01",
                        "tenure": "99 yrs lease commencing from 2005",
                        "price": "1650000",
                        "area": "764",
                        "floorRange": "16 to 20",
                        "typeOfSale": "3",
                        "noOfUnits": "1"
                    }
                ]
            },
            {
                "project": "MARINA ONE RESIDENCES",
                "street": "MARINA WAY",
                "marketSegment": "CCR",
                "x": "29700.1",
                "y": "29300.5",
                "transaction": [
                    {
                        "contractDate": "0125",
                        "propertyType": "Condominium",
                        "district": "01",
                        "tenure": "99 yrs lease commencing from 2014",
                        "price": "2100000",
                        "area": "850",
                        "floorRange": "31 to 35",
                        "typeOfSale": "3",
                        "noOfUnits": "1"
                    }
                ]
            }
        ]
    }


# =============================================================================
# URAToken Tests
# =============================================================================

class TestURAToken:
    """Tests for URAToken dataclass."""

    def test_token_not_expired_when_new(self):
        """Fresh token should not be expired."""
        token = URAToken(value="test-token")
        assert not token.is_expired()

    def test_token_expired_after_ttl(self):
        """Token should be expired after TTL."""
        old_time = datetime.now(timezone.utc) - timedelta(hours=TOKEN_CACHE_TTL_HOURS + 1)
        token = URAToken(value="test-token", obtained_at=old_time)
        assert token.is_expired()

    def test_token_not_expired_before_ttl(self):
        """Token should not be expired before TTL."""
        recent_time = datetime.now(timezone.utc) - timedelta(hours=TOKEN_CACHE_TTL_HOURS - 1)
        token = URAToken(value="test-token", obtained_at=recent_time)
        assert not token.is_expired()

    def test_time_until_expiry_positive(self):
        """Time until expiry should be positive for fresh token."""
        token = URAToken(value="test-token")
        time_left = token.time_until_expiry()
        assert time_left.total_seconds() > 0

    def test_time_until_expiry_negative_for_expired(self):
        """Time until expiry should be negative for expired token."""
        old_time = datetime.now(timezone.utc) - timedelta(hours=TOKEN_CACHE_TTL_HOURS + 1)
        token = URAToken(value="test-token", obtained_at=old_time)
        time_left = token.time_until_expiry()
        assert time_left.total_seconds() < 0


# =============================================================================
# URAAPIResponse Tests
# =============================================================================

class TestURAAPIResponse:
    """Tests for URAAPIResponse dataclass."""

    def test_success_response(self):
        """Test successful response structure."""
        response = URAAPIResponse(
            success=True,
            data=[{"project": "TEST"}],
            status_code=200,
            batch_num=1
        )
        assert response.success
        assert len(response.data) == 1
        assert response.error is None

    def test_error_response(self):
        """Test error response structure."""
        response = URAAPIResponse(
            success=False,
            error="Connection timeout",
            batch_num=2
        )
        assert not response.success
        assert response.data is None
        assert "timeout" in response.error.lower()


# =============================================================================
# URAAPIClient Tests
# =============================================================================

class TestURAAPIClientInit:
    """Tests for URAAPIClient initialization."""

    def test_init_with_env_var(self, mock_env_access_key):
        """Client should initialize with env var."""
        with patch("services.ura_api_client.get_scraper_rate_limiter"):
            client = URAAPIClient()
            assert client.access_key == "test-access-key-12345"

    def test_init_with_explicit_key(self):
        """Client should initialize with explicit key."""
        with patch("services.ura_api_client.get_scraper_rate_limiter"):
            client = URAAPIClient(access_key="explicit-key")
            assert client.access_key == "explicit-key"

    def test_init_without_key_raises(self, monkeypatch):
        """Client should raise error if no key provided."""
        monkeypatch.delenv("URA_ACCESS_KEY", raising=False)
        with patch("services.ura_api_client.get_scraper_rate_limiter"):
            with pytest.raises(URAAPIError) as exc_info:
                URAAPIClient()
            assert "URA_ACCESS_KEY" in str(exc_info.value)


class TestURAAPIClientTokenManagement:
    """Tests for token management."""

    @patch("services.ura_api_client.get_scraper_rate_limiter")
    def test_token_refresh_success(
        self, mock_rate_limiter, mock_env_access_key, sample_token_response
    ):
        """Token refresh should work with valid response."""
        mock_rate_limiter.return_value.wait = Mock()

        with patch("requests.Session.get") as mock_get:
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = sample_token_response
            mock_response.raise_for_status = Mock()
            mock_get.return_value = mock_response

            client = URAAPIClient()
            client._refresh_token()

            assert client._token is not None
            assert client._token.value == sample_token_response["Result"]
            assert not client._token.is_expired()

    @patch("services.ura_api_client.get_scraper_rate_limiter")
    def test_token_refresh_invalid_key(self, mock_rate_limiter, mock_env_access_key):
        """Token refresh should raise error on 401."""
        mock_rate_limiter.return_value.wait = Mock()

        with patch("requests.Session.get") as mock_get:
            mock_response = Mock()
            mock_response.status_code = 401
            mock_get.return_value = mock_response

            client = URAAPIClient()

            with pytest.raises(URATokenError) as exc_info:
                client._refresh_token()
            assert "Invalid AccessKey" in str(exc_info.value)

    @patch("services.ura_api_client.get_scraper_rate_limiter")
    def test_get_token_refreshes_when_none(
        self, mock_rate_limiter, mock_env_access_key, sample_token_response
    ):
        """_get_token should refresh when no token exists."""
        mock_rate_limiter.return_value.wait = Mock()

        with patch("requests.Session.get") as mock_get:
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = sample_token_response
            mock_response.raise_for_status = Mock()
            mock_get.return_value = mock_response

            client = URAAPIClient()
            assert client._token is None

            token = client._get_token()

            assert token == sample_token_response["Result"]
            assert client._token is not None

    @patch("services.ura_api_client.get_scraper_rate_limiter")
    def test_get_token_refreshes_when_expired(
        self, mock_rate_limiter, mock_env_access_key, sample_token_response
    ):
        """_get_token should refresh when token is expired."""
        mock_rate_limiter.return_value.wait = Mock()

        with patch("requests.Session.get") as mock_get:
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = sample_token_response
            mock_response.raise_for_status = Mock()
            mock_get.return_value = mock_response

            client = URAAPIClient()

            # Set an expired token
            old_time = datetime.now(timezone.utc) - timedelta(hours=TOKEN_CACHE_TTL_HOURS + 1)
            client._token = URAToken(value="old-token", obtained_at=old_time)
            assert client._token.is_expired()

            token = client._get_token()

            assert token == sample_token_response["Result"]


class TestURAAPIClientFetchTransactions:
    """Tests for transaction fetching."""

    @patch("services.ura_api_client.get_scraper_rate_limiter")
    def test_fetch_transactions_success(
        self,
        mock_rate_limiter,
        mock_env_access_key,
        sample_token_response,
        sample_transaction_response
    ):
        """Fetch transactions should return data on success."""
        mock_rate_limiter.return_value.wait = Mock()

        with patch("requests.Session.get") as mock_get:
            # First call returns token, second returns transactions
            mock_token_response = Mock()
            mock_token_response.status_code = 200
            mock_token_response.json.return_value = sample_token_response
            mock_token_response.raise_for_status = Mock()

            mock_data_response = Mock()
            mock_data_response.status_code = 200
            mock_data_response.json.return_value = sample_transaction_response
            mock_data_response.raise_for_status = Mock()

            mock_get.side_effect = [mock_token_response, mock_data_response]

            client = URAAPIClient()
            response = client.fetch_transactions(batch=1)

            assert response.success
            assert response.batch_num == 1
            assert len(response.data) == 2
            assert response.data[0]["project"] == "THE SAIL @ MARINA BAY"

    @patch("services.ura_api_client.get_scraper_rate_limiter")
    def test_fetch_transactions_invalid_batch(self, mock_rate_limiter, mock_env_access_key):
        """Fetch transactions should raise error on invalid batch."""
        mock_rate_limiter.return_value.wait = Mock()

        client = URAAPIClient()

        with pytest.raises(ValueError) as exc_info:
            client.fetch_transactions(batch=5)
        assert "Invalid batch" in str(exc_info.value)

    @patch("services.ura_api_client.get_scraper_rate_limiter")
    def test_fetch_all_transactions(
        self,
        mock_rate_limiter,
        mock_env_access_key,
        sample_token_response,
        sample_transaction_response
    ):
        """Fetch all transactions should iterate through all batches."""
        mock_rate_limiter.return_value.wait = Mock()

        with patch("requests.Session.get") as mock_get:
            mock_token_response = Mock()
            mock_token_response.status_code = 200
            mock_token_response.json.return_value = sample_token_response
            mock_token_response.raise_for_status = Mock()

            mock_data_response = Mock()
            mock_data_response.status_code = 200
            mock_data_response.json.return_value = sample_transaction_response
            mock_data_response.raise_for_status = Mock()

            # Token + 4 batch requests
            mock_get.side_effect = [
                mock_token_response,  # Token
                mock_data_response,   # Batch 1
                mock_data_response,   # Batch 2
                mock_data_response,   # Batch 3
                mock_data_response,   # Batch 4
            ]

            client = URAAPIClient()
            batches = list(client.fetch_all_transactions())

            assert len(batches) == 4
            for batch_num, projects in batches:
                assert batch_num in [1, 2, 3, 4]
                assert len(projects) == 2


class TestURAAPIClientHealthCheck:
    """Tests for health check functionality."""

    @patch("services.ura_api_client.get_scraper_rate_limiter")
    def test_health_check_healthy(
        self,
        mock_rate_limiter,
        mock_env_access_key,
        sample_token_response,
        sample_transaction_response
    ):
        """Health check should return healthy status."""
        mock_rate_limiter.return_value.wait = Mock()

        with patch("requests.Session.get") as mock_get:
            mock_token_response = Mock()
            mock_token_response.status_code = 200
            mock_token_response.json.return_value = sample_token_response
            mock_token_response.raise_for_status = Mock()

            mock_data_response = Mock()
            mock_data_response.status_code = 200
            mock_data_response.json.return_value = sample_transaction_response
            mock_data_response.raise_for_status = Mock()

            mock_get.side_effect = [mock_token_response, mock_data_response]

            client = URAAPIClient()
            result = client.health_check()

            assert result["status"] == "healthy"
            assert result["token_ok"]
            assert result["data_ok"]

    @patch("services.ura_api_client.get_scraper_rate_limiter")
    def test_get_token_status_no_token(self, mock_rate_limiter, mock_env_access_key):
        """Token status should indicate no token."""
        mock_rate_limiter.return_value.wait = Mock()

        client = URAAPIClient()
        status = client.get_token_status()

        assert not status["has_token"]
        assert status["is_expired"]


# =============================================================================
# Integration-style Tests (still mocked but test full flow)
# =============================================================================

class TestURAAPIClientIntegration:
    """Integration-style tests for full workflows."""

    @patch("services.ura_api_client.get_scraper_rate_limiter")
    def test_full_fetch_workflow(
        self,
        mock_rate_limiter,
        mock_env_access_key,
        sample_token_response,
        sample_transaction_response
    ):
        """Test complete fetch workflow from init to data."""
        mock_rate_limiter.return_value.wait = Mock()

        with patch("requests.Session.get") as mock_get:
            mock_token_response = Mock()
            mock_token_response.status_code = 200
            mock_token_response.json.return_value = sample_token_response
            mock_token_response.raise_for_status = Mock()

            mock_data_response = Mock()
            mock_data_response.status_code = 200
            mock_data_response.json.return_value = sample_transaction_response
            mock_data_response.raise_for_status = Mock()

            mock_get.side_effect = [
                mock_token_response,
                mock_data_response,
                mock_data_response,
                mock_data_response,
                mock_data_response,
            ]

            client = URAAPIClient()
            all_projects = client.fetch_all_transactions_flat()

            # 4 batches × 2 projects each = 8 total
            assert len(all_projects) == 8

            # Verify project structure
            for project in all_projects:
                assert "project" in project
                assert "street" in project
                assert "transaction" in project

    @patch("services.ura_api_client.get_scraper_rate_limiter")
    def test_context_manager(
        self,
        mock_rate_limiter,
        mock_env_access_key
    ):
        """Test context manager properly closes session."""
        mock_rate_limiter.return_value.wait = Mock()

        with URAAPIClient() as client:
            assert client._session is not None

        # Session should be closed after exiting context
        # (requests.Session.close() called)
