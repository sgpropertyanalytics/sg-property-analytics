#!/usr/bin/env python3
"""
Diagnostic script to identify startup failures.

Run this as releaseCommand to see where startup is failing:
  releaseCommand: cd backend && python -m scripts.diagnose_startup

After identifying the issue, revert to normal migration command.
"""
import os
import sys
from pathlib import Path

def main():
    print("=" * 70)
    print("STARTUP DIAGNOSTICS")
    print("=" * 70)

    # Check 1: Environment variables
    print("\n1. Environment Variables:")
    required_vars = ['DATABASE_URL', 'PORT']
    optional_vars = ['URA_ACCESS_KEY', 'SECRET_KEY', 'FLASK_ENV', 'FLASK_DEBUG']

    for var in required_vars:
        value = os.getenv(var)
        if value:
            # Mask sensitive values
            if 'URL' in var or 'KEY' in var:
                masked = value[:20] + '...' + value[-10:] if len(value) > 30 else '***'
                print(f"  ✓ {var} = {masked}")
            else:
                print(f"  ✓ {var} = {value}")
        else:
            print(f"  ✗ {var} = NOT SET (REQUIRED)")

    for var in optional_vars:
        value = os.getenv(var)
        status = "SET" if value else "not set (using default)"
        print(f"  · {var} = {status}")

    # Check 2: Database connection
    print("\n2. Database Connection:")
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        print("  ✗ Cannot test - DATABASE_URL not set")
        sys.exit(1)

    try:
        import psycopg2
        print(f"  Testing connection to {db_url[:30]}...")
        conn = psycopg2.connect(db_url, connect_timeout=10)
        cur = conn.cursor()
        cur.execute("SELECT version()")
        version = cur.fetchone()[0]
        print(f"  ✓ Connected: {version[:50]}")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"  ✗ Connection failed: {e}")
        sys.exit(1)

    # Check 3: Migrations directory
    print("\n3. Migrations Directory:")
    backend_dir = Path(__file__).parent.parent
    migrations_dir = backend_dir / 'migrations'
    if migrations_dir.exists():
        sql_files = list(migrations_dir.glob('*.sql'))
        print(f"  ✓ Found {len(sql_files)} migration files")
    else:
        print(f"  ✗ Not found: {migrations_dir}")
        sys.exit(1)

    # Check 4: Run migrations
    print("\n4. Running Migrations:")
    try:
        from scripts.run_migrations import main as run_migrations
        run_migrations()
        print("  ✓ Migrations completed successfully")
    except Exception as e:
        print(f"  ✗ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    # Check 5: App import
    print("\n5. App Import Test:")
    try:
        sys.path.insert(0, str(backend_dir))
        from app import create_app
        app = create_app()
        print("  ✓ App created successfully")
    except Exception as e:
        print(f"  ✗ App creation failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    print("\n" + "=" * 70)
    print("ALL CHECKS PASSED")
    print("=" * 70)
    print("\nIf this passes but your app still fails, the issue is likely:")
    print("  - Gunicorn startup (check worker/thread settings)")
    print("  - Port binding (check $PORT variable)")
    print("  - Health check failing (check /api/health endpoint)")
    print("=" * 70)

if __name__ == '__main__':
    main()
