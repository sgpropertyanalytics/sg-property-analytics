# Deployment Guide

This guide covers deploying the Singapore Property Analyzer with proper database migrations.

## Prerequisites

- PostgreSQL database (Render, Railway, or local)
- Python 3.10+
- `DATABASE_URL` environment variable set
- Backend modules installed for local CLI/tools:
  ```bash
  pip install -e .
  ```

## Database Migrations

### Why Migrations Matter

The application uses SQLAlchemy models that define the expected database schema. If the database schema doesn't match the models, you'll get 500 errors like:

```
psycopg2.errors.UndefinedColumn: column transactions.street_name does not exist
```

### Running Migrations

**Before starting the app**, always run migrations:

```bash
# Option 1: Direct SQL migration (recommended for quick fixes)
psql "$DATABASE_URL" -f backend/migrations/001_add_all_missing_columns.sql

# Option 2: Verify via schema check
python -c "
from app import create_app
from services.schema_check import check_and_report
app = create_app()
with app.app_context():
    check_and_report()
"
```

### Migration Files

| File | Description |
|------|-------------|
| `001_add_all_missing_columns.sql` | Adds all columns for transactions, new_launches, gls_tenders, project_locations |

All migrations are **idempotent** - safe to run multiple times.

## Render Deployment

### Initial Setup

1. Create a PostgreSQL database on Render
2. Create a Web Service pointing to this repo
3. Set environment variables:
   - `DATABASE_URL` - Your Render PostgreSQL connection string
   - `FLASK_ENV` - `production`

### Deploy Process

For each deploy, Render should:

1. **Run migrations** (in Start Command, NOT Build Command)
2. **Start the app**

> **Important:** Do NOT run migrations in Build Command. The build environment
> may not have network access to your database. Always run migrations at runtime.

#### Startup Script (Recommended)

Create `scripts/start.sh`:
```bash
#!/bin/bash
set -e

echo "Running database migrations..."
psql "$DATABASE_URL" -f backend/migrations/001_add_all_missing_columns.sql

echo "Starting application..."
cd backend && gunicorn app:app --bind 0.0.0.0:$PORT
```

Set Start Command in Render: `bash scripts/start.sh`

#### Alternative: Inline Start Command

If you prefer not to create a script:
```bash
psql "$DATABASE_URL" -f backend/migrations/001_add_all_missing_columns.sql && cd backend && gunicorn app:app --bind 0.0.0.0:$PORT
```

## Schema Check on Startup

The app automatically checks schema on startup and **fails fast** if critical columns are missing.

**Healthy startup:**
```
✓ Database initialized - using SQL-only aggregation for memory efficiency
   Database: sg_property_db @ dpg-xxx.render.com:5432
   ✓ Schema check passed
```

**Schema drift detected (app will NOT start):**
```
============================================================
FATAL: SCHEMA DRIFT DETECTED
============================================================

Missing critical columns:
   - transactions.street_name
   - new_launches.data_source

------------------------------------------------------------
TO FIX: Run migrations before starting the app:
   psql "$DATABASE_URL" -f backend/migrations/001_add_all_missing_columns.sql
------------------------------------------------------------

RuntimeError: Schema drift: 0 missing tables, 2 missing critical columns.
Run migrations before starting the app.
```

This **hard fail** behavior prevents serving broken APIs with silent 500 errors.

## Troubleshooting

### "column X does not exist" errors

1. Check which database you're connecting to:
   ```bash
   echo $DATABASE_URL
   ```

2. Run migrations against that database:
   ```bash
   psql "$DATABASE_URL" -f backend/migrations/001_add_all_missing_columns.sql
   ```

3. Verify columns exist:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'transactions'
   ORDER BY column_name;
   ```

### Schema check fails but app runs

The app will continue running even with schema drift, but endpoints that use missing columns will fail. Always fix schema drift immediately.

### Multiple databases (local vs production)

Ensure your local development and production use the same schema:

```bash
# Check local
python -m services.schema_check

# Check production (requires DATABASE_URL set to prod)
DATABASE_URL="postgres://..." python -m services.schema_check
```

## Data Upload

After schema is correct, upload data:

```bash
python -m scripts.upload --force
```

See [DATA_UPLOAD_GUIDE.md](./DATA_UPLOAD_GUIDE.md) for details.
