#!/usr/bin/env python3
"""
Run all pending SQL migrations in order.

Tracks applied migrations in a `_migrations` table to ensure idempotency.
Safe to run multiple times - only applies new migrations.

IMPORTANT: Requires DATABASE_URL_MIGRATIONS environment variable.
- Session pooler (port 5432): OK - does not wrap queries in transactions
- Transaction pooler (port 6543): REJECTED - wraps queries, breaks DDL
- Direct connection: OK but may have IPv6 issues from some hosts

Concurrency: Uses pg_advisory_lock to ensure only one migration runner
executes at a time, preventing race conditions during parallel deploys.

Usage:
    DATABASE_URL_MIGRATIONS=<session_pooler_url> python -m scripts.run_migrations
    DATABASE_URL_MIGRATIONS=<session_pooler_url> python scripts/run_migrations.py
"""
import os
import sys
import time
from pathlib import Path

# Add backend to path for imports
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Advisory lock ID for migration serialization
# This prevents concurrent migration runs from racing
# Using a fixed ID derived from 'migrations' string hash
MIGRATION_LOCK_ID = 839274628  # hash('sg_property_migrations') % (2**31)


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

    Note: CONCURRENTLY has been removed from migrations for Supabase compatibility,
    but this detection is kept for safety in case any are added back.
    """
    sql_upper = sql_content.upper()
    return 'CONCURRENTLY' in sql_upper


def check_invalid_indexes(conn, auto_drop: bool = False):
    """
    Detect and optionally drop invalid indexes from interrupted CONCURRENTLY operations.

    When CREATE INDEX CONCURRENTLY is interrupted (e.g., connection drop),
    PostgreSQL leaves the index in an "invalid" state. These indexes:
    - Are not used by the query planner
    - Still consume disk space
    - Block CREATE INDEX IF NOT EXISTS from creating a valid replacement

    Args:
        conn: Database connection
        auto_drop: If True, automatically drop invalid indexes. If False, fail fast.

    Returns:
        List of invalid index names found (after dropping if auto_drop=True).

    Raises:
        SystemExit: If invalid indexes found and auto_drop=False.
    """
    cursor = conn.cursor()
    # Scope to public schema only, exclude in-progress concurrent builds (indisready=false)
    cursor.execute("""
        SELECT c.relname AS index_name
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT i.indisvalid
          AND i.indisready  -- Exclude in-progress concurrent builds
          AND n.nspname = 'public'
    """)
    invalid = [row[0] for row in cursor.fetchall()]
    cursor.close()

    if not invalid:
        return []

    print("\n" + "=" * 60)
    print("INVALID INDEXES DETECTED (from interrupted migrations)")
    print("=" * 60)
    for name in invalid:
        print(f"  - {name}")

    if auto_drop:
        print("\nAuto-dropping invalid indexes...")
        drop_cursor = conn.cursor()
        for name in invalid:
            try:
                drop_cursor.execute(f'DROP INDEX IF EXISTS "{name}"')
                print(f"  Dropped: {name}")
            except Exception as e:
                print(f"  Failed to drop {name}: {e}")
        drop_cursor.close()
        print("=" * 60 + "\n")
        return []
    else:
        print("\nThese indexes block migrations from creating valid replacements.")
        print("CREATE INDEX IF NOT EXISTS will no-op, leaving broken indexes.")
        print("\nTo fix manually, run in psql:")
        for name in invalid:
            print(f'  DROP INDEX IF EXISTS "{name}";')
        print("\nOr set AUTO_DROP_INVALID_INDEXES=1 to drop automatically.")
        print("=" * 60)
        sys.exit(1)


def is_transaction_pooler_url(url: str) -> bool:
    """
    Detect if URL is a Supabase TRANSACTION pooler connection (port 6543).

    Transaction pooler (port 6543) wraps queries in transactions, breaking DDL.
    Session pooler (port 5432) does NOT wrap queries and is safe for migrations.

    Supabase pooler modes:
    - Port 6543: Transaction mode (UNSAFE for DDL)
    - Port 5432: Session mode (SAFE for DDL)
    """
    # Only reject transaction pooler (port 6543)
    # Session pooler (port 5432 on pooler.supabase.com) is fine
    if ':6543' in url:
        return True
    return False


def main():
    # REQUIRE direct connection for migrations - do NOT fall back to pooler
    # Supabase pooler (port 6543) wraps queries in transactions, which can break DDL
    db_url = os.environ.get('DATABASE_URL_MIGRATIONS')
    if not db_url:
        print("=" * 60)
        print("ERROR: DATABASE_URL_MIGRATIONS environment variable required")
        print("=" * 60)
        print("\nMigrations require a DIRECT database connection (not pooler).")
        print("Supabase pooler wraps queries in transactions, breaking some DDL.")
        print("\nSet DATABASE_URL_MIGRATIONS to your direct Supabase endpoint:")
        print("  postgresql://postgres:[PASSWORD]@db.<project>.supabase.co:5432/postgres")
        print("\nNOTE: Use port 5432 (direct), NOT port 6543 (pooler)")
        print("=" * 60)
        sys.exit(1)

    # Guard against accidentally using TRANSACTION pooler (port 6543)
    # Session pooler (port 5432) is fine - it doesn't wrap queries in transactions
    if is_transaction_pooler_url(db_url):
        print("=" * 60)
        print("ERROR: DATABASE_URL_MIGRATIONS is using transaction pooler (port 6543)")
        print("=" * 60)
        print("\nTransaction pooler wraps queries in transactions, breaking DDL.")
        print("\nUse SESSION pooler (port 5432) or direct connection instead:")
        print("  Session pooler: postgresql://postgres.<project>:[PASSWORD]@pooler.supabase.com:5432/postgres")
        print("  Direct:         postgresql://postgres:[PASSWORD]@db.<project>.supabase.co:5432/postgres")
        print("\nTransaction pooler (WRONG): ...@pooler.supabase.com:6543/...")
        print("Session pooler (OK):        ...@pooler.supabase.com:5432/...")
        print("=" * 60)
        sys.exit(1)

    # Identify connection type for logging
    if 'pooler.supabase.com' in db_url:
        print("Using session pooler connection for migrations")
    else:
        print("Using direct connection for migrations")

    migrations_dir = backend_dir / 'migrations'
    if not migrations_dir.exists():
        print(f"ERROR: Migrations directory not found: {migrations_dir}")
        sys.exit(1)

    print("Connecting to database...")
    conn = connect_with_retry(db_url)
    cur = conn.cursor()

    try:
        # Acquire advisory lock to prevent concurrent migration runs
        # This blocks until the lock is available (or connection times out)
        conn.autocommit = True
        print("Acquiring migration lock...")
        cur.execute("SELECT pg_advisory_lock(%s)", (MIGRATION_LOCK_ID,))
        print("Migration lock acquired")

        # Create tracking table if not exists
        cur.execute("""
            CREATE TABLE IF NOT EXISTS _migrations (
                name TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        # Check for invalid indexes (leftover from interrupted CONCURRENTLY)
        # Will fail fast unless AUTO_DROP_INVALID_INDEXES=1 is set
        auto_drop = os.environ.get('AUTO_DROP_INVALID_INDEXES', '').lower() in ('1', 'true', 'yes')
        check_invalid_indexes(conn, auto_drop=auto_drop)

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
        # Release advisory lock (also released automatically on disconnect)
        try:
            conn.autocommit = True
            cur.execute("SELECT pg_advisory_unlock(%s)", (MIGRATION_LOCK_ID,))
            print("Migration lock released")
        except Exception:
            pass  # Lock released on disconnect anyway
        cur.close()
        conn.close()


if __name__ == '__main__':
    main()
