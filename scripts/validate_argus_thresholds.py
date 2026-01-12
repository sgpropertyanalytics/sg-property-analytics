#!/usr/bin/env python3
"""
validate_argus_thresholds.py - Derive empirical thresholds for Argus AI agent

Queries actual database distributions to validate/derive benchmarks for:
1. PSF YoY growth classification
2. Turnover rate thresholds (normalized by project age)
3. Annual resale velocity classification
4. Sample size confidence levels

Usage:
    python scripts/validate_argus_thresholds.py

Run from project root with DATABASE_URL set.
"""

import os
import sys
from pathlib import Path

# Add backend to path
SCRIPT_DIR = Path(__file__).parent
BACKEND_DIR = SCRIPT_DIR.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))


def get_engine():
    """Get database engine."""
    from db.engine import get_engine
    return get_engine("job")


def query_psf_growth_distribution():
    """Query YoY PSF growth distribution by district."""
    from sqlalchemy import text
    engine = get_engine()

    print("\n" + "=" * 70)
    print("1. PSF YoY GROWTH DISTRIBUTION")
    print("=" * 70)

    with engine.connect() as conn:
        result = conn.execute(text("""
            WITH yearly_psf AS (
                SELECT
                    EXTRACT(YEAR FROM transaction_date) as year,
                    district,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                    COUNT(*) as tx_count
                FROM transactions
                WHERE sale_type = 'Resale'
                  AND COALESCE(is_outlier, false) = false
                  AND psf IS NOT NULL
                  AND psf > 0
                GROUP BY EXTRACT(YEAR FROM transaction_date), district
                HAVING COUNT(*) >= 10
            ),
            yoy_growth AS (
                SELECT
                    curr.district,
                    curr.year,
                    ((curr.median_psf - prev.median_psf) / prev.median_psf * 100) as yoy_growth,
                    curr.tx_count
                FROM yearly_psf curr
                JOIN yearly_psf prev ON curr.district = prev.district AND curr.year = prev.year + 1
            )
            SELECT
                ROUND(PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY yoy_growth)::numeric, 1) as p10,
                ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY yoy_growth)::numeric, 1) as p25,
                ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY yoy_growth)::numeric, 1) as p50,
                ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY yoy_growth)::numeric, 1) as p75,
                ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY yoy_growth)::numeric, 1) as p90,
                ROUND(MIN(yoy_growth)::numeric, 1) as min_growth,
                ROUND(MAX(yoy_growth)::numeric, 1) as max_growth,
                COUNT(*) as sample_size
            FROM yoy_growth
        """)).fetchone()

        print(f"\nSample size: {result.sample_size} district-year pairs")
        print(f"\nPercentile Distribution:")
        print(f"  P10 (bottom 10%):  {result.p10}%")
        print(f"  P25 (1st quartile): {result.p25}%")
        print(f"  P50 (median):       {result.p50}%")
        print(f"  P75 (3rd quartile): {result.p75}%")
        print(f"  P90 (top 10%):      {result.p90}%")
        print(f"  Min: {result.min_growth}%, Max: {result.max_growth}%")

        print("\n  SUGGESTED THRESHOLDS (based on percentiles):")
        print(f"  - Sharp Decline: < {result.p10}%")
        print(f"  - Softening:     {result.p10}% to {result.p25}%")
        print(f"  - Stable:        {result.p25}% to {result.p75}%")
        print(f"  - Growing:       {result.p75}% to {result.p90}%")
        print(f"  - Strong Growth: > {result.p90}%")

        return {
            'p10': result.p10, 'p25': result.p25, 'p50': result.p50,
            'p75': result.p75, 'p90': result.p90, 'sample_size': result.sample_size
        }


def query_turnover_by_age():
    """Query turnover distribution - simplified without unit data join."""
    from sqlalchemy import text
    engine = get_engine()

    print("\n" + "=" * 70)
    print("2. RESALE ACTIVITY BY PROJECT")
    print("=" * 70)
    print("(Note: Unit data is in CSV, not database. Showing resale counts.)")

    with engine.connect() as conn:
        # Get resale counts per project to understand distribution
        result = conn.execute(text("""
            WITH project_resales AS (
                SELECT
                    project_name,
                    district,
                    COUNT(*) as total_resales,
                    MIN(EXTRACT(YEAR FROM transaction_date)) as first_resale_year,
                    MAX(EXTRACT(YEAR FROM transaction_date)) as last_resale_year
                FROM transactions
                WHERE sale_type = 'Resale'
                  AND COALESCE(is_outlier, false) = false
                GROUP BY project_name, district
            )
            SELECT
                ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY total_resales)::numeric, 0) as p25,
                ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY total_resales)::numeric, 0) as p50,
                ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY total_resales)::numeric, 0) as p75,
                ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY total_resales)::numeric, 0) as p90,
                COUNT(*) as total_projects
            FROM project_resales
        """)).fetchone()

        print(f"\nTotal projects with resales: {result.total_projects}")
        print(f"\nResale count distribution per project:")
        print(f"  P25: {int(result.p25)} resales")
        print(f"  P50 (median): {int(result.p50)} resales")
        print(f"  P75: {int(result.p75)} resales")
        print(f"  P90: {int(result.p90)} resales")

        print("\n  INSIGHT: For turnover rate validation, we'd need to join")
        print("  with unit counts from new_launch_units.csv. The exit_queue_service")
        print("  already does this - its thresholds (<5, 5-15, >15) should be")
        print("  validated against the actual distribution in that service.")

        return result


def query_annual_velocity():
    """Query annual resale activity distribution (without unit normalization)."""
    from sqlalchemy import text
    engine = get_engine()

    print("\n" + "=" * 70)
    print("3. ANNUAL RESALE ACTIVITY DISTRIBUTION")
    print("=" * 70)
    print("(Resales per project per year - raw counts)")

    with engine.connect() as conn:
        result = conn.execute(text("""
            WITH annual_resales AS (
                SELECT
                    project_name,
                    EXTRACT(YEAR FROM transaction_date) as year,
                    COUNT(*) as resales_that_year
                FROM transactions
                WHERE sale_type = 'Resale'
                  AND COALESCE(is_outlier, false) = false
                GROUP BY project_name, EXTRACT(YEAR FROM transaction_date)
            )
            SELECT
                ROUND(PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY resales_that_year)::numeric, 0) as p10,
                ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY resales_that_year)::numeric, 0) as p25,
                ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY resales_that_year)::numeric, 0) as p50,
                ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY resales_that_year)::numeric, 0) as p75,
                ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY resales_that_year)::numeric, 0) as p90,
                COUNT(*) as sample_size
            FROM annual_resales
        """)).fetchone()

        print(f"\nSample size: {result.sample_size} project-year pairs")
        print(f"\nResales per project per year distribution:")
        print(f"  P10 (slowest 10%):  {int(result.p10)} resales/year")
        print(f"  P25 (1st quartile): {int(result.p25)} resales/year")
        print(f"  P50 (median):       {int(result.p50)} resales/year")
        print(f"  P75 (3rd quartile): {int(result.p75)} resales/year")
        print(f"  P90 (most active):  {int(result.p90)} resales/year")

        print("\n  INSIGHT: To calculate velocity %, we'd need unit counts.")
        print("  The resale_velocity.py service does this via CSV lookup.")
        print("  For a 500-unit project:")
        print(f"    - {int(result.p50)} resales/year = {int(result.p50) / 500 * 100:.1f}% velocity")
        print(f"    - {int(result.p75)} resales/year = {int(result.p75) / 500 * 100:.1f}% velocity")

        return {
            'p10': result.p10, 'p25': result.p25, 'p50': result.p50,
            'p75': result.p75, 'p90': result.p90, 'sample_size': result.sample_size
        }


def query_sample_size_impact():
    """Query how sample size affects confidence."""
    from sqlalchemy import text
    engine = get_engine()

    print("\n" + "=" * 70)
    print("4. SAMPLE SIZE CONFIDENCE LEVELS")
    print("=" * 70)
    print("(How many comparable transactions exist by segment?)")

    with engine.connect() as conn:
        # District-level sample sizes
        result = conn.execute(text("""
            SELECT
                district,
                COUNT(*) as resale_count,
                COUNT(DISTINCT project_name) as project_count
            FROM transactions
            WHERE sale_type = 'Resale'
              AND COALESCE(is_outlier, false) = false
            GROUP BY district
            ORDER BY resale_count DESC
        """)).fetchall()

        print(f"\n{'District':<10} {'Resales':>12} {'Projects':>12} {'Avg/Project':>15}")
        print("-" * 55)
        for row in result:
            avg = row.resale_count / row.project_count if row.project_count > 0 else 0
            print(f"{row.district:<10} {row.resale_count:>12,} {row.project_count:>12} {avg:>15.1f}")

        # Percentiles of project-level sample sizes
        result2 = conn.execute(text("""
            WITH project_counts AS (
                SELECT
                    project_name,
                    district,
                    COUNT(*) as resale_count
                FROM transactions
                WHERE sale_type = 'Resale'
                  AND COALESCE(is_outlier, false) = false
                GROUP BY project_name, district
            )
            SELECT
                PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY resale_count) as p25,
                PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY resale_count) as p50,
                PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY resale_count) as p75,
                PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY resale_count) as p90,
                COUNT(*) as total_projects
            FROM project_counts
        """)).fetchone()

        print(f"\nProject-level resale counts:")
        print(f"  P25: {int(result2.p25)} resales")
        print(f"  P50: {int(result2.p50)} resales")
        print(f"  P75: {int(result2.p75)} resales")
        print(f"  P90: {int(result2.p90)} resales")
        print(f"  Total projects: {result2.total_projects}")

        print("\n  SUGGESTED CONFIDENCE THRESHOLDS:")
        print(f"  - Low confidence:    < {int(result2.p25)} comparable transactions")
        print(f"  - Medium confidence: {int(result2.p25)} - {int(result2.p75)} transactions")
        print(f"  - High confidence:   > {int(result2.p75)} transactions")


def main():
    print("=" * 70)
    print("ARGUS THRESHOLD VALIDATION")
    print("=" * 70)
    print("Querying actual database distributions to derive empirical thresholds.")
    print("This ensures Argus benchmarks are grounded in real data, not guesses.")

    try:
        psf_growth = query_psf_growth_distribution()
        turnover_by_age = query_turnover_by_age()
        annual_velocity = query_annual_velocity()
        query_sample_size_impact()

        print("\n" + "=" * 70)
        print("SUMMARY: RECOMMENDED THRESHOLD UPDATES")
        print("=" * 70)

        print("\n1. PSF GROWTH CLASSIFICATION:")
        print(f"   Current: >10% 'Strong', 5-10% 'Growing', 0-5% 'Stable', <0% 'Softening'")
        print(f"   Recommended: Based on P10/P25/P75/P90 = {psf_growth['p10']}/{psf_growth['p25']}/{psf_growth['p75']}/{psf_growth['p90']}%")

        print("\n2. ANNUAL VELOCITY CLASSIFICATION:")
        print(f"   Current: 2-3% 'Healthy'")
        print(f"   Recommended: Based on P25-P75 = {annual_velocity['p25']}-{annual_velocity['p75']}%")

        print("\n3. LIFETIME TURNOVER:")
        print(f"   Current: <5 'low', 5-15 'healthy', >15 'high'")
        print(f"   Recommended: Age-normalize before classifying (see table above)")

        print("\n" + "=" * 70)

    except Exception as e:
        print(f"\nERROR: {e}")
        print("\nMake sure DATABASE_URL is set and points to a valid database.")
        sys.exit(1)


if __name__ == "__main__":
    main()
