"""
Root pytest configuration for backend tests.

Provides:
- --update-snapshots flag for regression tests
- Shared fixtures (app, client)
- Common test utilities
"""

import sys
from pathlib import Path

# Add backend directory to Python path so imports like
# `from db.sql import ...` and `from utils.normalize import ...` work
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import pytest


def pytest_addoption(parser):
    """Add custom pytest options."""
    parser.addoption(
        "--update-snapshots",
        action="store_true",
        default=False,
        help="Update regression snapshots with current API values"
    )


@pytest.fixture
def update_snapshots(request):
    """Fixture to check if --update-snapshots was passed."""
    return request.config.getoption("--update-snapshots")


@pytest.fixture
def app():
    """Create test Flask application."""
    from app import create_app

    app = create_app()
    app.config['TESTING'] = True
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()
