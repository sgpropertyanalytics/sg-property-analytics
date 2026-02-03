"""
Source parity report (URA API vs CSV).

Outputs month-by-month counts and API-only / CSV-only row_hash deltas.
Run with:
  PYTHONPATH=backend python -m scripts.report_source_parity
"""
import os
from datetime import date
from sqlalchemy import text

from config import Config
from models.database import db
from services.source_policy import PRIMARY_SOURCE, CSV_SOURCES, ANALYTICS_SOURCES, sql_in_list


def main():
    from app import create_app
    app = create_app()

    with app.app_context():
        print("Source parity report (URA API vs CSV)")
        print("=" * 60)

        # Overall counts
        rows = db.session.execute(text(f"""
            SELECT source, COUNT(*) AS rows
            FROM transactions
            WHERE source IN {sql_in_list(ANALYTICS_SOURCES)}
            GROUP BY source
            ORDER BY source
        """)).fetchall()
        print("\nOverall counts:")
        for r in rows:
            print(f"  {r[0]:<10} {r[1]:>10,}")

        # Month-by-month counts
        rows = db.session.execute(text(f"""
            SELECT
                transaction_month::date AS month,
                SUM(CASE WHEN source='{PRIMARY_SOURCE}' THEN 1 ELSE 0 END) AS ura_rows,
                SUM(CASE WHEN source IN {sql_in_list(CSV_SOURCES)} THEN 1 ELSE 0 END) AS csv_rows
            FROM transactions
            WHERE transaction_month IS NOT NULL
              AND source IN {sql_in_list(ANALYTICS_SOURCES)}
            GROUP BY 1
            ORDER BY 1
        """)).fetchall()
        print("\nMonthly counts:")
        for r in rows:
            print(f"  {r[0]}  ura_api={r[1]:>6,}  csv={r[2]:>6,}")

        # API-only / CSV-only (row_hash-based)
        rows = db.session.execute(text(f"""
            WITH api AS (
              SELECT row_hash
              FROM transactions
              WHERE source='{PRIMARY_SOURCE}'
                AND row_hash IS NOT NULL
            ),
            csv AS (
              SELECT row_hash
              FROM transactions
              WHERE source IN {sql_in_list(CSV_SOURCES)}
                AND row_hash IS NOT NULL
            )
            SELECT
              (SELECT COUNT(*) FROM (SELECT row_hash FROM csv EXCEPT SELECT row_hash FROM api) x) AS csv_only,
              (SELECT COUNT(*) FROM (SELECT row_hash FROM api EXCEPT SELECT row_hash FROM csv) x) AS api_only;
        """)).fetchone()
        print("\nRow-hash deltas:")
        print(f"  csv_only={rows[0]:,}  api_only={rows[1]:,}")


if __name__ == "__main__":
    main()
