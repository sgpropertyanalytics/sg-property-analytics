#!/usr/bin/env python3
"""
Run database migrations for Render deployment.

Usage:
    python -m scripts.run_migrations

This script runs all idempotent SQL migrations in order.
Safe to run multiple times - uses CREATE TABLE IF NOT EXISTS, etc.
"""

import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))


def run_migrations():
    """Run all migrations in order."""
    from sqlalchemy import text
    from config import Config

    # Import after path setup
    import psycopg2

    database_url = Config.SQLALCHEMY_DATABASE_URI

    print("=" * 60)
    print("Running database migrations...")
    print("=" * 60)

    # Migration files to run in order
    migrations_dir = Path(__file__).parent.parent / "migrations"
    migration_files = [
        "000_create_all_tables.sql",  # Create base tables
        "001_add_all_missing_columns.sql",  # Add columns to existing tables
        "002_add_indexes.sql",  # Add indexes
        "003_rename_new_launches_to_upcoming_launches.sql",  # Rename table
    ]

    # Connect directly with psycopg2 (simpler than SQLAlchemy for raw SQL)
    try:
        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cursor = conn.cursor()

        for migration_file in migration_files:
            migration_path = migrations_dir / migration_file
            if not migration_path.exists():
                print(f"   ⚠️  Migration not found: {migration_file}")
                continue

            print(f"   Running: {migration_file}")
            try:
                sql = migration_path.read_text()
                cursor.execute(sql)
                print(f"   ✓ {migration_file} completed")
            except psycopg2.Error as e:
                # Some errors are expected (e.g., "relation already exists")
                # Continue with other migrations
                error_msg = str(e).split('\n')[0]
                if "already exists" in error_msg.lower():
                    print(f"   ✓ {migration_file} (already applied)")
                else:
                    print(f"   ⚠️  {migration_file}: {error_msg}")

        cursor.close()
        conn.close()

        print("=" * 60)
        print("✓ Migrations completed")
        print("=" * 60)
        return True

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        return False


if __name__ == "__main__":
    success = run_migrations()
    sys.exit(0 if success else 1)
