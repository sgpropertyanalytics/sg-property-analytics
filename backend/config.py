import os
import sys
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from dotenv import load_dotenv

load_dotenv()


def _get_database_url():
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
    JWT_SECRET = os.getenv('JWT_SECRET', os.getenv('SECRET_KEY', 'dev-jwt-secret-key'))
    JWT_ALGORITHM = os.getenv('JWT_ALGORITHM', 'HS256')
    JWT_EXPIRATION_HOURS = int(os.getenv('JWT_EXPIRATION_HOURS', '24'))

    # Premium bypass for preview/testing environments
    # Comma-separated list of emails that always get premium access
    # Example: "admin@example.com,test@example.com"
    PREMIUM_BYPASS_EMAILS = set(
        email.strip().lower()
        for email in os.getenv('PREMIUM_BYPASS_EMAILS', '').split(',')
        if email.strip()
    )

    CSV_FOLDER = os.getenv('CSV_FOLDER', 'rawdata')
    DEBUG = os.getenv('FLASK_DEBUG', 'True').lower() == 'true'

    # SQLAlchemy configuration - PostgreSQL ONLY
    # SQLite is NOT supported in any environment
    SQLALCHEMY_DATABASE_URI = _get_database_url()
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

