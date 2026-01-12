"""
AI Snapshot Service - Auto-generates market-snapshot.md from database

Called after successful URA sync to keep AI context fresh.
Updates both the markdown file and manifest.json timestamps.

Usage:
    from services.ai_snapshot_service import refresh_market_snapshot
    refresh_market_snapshot()  # Uses default DB connection
"""

import json
import logging
from datetime import date, datetime
from pathlib import Path
from typing import Dict, Any, Optional

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# Paths relative to backend/
AI_CONTEXT_DIR = Path(__file__).parent.parent.parent / "docs" / "ai-context"
SNAPSHOT_PATH = AI_CONTEXT_DIR / "snapshot" / "market-snapshot.md"
MANIFEST_PATH = AI_CONTEXT_DIR / "manifest.json"


def _query_snapshot_data(engine: Engine) -> Dict[str, Any]:
    """
    Query all market snapshot data from the database.

    Returns dict with all data needed for markdown generation.
    """
    data = {}

    with engine.connect() as conn:
        # 1. Data watermark (latest transaction date)
        result = conn.execute(text("SELECT MAX(transaction_date) FROM transactions"))
        data['data_watermark'] = result.scalar()

        # 2. Median PSF by region (last 6 months)
        query = text("""
            SELECT
                market_segment,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions
            WHERE transaction_date >= (SELECT MAX(transaction_date) - INTERVAL '6 months' FROM transactions)
              AND COALESCE(is_outlier, false) = false
              AND market_segment IN ('CCR', 'RCR', 'OCR')
            GROUP BY market_segment
            ORDER BY median_psf DESC
        """)
        result = conn.execute(query)
        data['region_psf'] = [
            {'region': row[0], 'median_psf': row[1], 'txn_count': row[2]}
            for row in result
        ]

        # 3. Quarterly volume (last 5 quarters)
        query = text("""
            SELECT
                DATE_TRUNC('quarter', transaction_date) as quarter,
                COUNT(*) as txn_count
            FROM transactions
            WHERE transaction_date >= (SELECT MAX(transaction_date) - INTERVAL '15 months' FROM transactions)
            GROUP BY quarter
            ORDER BY quarter DESC
            LIMIT 5
        """)
        result = conn.execute(query)
        data['quarterly_volume'] = [
            {'quarter': row[0], 'txn_count': row[1]}
            for row in result
        ]

        # 4. Median PSF by sale type (last 6 months)
        query = text("""
            SELECT
                sale_type,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions
            WHERE transaction_date >= (SELECT MAX(transaction_date) - INTERVAL '6 months' FROM transactions)
              AND COALESCE(is_outlier, false) = false
            GROUP BY sale_type
            ORDER BY txn_count DESC
        """)
        result = conn.execute(query)
        data['sale_type_psf'] = [
            {'sale_type': row[0], 'median_psf': row[1], 'txn_count': row[2]}
            for row in result
        ]

        # 5. YoY comparison
        query = text("""
            WITH recent AS (
                SELECT COUNT(*) as cnt,
                       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median
                FROM transactions
                WHERE transaction_date >= (SELECT MAX(transaction_date) - INTERVAL '6 months' FROM transactions)
                  AND COALESCE(is_outlier, false) = false
            ),
            prior AS (
                SELECT COUNT(*) as cnt,
                       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median
                FROM transactions
                WHERE transaction_date >= (SELECT MAX(transaction_date) - INTERVAL '18 months' FROM transactions)
                  AND transaction_date < (SELECT MAX(transaction_date) - INTERVAL '12 months' FROM transactions)
                  AND COALESCE(is_outlier, false) = false
            )
            SELECT
                recent.cnt as recent_txns,
                prior.cnt as prior_txns,
                recent.median as recent_median,
                prior.median as prior_median
            FROM recent, prior
        """)
        result = conn.execute(query)
        row = result.fetchone()
        if row and row[1] and row[1] > 0:
            data['yoy'] = {
                'recent_txns': row[0],
                'prior_txns': row[1],
                'recent_median': row[2],
                'prior_median': row[3],
                'volume_change_pct': ((row[0] - row[1]) / row[1]) * 100,
                'price_change_pct': ((row[2] - row[3]) / row[3]) * 100,
            }
        else:
            data['yoy'] = None

        # 6. Top projects (last 3 months)
        query = text("""
            SELECT
                project_name,
                market_segment,
                sale_type,
                COUNT(*) as txn_count,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
            FROM transactions
            WHERE transaction_date >= (SELECT MAX(transaction_date) - INTERVAL '3 months' FROM transactions)
              AND COALESCE(is_outlier, false) = false
              AND market_segment IN ('CCR', 'RCR', 'OCR')
            GROUP BY project_name, market_segment, sale_type
            ORDER BY txn_count DESC
            LIMIT 10
        """)
        result = conn.execute(query)
        data['top_projects'] = [
            {
                'name': row[0],
                'region': row[1],
                'sale_type': row[2],
                'txn_count': row[3],
                'median_psf': row[4]
            }
            for row in result
        ]

        # 7. Median PSF by bedroom (last 6 months)
        query = text("""
            SELECT
                bedroom_count,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions
            WHERE transaction_date >= (SELECT MAX(transaction_date) - INTERVAL '6 months' FROM transactions)
              AND COALESCE(is_outlier, false) = false
              AND bedroom_count IS NOT NULL
            GROUP BY bedroom_count
            ORDER BY bedroom_count
        """)
        result = conn.execute(query)
        data['bedroom_psf'] = [
            {'bedroom': row[0], 'median_psf': row[1], 'txn_count': row[2]}
            for row in result
        ]

    return data


def _format_quarter(dt: date) -> str:
    """Format date as Q1 2025 style."""
    return f"Q{(dt.month - 1) // 3 + 1} {dt.year}"


def _generate_markdown(data: Dict[str, Any]) -> str:
    """Generate market-snapshot.md content from query data."""
    today = date.today().isoformat()
    watermark = data['data_watermark'].isoformat() if data['data_watermark'] else 'unknown'

    lines = [
        "# Market Snapshot",
        "",
        f"**Last Updated**: {today}",
        f"**Data Through**: {watermark}",
        "**Source**: URA REALIS (via database)",
        "**Valid Until**: Next sync refresh",
        "",
        "---",
        "",
        "## Current Market State",
        "",
    ]

    # YoY summary
    if data.get('yoy'):
        yoy = data['yoy']
        lines.extend([
            "### Transaction Volume (Last 6 Months)",
            f"- **Total Transactions**: {yoy['recent_txns']:,}",
            f"- **YoY Change**: {yoy['volume_change_pct']:+.1f}% (vs {yoy['prior_txns']:,} same period last year)",
            "",
        ])

    # Quarterly breakdown
    if data.get('quarterly_volume'):
        lines.extend([
            "### Quarterly Breakdown",
            "| Quarter | Transactions |",
            "|---------|--------------|",
        ])
        for q in data['quarterly_volume']:
            qtr_label = _format_quarter(q['quarter'])
            lines.append(f"| {qtr_label} | {q['txn_count']:,} |")
        lines.append("")

    lines.extend([
        "---",
        "",
        "## Price Trends",
        "",
    ])

    # Region PSF
    if data.get('region_psf'):
        lines.extend([
            "### Median PSF by Region (Last 6 Months)",
            "| Region | Median PSF | Transactions |",
            "|--------|------------|--------------|",
        ])
        for r in data['region_psf']:
            lines.append(f"| {r['region']} | ${r['median_psf']:,.0f} | {r['txn_count']:,} |")
        lines.append("")

    # Island-wide + YoY
    if data.get('yoy'):
        yoy = data['yoy']
        lines.extend([
            "### Island-wide",
            f"- **Median PSF**: ${yoy['recent_median']:,.0f}",
            f"- **YoY Change**: {yoy['price_change_pct']:+.1f}% (vs ${yoy['prior_median']:,.0f} same period last year)",
            "",
        ])

    # Sale type PSF
    if data.get('sale_type_psf'):
        lines.extend([
            "### By Sale Type",
            "| Sale Type | Median PSF | Transactions |",
            "|-----------|------------|--------------|",
        ])
        for s in data['sale_type_psf']:
            lines.append(f"| {s['sale_type']} | ${s['median_psf']:,.0f} | {s['txn_count']:,} |")
        lines.append("")

    # Bedroom PSF
    if data.get('bedroom_psf'):
        lines.extend([
            "### By Bedroom",
            "| Bedroom | Median PSF | Transactions |",
            "|---------|------------|--------------|",
        ])
        for b in data['bedroom_psf']:
            lines.append(f"| {b['bedroom']}BR | ${b['median_psf']:,.0f} | {b['txn_count']:,} |")
        lines.append("")

    lines.extend([
        "---",
        "",
        "## Recent Activity (Last 3 Months)",
        "",
    ])

    # Top projects
    if data.get('top_projects'):
        lines.extend([
            "### Top Selling Projects",
            "| Project | Region | Type | Transactions | Median PSF |",
            "|---------|--------|------|--------------|------------|",
        ])
        for p in data['top_projects']:
            lines.append(
                f"| {p['name']} | {p['region']} | {p['sale_type']} | "
                f"{p['txn_count']:,} | ${p['median_psf']:,.0f} |"
            )
        lines.append("")

    lines.extend([
        "---",
        "",
        "**Disclaimer**: Market conditions change. This snapshot reflects data through the stated date. "
        "Always verify current conditions before making decisions.",
        "",
    ])

    return "\n".join(lines)


def _update_manifest(watermark: date) -> None:
    """Update manifest.json with new snapshot timestamp."""
    if not MANIFEST_PATH.exists():
        logger.warning(f"Manifest not found at {MANIFEST_PATH}")
        return

    try:
        with open(MANIFEST_PATH, 'r') as f:
            manifest = json.load(f)

        today = date.today().isoformat()

        # Update snapshot entry
        if 'files' in manifest and 'snapshot/market-snapshot.md' in manifest['files']:
            manifest['files']['snapshot/market-snapshot.md']['updated_at'] = today
            manifest['files']['snapshot/market-snapshot.md']['last_verified_at'] = today

        # Update top-level last_modified
        manifest['last_modified'] = today

        with open(MANIFEST_PATH, 'w') as f:
            json.dump(manifest, f, indent=2)
            f.write('\n')

        logger.info(f"Updated manifest.json with timestamp {today}")

    except Exception as e:
        logger.error(f"Failed to update manifest: {e}")


def refresh_market_snapshot(engine: Optional[Engine] = None) -> bool:
    """
    Refresh market-snapshot.md with current database data.

    Args:
        engine: SQLAlchemy engine. If None, creates one from config.

    Returns:
        True on success, False on failure.
    """
    logger.info("Refreshing market snapshot...")

    try:
        # Get engine if not provided
        if engine is None:
            from services.ura_sync_engine import get_database_engine
            engine = get_database_engine()

        # Query data
        data = _query_snapshot_data(engine)

        # Generate markdown
        markdown = _generate_markdown(data)

        # Write file
        SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(SNAPSHOT_PATH, 'w') as f:
            f.write(markdown)

        logger.info(f"Wrote market snapshot to {SNAPSHOT_PATH}")

        # Update manifest
        _update_manifest(data.get('data_watermark', date.today()))

        logger.info("Market snapshot refresh complete")
        return True

    except Exception as e:
        logger.exception(f"Failed to refresh market snapshot: {e}")
        return False


# CLI entry point for manual runs
if __name__ == '__main__':
    import sys
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s'
    )

    success = refresh_market_snapshot()
    sys.exit(0 if success else 1)
