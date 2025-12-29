"""
SQL-only query tests for price_projects_by_district.
"""

from datetime import date
from sqlalchemy.dialects import postgresql


def test_price_projects_query_uses_percentiles_and_outlier_filter(app):
    from routes.analytics.charts import _build_price_projects_by_district_query

    with app.app_context():
        query = _build_price_projects_by_district_query(
            district="D01",
            bedroom_types=[2, 3],
            cutoff_date=date(2024, 1, 1),
        )
        sql = str(query.statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True}
        ))

    lowered = sql.lower()
    assert "percentile_cont" in lowered
    assert "coalesce" in lowered
    assert "is_outlier" in lowered
