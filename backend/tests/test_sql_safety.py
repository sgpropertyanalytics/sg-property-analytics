"""
SQL Safety Guard - Prevents silent correctness bugs in SQL queries.

Checks for:
- Cartesian joins / missing join keys
- Unbounded queries on large tables
- SELECT * in production queries
- Non-deterministic aggregations (MODE, unordered array_agg)
- Missing outlier filters

Run with: pytest tests/test_sql_safety.py -v
"""

import ast
import re
from pathlib import Path
import pytest


# Patterns that indicate potential issues
DANGEROUS_PATTERNS = [
    # Cartesian join (CROSS JOIN or comma join without WHERE)
    (r"FROM\s+\w+\s*,\s*\w+(?!\s+WHERE)", "Potential cartesian join (comma join without WHERE)"),

    # SELECT * (should use explicit columns)
    (r"SELECT\s+\*\s+FROM", "SELECT * found - use explicit columns"),

    # MODE() is non-deterministic on ties
    (r"MODE\s*\(\s*\)", "MODE() is non-deterministic on ties"),

    # Unordered array_agg
    (r"array_agg\s*\([^)]+\)(?!\s+FILTER)(?![^)]*ORDER\s+BY)", "array_agg without ORDER BY is non-deterministic"),

    # Missing COALESCE for is_outlier
    # Recognizes: COALESCE(is_outlier...), is_outlier = false, {OUTLIER_FILTER}, {outlier_filter_*}, {where_clause}
    (r"FROM\s+transactions\b(?!.*(?:COALESCE|is_outlier\s*=\s*false|OUTLIER_FILTER|outlier_filter|where_clause))", "Query on transactions may be missing outlier filter"),
]

# Patterns that are OK (false positive suppressors)
SAFE_PATTERNS = [
    r"--\s*sql-safety:\s*ignore",  # Explicit ignore comment
    r"#\s*noqa:\s*sql-safety",      # noqa comment
]

# Files to check
SERVICE_FILES = [
    "services/dashboard_service.py",
    "services/price_bands_service.py",
    "services/price_growth_service.py",
    "services/exit_queue_service.py",
    "services/new_launch_service.py",
    "services/analytics_reader.py",
]


def extract_sql_strings(filepath: Path) -> list[tuple[int, str]]:
    """Extract SQL strings from Python file with line numbers."""
    content = filepath.read_text()
    sql_strings = []

    # Match triple-quoted strings that look like SQL
    pattern = r'("""|\'\'\')(.*?)\1'
    for match in re.finditer(pattern, content, re.DOTALL):
        sql = match.group(2)
        # Check if it looks like SQL
        if any(kw in sql.upper() for kw in ["SELECT", "INSERT", "UPDATE", "DELETE", "WITH"]):
            # Calculate line number
            line_num = content[:match.start()].count('\n') + 1
            sql_strings.append((line_num, sql))

    return sql_strings


def check_sql_for_issues(sql: str, line_num: int, filepath: str) -> list[str]:
    """Check SQL string for dangerous patterns."""
    issues = []

    # Skip if has ignore comment
    for safe_pattern in SAFE_PATTERNS:
        if re.search(safe_pattern, sql, re.IGNORECASE):
            return []

    # Normalize SQL for pattern matching
    normalized = re.sub(r'\s+', ' ', sql.upper())

    for pattern, message in DANGEROUS_PATTERNS:
        if re.search(pattern, normalized, re.IGNORECASE):
            issues.append(f"{filepath}:{line_num}: {message}")

    return issues


class TestSQLSafety:
    """SQL safety checks for service files."""

    @pytest.fixture
    def backend_root(self):
        return Path(__file__).parent.parent

    def test_no_dangerous_sql_patterns(self, backend_root):
        """Check all service files for dangerous SQL patterns."""
        all_issues = []

        for service_file in SERVICE_FILES:
            filepath = backend_root / service_file
            if not filepath.exists():
                continue

            sql_strings = extract_sql_strings(filepath)
            for line_num, sql in sql_strings:
                issues = check_sql_for_issues(sql, line_num, service_file)
                all_issues.extend(issues)

        if all_issues:
            issue_report = "\n".join(all_issues)
            pytest.fail(f"SQL safety issues found:\n{issue_report}")

    def test_outlier_filter_in_transaction_queries(self, backend_root):
        """Verify transaction queries include outlier filter."""
        files_missing_filter = []

        for service_file in SERVICE_FILES:
            filepath = backend_root / service_file
            if not filepath.exists():
                continue

            content = filepath.read_text()

            # Check for transaction queries
            if "FROM transactions" in content or "from transactions" in content:
                # Should have outlier filter
                has_filter = any([
                    "COALESCE(is_outlier" in content,
                    "is_outlier = false" in content,
                    "is_outlier = FALSE" in content,
                    "get_outlier_filter" in content,
                ])

                if not has_filter:
                    files_missing_filter.append(service_file)

        if files_missing_filter:
            pytest.fail(
                f"Files with transaction queries missing outlier filter:\n"
                + "\n".join(f"  - {f}" for f in files_missing_filter)
            )

    def test_order_by_includes_tiebreaker(self, backend_root):
        """ORDER BY should include id or deterministic tiebreaker."""
        issues = []

        for service_file in SERVICE_FILES:
            filepath = backend_root / service_file
            if not filepath.exists():
                continue

            sql_strings = extract_sql_strings(filepath)
            for line_num, sql in sql_strings:
                # Find ORDER BY clauses
                order_matches = re.findall(
                    r"ORDER\s+BY\s+([^;]+?)(?:LIMIT|OFFSET|$|\))",
                    sql,
                    re.IGNORECASE | re.DOTALL
                )

                for order_clause in order_matches:
                    # Check if it has a tiebreaker (id, rowid, or multiple columns)
                    columns = [c.strip() for c in order_clause.split(",")]
                    if len(columns) == 1:
                        # Single column - might be non-deterministic
                        col = columns[0].lower()
                        if col not in ("id", "rowid", "transaction_id"):
                            issues.append(
                                f"{service_file}:{line_num}: "
                                f"ORDER BY {col} lacks tiebreaker (add id)"
                            )

        # This is a warning, not a hard failure
        if issues:
            print("\nSQL ORDER BY warnings (may be false positives):")
            for issue in issues[:5]:
                print(f"  {issue}")


class TestQueryDeterminism:
    """Tests for query result determinism."""

    def test_no_mode_function(self, backend_root=Path(__file__).parent.parent):
        """MODE() function should not be used (non-deterministic on ties)."""
        for service_file in SERVICE_FILES:
            filepath = backend_root / service_file
            if not filepath.exists():
                continue

            content = filepath.read_text()
            if "MODE(" in content.upper():
                pytest.fail(
                    f"{service_file} uses MODE() which is non-deterministic on ties. "
                    "Use explicit tiebreaker logic instead."
                )

    def test_array_agg_has_order_by(self, backend_root=Path(__file__).parent.parent):
        """array_agg should have ORDER BY for deterministic results."""
        issues = []

        for service_file in SERVICE_FILES:
            filepath = backend_root / service_file
            if not filepath.exists():
                continue

            sql_strings = extract_sql_strings(filepath)
            for line_num, sql in sql_strings:
                # Find array_agg without ORDER BY
                pattern = r"array_agg\s*\(\s*\w+\s*\)(?!\s*FILTER)(?![^)]*ORDER\s+BY)"
                if re.search(pattern, sql, re.IGNORECASE):
                    issues.append(f"{service_file}:{line_num}: array_agg without ORDER BY")

        if issues:
            pytest.fail(
                "array_agg without ORDER BY found (non-deterministic):\n"
                + "\n".join(f"  {i}" for i in issues)
            )
