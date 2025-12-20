# Deployment Guide

This guide covers deploying the Singapore Property Analyzer with proper database migrations.

## Prerequisites

- PostgreSQL database (Render, Railway, or local)
- Python 3.10+
- `DATABASE_URL` environment variable set

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
import sys; sys.path.insert(0, 'backend')
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

1. **Run migrations** (add to Build Command or use a release command)
2. **Start the app**

#### Option A: Build Command (Simple)

In Render dashboard, set Build Command:
```bash
pip install -r requirements.txt && psql "$DATABASE_URL" -f backend/migrations/001_add_all_missing_columns.sql
```

#### Option B: Startup Script (Recommended)

Create `scripts/start.sh`:
```bash
#!/bin/bash
set -e

echo "Running database migrations..."
psql "$DATABASE_URL" -f backend/migrations/001_add_all_missing_columns.sql

echo "Starting application..."
cd backend && gunicorn app:app --bind 0.0.0.0:$PORT
```

Set Start Command: `bash scripts/start.sh`

## Schema Check on Startup

The app automatically checks schema on startup and reports any drift:

```
✓ Database initialized - using SQL-only aggregation for memory efficiency
   Database: sg_property_db @ dpg-xxx.render.com:5432
   ✓ Schema check passed
```

If schema drift is detected:
```
============================================================
SCHEMA DRIFT DETECTED - Database schema out of sync
============================================================

Missing critical columns:
   - transactions.street_name
   - new_launches.data_source

------------------------------------------------------------
TO FIX: Run migrations against this database:
   psql "$DATABASE_URL" -f backend/migrations/001_add_all_missing_columns.sql
------------------------------------------------------------
```

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
