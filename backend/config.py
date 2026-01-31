import os
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env')


def get_database_url():
    """
    Get and validate DATABASE_URL for PostgreSQL.

    PostgreSQL is REQUIRED for all environments (local, staging, production).
    SQLite is NOT supported due to schema drift and production-only bugs.

    For Render/cloud PostgreSQL, automatically adds sslmode=require if missing.
    """
    database_url = os.getenv('DATABASE_URL')

    if not database_url:
        print("\n" + "=" * 70, file=sys.stderr)
        print("FATAL: DATABASE_URL environment variable is not set!", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        print("\nPostgreSQL is REQUIRED for all environments.", file=sys.stderr)
        print("SQLite is NOT supported.\n", file=sys.stderr)
        print("Quick setup with Docker:", file=sys.stderr)
        print("  docker run -d --name sg-property-db -p 5432:5432 \\", file=sys.stderr)
        print("    -e POSTGRES_DB=sg_property -e POSTGRES_USER=dev -e POSTGRES_PASSWORD=dev \\", file=sys.stderr)
        print("    postgres:15", file=sys.stderr)
        print("\nThen add to your .env file:", file=sys.stderr)
        print("  DATABASE_URL=postgresql://dev:dev@localhost:5432/sg_property", file=sys.stderr)
        print("=" * 70 + "\n", file=sys.stderr)
        raise RuntimeError("DATABASE_URL is required. PostgreSQL only - SQLite is not supported.")

    # Validate PostgreSQL URL format
    valid_prefixes = ('postgresql://', 'postgresql+psycopg2://', 'postgres://')
    if not database_url.startswith(valid_prefixes):
        print("\n" + "=" * 70, file=sys.stderr)
        print("FATAL: DATABASE_URL must be a PostgreSQL connection string!", file=sys.stderr)
        print("=" * 70, file=sys.stderr)
        print(f"\nReceived: {database_url[:50]}...", file=sys.stderr)
        print(f"\nExpected format: postgresql://user:password@host:port/database", file=sys.stderr)
        print("SQLite URLs (sqlite:///) are NOT supported.", file=sys.stderr)
        print("=" * 70 + "\n", file=sys.stderr)
        raise RuntimeError("DATABASE_URL must be a PostgreSQL URL. SQLite is not supported.")

    # Handle Render's postgres:// format (SQLAlchemy requires postgresql://)
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)

    # For cloud PostgreSQL (non-localhost), ensure SSL is enabled
    parsed = urlparse(database_url)
    is_localhost = parsed.hostname in ('localhost', '127.0.0.1', None)

    if not is_localhost:
        # Parse existing query params
        query_params = parse_qs(parsed.query)

        # Add sslmode=require if not already set
        if 'sslmode' not in query_params:
            query_params['sslmode'] = ['require']
            new_query = urlencode(query_params, doseq=True)
            database_url = urlunparse((
                parsed.scheme, parsed.netloc, parsed.path,
                parsed.params, new_query, parsed.fragment
            ))

    return database_url


class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key')

    # AI Agent Configuration (Anthropic Claude)
    ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')
    AI_MODEL = os.getenv('AI_MODEL', 'claude-sonnet-4-20250514')
    AI_MAX_TOKENS = int(os.getenv('AI_MAX_TOKENS', '1024'))
    AI_CACHE_TTL_SECONDS = int(os.getenv('AI_CACHE_TTL_SECONDS', '3600'))  # 1 hour

    # Premium bypass for preview/testing environments
    # Comma-separated list of emails that always get premium access
    # Example: "admin@example.com,test@example.com"
    PREMIUM_BYPASS_EMAILS = set(
        email.strip().lower()
        for email in os.getenv('PREMIUM_BYPASS_EMAILS', '').split(',')
        if email.strip()
    )

    CSV_FOLDER = os.getenv('CSV_FOLDER', 'rawdata')
    DEBUG = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'

    # Security headers (Flask-Talisman)
    SECURITY_HEADERS_ENABLED = os.getenv('SECURITY_HEADERS_ENABLED', 'true').lower() in ('1', 'true', 'yes')
    SECURITY_HEADERS_REPORT_ONLY = os.getenv('SECURITY_HEADERS_REPORT_ONLY', 'false').lower() in ('1', 'true', 'yes')
    SECURITY_HEADERS_FORCE_HTTPS = os.getenv('SECURITY_HEADERS_FORCE_HTTPS', 'false').lower() in ('1', 'true', 'yes')
    SECURITY_HEADERS_REFERRER_POLICY = os.getenv('SECURITY_HEADERS_REFERRER_POLICY', 'no-referrer')
    SECURITY_HEADERS_FRAME_OPTIONS = os.getenv('SECURITY_HEADERS_FRAME_OPTIONS', 'DENY')
    SECURITY_HEADERS_HSTS_MAX_AGE = int(os.getenv('SECURITY_HEADERS_HSTS_MAX_AGE', '31536000'))  # 1 year
    SECURITY_HEADERS_HSTS_INCLUDE_SUBDOMAINS = os.getenv(
        'SECURITY_HEADERS_HSTS_INCLUDE_SUBDOMAINS', 'true'
    ).lower() in ('1', 'true', 'yes')
    SECURITY_HEADERS_HSTS_PRELOAD = os.getenv('SECURITY_HEADERS_HSTS_PRELOAD', 'false').lower() in ('1', 'true', 'yes')
    SECURITY_HEADERS_CSP_REPORT_URI = os.getenv('SECURITY_HEADERS_CSP_REPORT_URI', '/api/csp-report')
    SECURITY_HEADERS_CSP = {
        "default-src": "'none'",
        "base-uri": "'none'",
        "frame-ancestors": "'none'",
        "form-action": "'none'",
        "object-src": "'none'",
    }
    SECURITY_HEADERS_PERMISSIONS_POLICY = {
        "geolocation": "()",
        "camera": "()",
        "microphone": "()",
        "payment": "()",
    }

    # SQLAlchemy configuration - PostgreSQL ONLY
    # SQLite is NOT supported in any environment
    SQLALCHEMY_DATABASE_URI = get_database_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Connection pool settings for resilience against timeouts
    # Especially important for remote databases (Render, AWS RDS, etc.)
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,      # Verify connection is alive before using
        'pool_recycle': 300,        # Recycle connections every 5 minutes
        'pool_timeout': 60,         # Wait up to 60s for a connection from pool
        'pool_size': 5,             # Maintain 5 connections in pool
        'max_overflow': 10,         # Allow up to 10 additional connections
        'connect_args': {
            'connect_timeout': 30,  # Connection timeout in seconds
            'options': '-c statement_timeout=300000',  # 5 min query timeout
        }
    }
