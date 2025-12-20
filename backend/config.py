import os
import sys
from dotenv import load_dotenv

load_dotenv()


def _get_database_url():
    """
    Get and validate DATABASE_URL for PostgreSQL.

    PostgreSQL is REQUIRED for all environments (local, staging, production).
    SQLite is NOT supported due to schema drift and production-only bugs.

    Local development setup:
        # Option 1: Docker (recommended)
        docker run -d --name sg-property-db -p 5432:5432 \
            -e POSTGRES_DB=sg_property -e POSTGRES_USER=dev -e POSTGRES_PASSWORD=dev \
            postgres:15

        # Then set in .env:
        DATABASE_URL=postgresql://dev:dev@localhost:5432/sg_property

        # Option 2: Local PostgreSQL installation
        createdb sg_property
        DATABASE_URL=postgresql://localhost/sg_property
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

    return database_url


class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key')
    JWT_SECRET = os.getenv('JWT_SECRET', os.getenv('SECRET_KEY', 'dev-jwt-secret-key'))
    JWT_ALGORITHM = os.getenv('JWT_ALGORITHM', 'HS256')
    JWT_EXPIRATION_HOURS = int(os.getenv('JWT_EXPIRATION_HOURS', '24'))

    CSV_FOLDER = os.getenv('CSV_FOLDER', 'rawdata')
    DEBUG = os.getenv('FLASK_DEBUG', 'True').lower() == 'true'

    # SQLAlchemy configuration - PostgreSQL ONLY
    # SQLite is NOT supported in any environment
    SQLALCHEMY_DATABASE_URI = _get_database_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False

