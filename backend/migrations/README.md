# Database Migrations

Flask-Migrate is configured for database schema management.

## Initial Setup

If you need to initialize migrations (first time only):

```bash
cd backend
export FLASK_APP=app.py
flask db init
```

## Creating Migrations

After modifying models, create a migration:

```bash
flask db migrate -m "Description of changes"
```

## Applying Migrations

Apply migrations to update database:

```bash
flask db upgrade
```

## Note

The app uses `db.create_all()` on startup, so migrations are optional but recommended for production deployments.

