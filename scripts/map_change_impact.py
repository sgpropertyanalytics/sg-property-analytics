#!/usr/bin/env python3
"""
Map changed files to affected charts/pages for PR impact analysis.

Usage:
    python scripts/map_change_impact.py --changed-files "file1.py,file2.js"
    python scripts/map_change_impact.py --changed-files-file /tmp/changed.txt
    python scripts/map_change_impact.py --output impact.json

Output: JSON with risk score, affected charts, affected pages, suggested tests.
"""

import argparse
import json
import sys
from pathlib import Path


# Risk directory mappings (from .claude/review-rules.yml)
RISK_DIRECTORIES = {
    "critical": [
        "backend/api/contracts/",
        "backend/services/",
        "frontend/src/context/AuthContext",
        "backend/routes/",
    ],
    "high": [
        "frontend/src/hooks/",
        "frontend/src/adapters/",
        "frontend/src/schemas/",
        "backend/utils/normalize.py",
    ],
    "medium": [
        "frontend/src/components/powerbi/",
        "frontend/src/pages/",
        "backend/tests/",
    ],
}

# File -> Chart dependency mappings
FILE_TO_CHARTS = {
    "backend/services/dashboard_service.py": [
        "TimeTrendChart", "BeadsChart", "DistrictHeatmap", "KPICards"
    ],
    "backend/services/price_growth_service.py": [
        "PriceGrowthChart", "DistrictPriceChart"
    ],
    "backend/services/data_processor.py": [
        "All aggregate charts"
    ],
    "frontend/src/adapters/aggregate/": [
        "TimeTrendChart", "BeadsChart", "PriceDistribution"
    ],
    "frontend/src/adapters/transactions/": [
        "TransactionDataTable"
    ],
    "frontend/src/components/powerbi/TimeTrendChart": [
        "TimeTrendChart"
    ],
    "frontend/src/components/powerbi/BeadsChart": [
        "BeadsChart"
    ],
    "backend/api/contracts/schemas/aggregate.py": [
        "All charts using /api/aggregate"
    ],
}

# File -> Page mappings
FILE_TO_PAGES = {
    "backend/services/dashboard_service.py": [
        "/market-overview", "/district-overview"
    ],
    "backend/routes/analytics.py": [
        "/market-overview", "/district-overview", "/new-launch-market"
    ],
    "frontend/src/pages/MacroOverview": [
        "/market-overview"
    ],
    "frontend/src/pages/DistrictDeepDive": [
        "/district-overview"
    ],
    "frontend/src/pages/NewLaunchMarket": [
        "/new-launch-market"
    ],
    "frontend/src/context/AuthContext": [
        "All pages (auth)"
    ],
}

# File -> Suggested tests
FILE_TO_TESTS = {
    "backend/services/": [
        "pytest tests/test_regression_snapshots.py",
        "pytest tests/test_smoke_endpoints.py"
    ],
    "backend/routes/": [
        "pytest tests/test_smoke_endpoints.py"
    ],
    "backend/api/contracts/": [
        "python backend/scripts/generate_contracts.py",
        "pytest tests/test_api_contract.py"
    ],
    "frontend/src/components/": [
        "npm run test:e2e"
    ],
    "frontend/src/pages/": [
        "npm run test:e2e"
    ],
    "frontend/src/adapters/": [
        "npm run test:ci",
        "npm run test:e2e"
    ],
    "frontend/src/hooks/": [
        "npm run test:ci"
    ],
}

# Human review tag suggestions
FILE_TO_REVIEW_TAGS = {
    "backend/services/": "needs-backend-owner",
    "backend/routes/": "needs-backend-owner",
    "frontend/src/context/AuthContext": "needs-auth-owner",
    "backend/routes/auth.py": "needs-auth-owner",
    "backend/api/contracts/": "needs-contract-review",
    "frontend/src/components/powerbi/": "needs-chart-review",
}


def get_risk_level(changed_files: list[str]) -> tuple[str, str]:
    """Determine risk level based on changed files."""
    for f in changed_files:
        for critical_path in RISK_DIRECTORIES["critical"]:
            if critical_path in f:
                return "HIGH", f"Critical path touched: {critical_path}"

    for f in changed_files:
        for high_path in RISK_DIRECTORIES["high"]:
            if high_path in f:
                return "MEDIUM", f"High-risk path touched: {high_path}"

    for f in changed_files:
        for medium_path in RISK_DIRECTORIES["medium"]:
            if medium_path in f:
                return "LOW", f"Standard path touched: {medium_path}"

    return "LOW", "No high-risk paths detected"


def get_affected_charts(changed_files: list[str]) -> list[str]:
    """Get list of charts affected by changed files."""
    affected = set()
    for f in changed_files:
        for pattern, charts in FILE_TO_CHARTS.items():
            if pattern in f:
                affected.update(charts)
    return sorted(affected) if affected else ["Unknown - verify manually"]


def get_affected_pages(changed_files: list[str]) -> list[str]:
    """Get list of pages affected by changed files."""
    affected = set()
    for f in changed_files:
        for pattern, pages in FILE_TO_PAGES.items():
            if pattern in f:
                affected.update(pages)
    return sorted(affected) if affected else ["Unknown - verify manually"]


def get_suggested_tests(changed_files: list[str]) -> list[str]:
    """Get suggested tests based on changed files."""
    tests = set()
    for f in changed_files:
        for pattern, test_list in FILE_TO_TESTS.items():
            if pattern in f:
                tests.update(test_list)
    return sorted(tests) if tests else ["npm run test:e2e"]


def get_review_tags(changed_files: list[str]) -> list[str]:
    """Get suggested human review tags."""
    tags = set()
    for f in changed_files:
        for pattern, tag in FILE_TO_REVIEW_TAGS.items():
            if pattern in f:
                tags.add(tag)
    return sorted(tags)


def analyze_impact(changed_files: list[str]) -> dict:
    """Analyze impact of changed files."""
    risk_level, risk_reason = get_risk_level(changed_files)

    return {
        "risk_level": risk_level,
        "risk_reason": risk_reason,
        "affected_charts": get_affected_charts(changed_files),
        "affected_pages": get_affected_pages(changed_files),
        "suggested_tests": get_suggested_tests(changed_files),
        "review_tags": get_review_tags(changed_files),
        "changed_files_count": len(changed_files),
    }


def main():
    parser = argparse.ArgumentParser(description="Map changed files to impact")
    parser.add_argument("--changed-files", type=str, help="Comma-separated list of changed files")
    parser.add_argument("--changed-files-file", type=str, help="File containing changed files (one per line)")
    parser.add_argument("--output", type=str, help="Output file path (JSON)")
    args = parser.parse_args()

    # Get changed files
    changed_files = []
    if args.changed_files:
        changed_files = [f.strip() for f in args.changed_files.split(",") if f.strip()]
    elif args.changed_files_file:
        with open(args.changed_files_file) as f:
            changed_files = [line.strip() for line in f if line.strip()]
    else:
        # Read from stdin
        changed_files = [line.strip() for line in sys.stdin if line.strip()]

    if not changed_files:
        print(json.dumps({"error": "No changed files provided"}))
        sys.exit(1)

    # Analyze impact
    impact = analyze_impact(changed_files)

    # Output
    result = json.dumps(impact, indent=2)

    if args.output:
        Path(args.output).write_text(result)
        print(f"Impact analysis written to {args.output}")
    else:
        print(result)


if __name__ == "__main__":
    main()
