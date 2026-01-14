#!/usr/bin/env python3
"""
Run all pending SQL migrations in order.

Tracks applied migrations in a `_migrations` table to ensure idempotency.
Safe to run multiple times - only applies new migrations.

Handles CONCURRENTLY indexes:
- Migrations with CREATE INDEX CONCURRENTLY cannot run in a transaction
- These are detected and run with autocommit=True

Usage:
    python -m scripts.run_migrations
    python scripts/run_migrations.py
"""
import os
import sys
import time
from pathlib import Path

# Add backend to path for imports
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))


def connect_with_retry(db_url: str, attempts: int = 4, base_sleep: float = 0.75):
    """
    Connect to database with exponential backoff retry.

    Handles Supabase cold starts and transient network issues.
    Mirrors the retry logic in db/engine.py for consistency.

    Args:
        db_url: PostgreSQL connection string
        attempts: Number of retry attempts (default 4)
        base_sleep: Base sleep time in seconds (doubles each attempt)

    Returns:
        psycopg2 connection object

    Raises:
        psycopg2.OperationalError: If all attempts fail
    """
    import psycopg2

    last_error = None

    for i in range(attempts):
        try:
            conn = psycopg2.connect(db_url, connect_timeout=30)
            print(f"Database connected (attempt {i + 1}/{attempts})")
            return conn
        except psycopg2.OperationalError as e:
            last_error = e
            if i < attempts - 1:
                sleep_s = base_sleep * (2 ** i)
                print(f"Connection failed (attempt {i + 1}/{attempts}), retrying in {sleep_s:.2f}s...")
                print(f"  Error: {str(e)[:100]}")
                time.sleep(sleep_s)

    print(f"All {attempts} connection attempts failed")
    raise last_error


def needs_autocommit(sql_content: str) -> bool:
    """
    Check if migration needs autocommit mode.

    CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
    Same for DROP INDEX CONCURRENTLY, REINDEX CONCURRENTLY, etc.
    """
    sql_upper = sql_content.upper()
    return 'CONCURRENTLY' in sql_upper


def main():
    # Prefer direct connection for migrations (supports CONCURRENTLY, no pooler transaction wrapping)
    # Falls back to DATABASE_URL if DATABASE_URL_MIGRATIONS not set
    db_url = os.environ.get('DATABASE_URL_MIGRATIONS') or os.environ.get('DATABASE_URL')
    if not db_url:
        print("ERROR: DATABASE_URL_MIGRATIONS or DATABASE_URL must be set")
        sys.exit(1)

    # Log which connection we're using
    is_direct = os.environ.get('DATABASE_URL_MIGRATIONS') is not None
    print(f"Using {'direct' if is_direct else 'pooled'} connection for migrations")

    migrations_dir = backend_dir / 'migrations'
    if not migrations_dir.exists():
        print(f"ERROR: Migrations directory not found: {migrations_dir}")
        sys.exit(1)

    print("Connecting to database...")
    conn = connect_with_retry(db_url)
    cur = conn.cursor()

    try:
        # Create tracking table if not exists (with autocommit for this)
        conn.autocommit = True
        cur.execute("""
            CREATE TABLE IF NOT EXISTS _migrations (
                name TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        # Get already-applied migrations
        cur.execute("SELECT name FROM _migrations")
        applied = {row[0] for row in cur.fetchall()}
        print(f"Already applied: {len(applied)} migrations")

        # Find all .sql files, sorted by name
        sql_files = sorted(migrations_dir.glob('*.sql'))
        pending = [f for f in sql_files if f.name not in applied]

        if not pending:
            print("No pending migrations.")
            return

        print(f"Pending migrations: {len(pending)}")

        # Run pending migrations in order
        for sql_file in pending:
            sql_content = sql_file.read_text()
            use_autocommit = needs_autocommit(sql_content)

            mode = "AUTOCOMMIT" if use_autocommit else "TRANSACTION"
            print(f"\nApplying {sql_file.name} [{mode}]...")

            try:
                if use_autocommit:
                    # CONCURRENTLY requires autocommit (no transaction)
                    conn.autocommit = True
                    cur.execute(sql_content)
                    cur.execute(
                        "INSERT INTO _migrations (name) VALUES (%s)",
                        (sql_file.name,)
                    )
                else:
                    # Normal migrations use transaction for safety
                    conn.autocommit = False
                    cur.execute(sql_content)
                    cur.execute(
                        "INSERT INTO _migrations (name) VALUES (%s)",
                        (sql_file.name,)
                    )
                    conn.commit()

                print(f"  OK: {sql_file.name}")

            except Exception as e:
                if not use_autocommit:
                    conn.rollback()
                print(f"  FAILED: {sql_file.name}")
                print(f"  Error: {e}")
                sys.exit(1)

        print(f"\nMigrations complete: {len(pending)} applied")

    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    main()
