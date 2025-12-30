"""
SQL Guardrail Tests

These tests prevent SQL parameter style regressions and enforce best practices:
1. No %(name)s psycopg2-style params in backend code
2. Date params must be Python date objects, not strings
3. :name SQLAlchemy style is the only allowed param format

Run with: pytest tests/test_sql_guardrails.py -v
"""
import re
import pytest
from datetime import date, datetime
from pathlib import Path

from db.sql import (
    validate_sql_text,
    validate_params,
    extract_param_names,
    SQLParamStyleError,
    SQLDateParamError,
    OUTLIER_FILTER,
    get_outlier_filter_sql
)


# =============================================================================
# GUARDRAIL: No psycopg2-style %(name)s params in backend code
# =============================================================================

class TestNoLegacyParamStyle:
    """Ensure no %(name)s style params exist in backend SQL."""

    # Pattern to find psycopg2-style params
    PSYCOPG2_PATTERN = re.compile(r'%\([a-zA-Z_][a-zA-Z0-9_]*\)s')

    # Files/directories to scan
    BACKEND_ROOT = Path(__file__).parent.parent

    # Directories to scan
    SCAN_DIRS = ['routes', 'services', 'db', 'api']

    # File extensions to check
    EXTENSIONS = ['.py']

    def get_python_files(self):
        """Get all Python files in backend directories."""
        files = []
        for scan_dir in self.SCAN_DIRS:
            dir_path = self.BACKEND_ROOT / scan_dir
            if dir_path.exists():
                for ext in self.EXTENSIONS:
                    files.extend(dir_path.rglob(f'*{ext}'))
        return files

    def test_no_psycopg2_params_in_backend(self):
        """
        GUARDRAIL: Detect and fail if %(name)s style params are used.

        This prevents the mixing of param styles that causes runtime errors.
        All SQL should use :name SQLAlchemy bind params.
        """
        violations = []

        for filepath in self.get_python_files():
            try:
                content = filepath.read_text(encoding='utf-8')
            except Exception:
                continue

            # Find all matches
            matches = self.PSYCOPG2_PATTERN.findall(content)
            if matches:
                # Get line numbers for context
                lines = content.split('\n')
                for i, line in enumerate(lines, 1):
                    if self.PSYCOPG2_PATTERN.search(line):
                        violations.append({
                            'file': str(filepath.relative_to(self.BACKEND_ROOT)),
                            'line': i,
                            'content': line.strip()[:100]
                        })

        if violations:
            msg = "GUARDRAIL VIOLATION: Found psycopg2-style %(name)s params!\n\n"
            msg += "These should be converted to SQLAlchemy :name style.\n\n"
            for v in violations:
                msg += f"  {v['file']}:{v['line']}\n"
                msg += f"    {v['content']}\n\n"
            msg += "Fix by replacing %(name)s with :name in SQL text."
            pytest.fail(msg)

    def test_no_date_isoformat_in_sql_params(self):
        """
        GUARDRAIL: Detect date.isoformat() being passed to SQL params.

        Pass Python date objects directly, not strings.
        This prevents type mismatch errors with DATE columns.
        """
        # Pattern to find .isoformat() being assigned to params
        ISOFORMAT_PATTERN = re.compile(
            r'params\[[\'"][a-z_]*date[a-z_]*[\'"]\]\s*=\s*[a-z_]+\.isoformat\(\)'
        )

        violations = []

        for filepath in self.get_python_files():
            try:
                content = filepath.read_text(encoding='utf-8')
            except Exception:
                continue

            lines = content.split('\n')
            for i, line in enumerate(lines, 1):
                if ISOFORMAT_PATTERN.search(line):
                    violations.append({
                        'file': str(filepath.relative_to(self.BACKEND_ROOT)),
                        'line': i,
                        'content': line.strip()[:100]
                    })

        if violations:
            msg = "GUARDRAIL VIOLATION: Found .isoformat() being passed to SQL date params!\n\n"
            msg += "Pass Python date objects directly, not strings.\n\n"
            for v in violations:
                msg += f"  {v['file']}:{v['line']}\n"
                msg += f"    {v['content']}\n\n"
            msg += "Fix by passing the date object directly: params['date_from'] = date_from"
            pytest.fail(msg)


# =============================================================================
# SQL HELPER VALIDATION TESTS
# =============================================================================

class TestSqlTextValidation:
    """Test SQL text validation catches bad param styles."""

    def test_valid_sqlalchemy_params(self):
        """Valid :name params should pass."""
        sql = """
            SELECT * FROM transactions
            WHERE project_name = :project_name
              AND transaction_date >= :date_from
              AND sale_type = :sale_type
        """
        # Should not raise
        validate_sql_text(sql)

    def test_rejects_psycopg2_params(self):
        """%(name)s params should be rejected."""
        sql = """
            SELECT * FROM transactions
            WHERE project_name = %(project_name)s
              AND transaction_date >= %(date_from)s
        """
        with pytest.raises(SQLParamStyleError) as exc:
            validate_sql_text(sql)

        assert '%(project_name)s' in str(exc.value)

    def test_rejects_mixed_params(self):
        """Mixed param styles should be rejected."""
        sql = """
            SELECT * FROM transactions
            WHERE project_name = :project_name
              AND transaction_date >= %(date_from)s
        """
        with pytest.raises(SQLParamStyleError):
            validate_sql_text(sql)


class TestParamValidation:
    """Test parameter validation catches bad date types."""

    def test_valid_date_params(self):
        """Python date objects should pass."""
        params = {
            'date_from': date(2024, 1, 1),
            'date_to': datetime(2024, 12, 31, 23, 59, 59),
            'project_name': 'GRAND DUNMAN'
        }
        # Should not raise
        validate_params(params)

    def test_rejects_string_date_from(self):
        """String date_from should be rejected."""
        params = {
            'date_from': '2024-01-01',  # String, not date
            'project_name': 'GRAND DUNMAN'
        }
        with pytest.raises(SQLDateParamError) as exc:
            validate_params(params)

        assert 'date_from' in str(exc.value)
        assert 'string' in str(exc.value).lower()

    def test_rejects_string_date_to(self):
        """String date_to should be rejected."""
        params = {
            'date_to': '2024-12-31',
            'date_from': date(2024, 1, 1)  # This is correct
        }
        with pytest.raises(SQLDateParamError) as exc:
            validate_params(params)

        assert 'date_to' in str(exc.value)

    def test_rejects_custom_date_param(self):
        """Custom *_date params should also be validated."""
        params = {
            'cutoff_date': '2024-06-01',
        }
        with pytest.raises(SQLDateParamError) as exc:
            validate_params(params)

        assert 'cutoff_date' in str(exc.value)

    def test_none_date_params_allowed(self):
        """None values for date params should be allowed."""
        params = {
            'date_from': None,
            'date_to': None,
            'project_name': 'GRAND DUNMAN'
        }
        # Should not raise
        validate_params(params)

    def test_non_date_params_not_validated(self):
        """Non-date params can be strings."""
        params = {
            'project_name': 'GRAND DUNMAN',
            'district': 'D15',
            'sale_type': 'Resale'
        }
        # Should not raise
        validate_params(params)


class TestExtractParamNames:
    """Test parameter name extraction."""

    def test_extracts_simple_params(self):
        """Extract :name params from SQL."""
        sql = "SELECT * FROM t WHERE a = :foo AND b = :bar"
        names = extract_param_names(sql)
        assert 'foo' in names
        assert 'bar' in names

    def test_extracts_underscore_params(self):
        """Extract params with underscores."""
        sql = "WHERE project_name = :project_name AND date_from = :date_from"
        names = extract_param_names(sql)
        assert 'project_name' in names
        assert 'date_from' in names

    def test_handles_no_params(self):
        """Handle SQL with no params."""
        sql = "SELECT * FROM transactions LIMIT 10"
        names = extract_param_names(sql)
        assert names == []


class TestOutlierFilter:
    """Test the standard outlier filter constant and usage."""

    def test_outlier_filter_format(self):
        """Ensure outlier filter uses COALESCE for null safety."""
        assert 'COALESCE' in OUTLIER_FILTER
        assert 'is_outlier' in OUTLIER_FILTER
        assert 'false' in OUTLIER_FILTER

    def test_outlier_filter_exact_format(self):
        """Ensure outlier filter matches exact expected format."""
        expected = "COALESCE(is_outlier, false) = false"
        assert OUTLIER_FILTER == expected


class TestGetOutlierFilterSql:
    """Test get_outlier_filter_sql() alias handling."""

    def test_no_alias(self):
        """No alias returns base filter."""
        result = get_outlier_filter_sql()
        assert result == "COALESCE(is_outlier, false) = false"

    def test_none_alias(self):
        """None alias returns base filter."""
        result = get_outlier_filter_sql(None)
        assert result == "COALESCE(is_outlier, false) = false"

    def test_empty_string_alias(self):
        """Empty string alias returns base filter (no malformed SQL)."""
        result = get_outlier_filter_sql("")
        assert result == "COALESCE(is_outlier, false) = false"
        assert ".is_outlier" not in result  # No leading dot

    def test_whitespace_only_alias(self):
        """Whitespace-only alias returns base filter (no malformed SQL)."""
        result = get_outlier_filter_sql("   ")
        assert result == "COALESCE(is_outlier, false) = false"
        assert ".is_outlier" not in result  # No leading dot

    def test_valid_alias(self):
        """Valid alias is properly included."""
        result = get_outlier_filter_sql("t")
        assert result == "COALESCE(t.is_outlier, false) = false"

    def test_alias_with_whitespace(self):
        """Alias with surrounding whitespace is trimmed."""
        result = get_outlier_filter_sql("  t  ")
        assert result == "COALESCE(t.is_outlier, false) = false"

    def test_longer_alias(self):
        """Longer alias works correctly."""
        result = get_outlier_filter_sql("transactions")
        assert result == "COALESCE(transactions.is_outlier, false) = false"


class TestNoLegacyOutlierPatterns:
    """
    GUARDRAIL: Detect legacy outlier filtering patterns.

    All outlier filtering should use either:
    - OUTLIER_FILTER constant for raw SQL
    - exclude_outliers(Model) for SQLAlchemy ORM

    Legacy patterns that should NOT exist:
    - is_outlier = false (not null-safe)
    - is_outlier IS NULL OR is_outlier = false (verbose)
    - Transaction.is_outlier == False (not null-safe)
    - or_(Transaction.is_outlier == False, Transaction.is_outlier.is_(None)) (verbose)
    """

    BACKEND_ROOT = Path(__file__).parent.parent
    SCAN_DIRS = ['routes', 'services']

    # Patterns that indicate legacy outlier filtering
    # Note: We exclude files that intentionally check for outliers (like data_validation)
    LEGACY_PATTERNS = [
        # Raw SQL patterns (should use OUTLIER_FILTER or get_outlier_filter_sql)
        re.compile(r"is_outlier\s*=\s*false\s+OR\s+is_outlier\s+IS\s+NULL", re.IGNORECASE),
        # ORM patterns (should use exclude_outliers)
        re.compile(r"or_\(\s*Transaction\.is_outlier\s*==\s*False"),
        re.compile(r"or_\(\s*\w+\.is_outlier\s*==\s*False"),
        # Inverted COALESCE patterns (wrong logic)
        re.compile(r"COALESCE\s*\(\s*is_outlier\s*,\s*false\s*\)\s*!=\s*true", re.IGNORECASE),
        re.compile(r"COALESCE\s*\(\s*is_outlier\s*,\s*false\s*\)\s*<>\s*true", re.IGNORECASE),
        re.compile(r"COALESCE\s*\(\s*\w+\.is_outlier\s*,\s*false\s*\)\s*!=\s*true", re.IGNORECASE),
        re.compile(r"COALESCE\s*\(\s*\w+\.is_outlier\s*,\s*false\s*\)\s*<>\s*true", re.IGNORECASE),
    ]

    # Files to skip (they intentionally work with outliers or are in tests/migrations)
    SKIP_FILES = [
        'data_validation.py',  # Intentionally marks outliers
        'test_',  # Test files
        '__pycache__',
    ]

    def get_python_files(self):
        files = []
        for scan_dir in self.SCAN_DIRS:
            dir_path = self.BACKEND_ROOT / scan_dir
            if dir_path.exists():
                files.extend(dir_path.rglob('*.py'))
        return files

    def should_skip(self, filepath):
        """Check if file should be skipped."""
        name = filepath.name
        for skip in self.SKIP_FILES:
            if skip in str(filepath):
                return True
        return False

    def test_no_verbose_outlier_patterns(self):
        """
        GUARDRAIL: Detect verbose outlier patterns that should use helpers.

        This catches:
        - is_outlier = false OR is_outlier IS NULL (should use OUTLIER_FILTER)
        - or_(Transaction.is_outlier == False, ...) (should use exclude_outliers)
        """
        violations = []

        for filepath in self.get_python_files():
            if self.should_skip(filepath):
                continue

            try:
                content = filepath.read_text(encoding='utf-8')
            except Exception:
                continue

            lines = content.split('\n')
            for i, line in enumerate(lines, 1):
                for pattern in self.LEGACY_PATTERNS:
                    if pattern.search(line):
                        violations.append({
                            'file': str(filepath.relative_to(self.BACKEND_ROOT)),
                            'line': i,
                            'content': line.strip()[:100]
                        })

        if violations:
            msg = "GUARDRAIL VIOLATION: Found legacy outlier filtering patterns!\n\n"
            msg += "Replace with centralized helpers:\n"
            msg += "  - Raw SQL: Use OUTLIER_FILTER or get_outlier_filter_sql()\n"
            msg += "  - ORM: Use exclude_outliers(Transaction)\n\n"
            for v in violations:
                msg += f"  {v['file']}:{v['line']}\n"
                msg += f"    {v['content']}\n\n"
            pytest.fail(msg)


# =============================================================================
# DATE CAST DETECTION (::date should not be needed)
# =============================================================================

class TestNoUnnecessaryDateCasts:
    """Detect unnecessary ::date casts when using Python date objects."""

    # Pattern for ::date casts on bound params
    DATE_CAST_PATTERN = re.compile(r':([a-z_]+)::date')

    BACKEND_ROOT = Path(__file__).parent.parent
    SCAN_DIRS = ['routes', 'services', 'db']

    def get_python_files(self):
        files = []
        for scan_dir in self.SCAN_DIRS:
            dir_path = self.BACKEND_ROOT / scan_dir
            if dir_path.exists():
                files.extend(dir_path.rglob('*.py'))
        return files

    def test_no_date_casts_on_bound_params(self):
        """
        GUARDRAIL: Detect :param::date casts.

        If passing Python date objects, no cast is needed.
        Casts suggest string params are being used (bad practice).
        """
        violations = []

        for filepath in self.get_python_files():
            try:
                content = filepath.read_text(encoding='utf-8')
            except Exception:
                continue

            matches = self.DATE_CAST_PATTERN.findall(content)
            if matches:
                lines = content.split('\n')
                for i, line in enumerate(lines, 1):
                    match = self.DATE_CAST_PATTERN.search(line)
                    if match:
                        violations.append({
                            'file': str(filepath.relative_to(self.BACKEND_ROOT)),
                            'line': i,
                            'param': match.group(1),
                            'content': line.strip()[:100]
                        })

        if violations:
            msg = "GUARDRAIL VIOLATION: Found :param::date casts!\n\n"
            msg += "If passing Python date objects, no ::date cast is needed.\n"
            msg += "Remove the cast and pass date objects directly.\n\n"
            for v in violations:
                msg += f"  {v['file']}:{v['line']} (:{v['param']}::date)\n"
                msg += f"    {v['content']}\n\n"
            pytest.fail(msg)


# =============================================================================
# HARDCODED ENUM STRING DETECTION
# =============================================================================

class TestNoHardcodedEnumStrings:
    """
    GUARDRAIL: Detect hardcoded sale_type and tenure DB values.

    All sale_type and tenure comparisons should use centralized constants:
    - SALE_TYPE_NEW, SALE_TYPE_RESALE, SALE_TYPE_SUB
    - TENURE_FREEHOLD, TENURE_99_YEAR, TENURE_999_YEAR

    This prevents typos and ensures consistency across the codebase.
    """

    BACKEND_ROOT = Path(__file__).parent.parent
    SCAN_DIRS = ['routes', 'services']

    # Patterns for hardcoded enum comparisons (excludes comments, docstrings, UI labels)
    SALE_TYPE_PATTERNS = [
        # Equality comparisons
        re.compile(r"==\s*['\"]New Sale['\"]"),
        re.compile(r"==\s*['\"]Resale['\"]"),
        re.compile(r"==\s*['\"]Sub Sale['\"]"),
        # SQL fragments (not using f-string interpolation with constant)
        re.compile(r"sale_type\s*=\s*'New Sale'"),
        re.compile(r"sale_type\s*=\s*'Resale'"),
        re.compile(r"sale_type\s*=\s*'Sub Sale'"),
    ]

    TENURE_PATTERNS = [
        # Note: Only check direct string comparisons, not .lower() or LIKE patterns
        # which may be intentional for flexible matching
        re.compile(r"==\s*['\"]Freehold['\"](?!\s*\.lower)"),
        re.compile(r"==\s*['\"]99-year['\"](?!\s*\.lower)"),
        re.compile(r"==\s*['\"]999-year['\"](?!\s*\.lower)"),
    ]

    # Files to skip
    SKIP_FILES = [
        '__pycache__',
        'test_',
        'constants.py',  # The source of truth
        'contract_schema.py',  # API contract definitions
    ]

    # Line patterns to skip (comments, docstrings, UI labels)
    SKIP_LINE_PATTERNS = [
        re.compile(r'^\s*#'),  # Comments
        re.compile(r'^\s*["\'].*["\']$'),  # Standalone strings (docstrings)
        re.compile(r'^\s*- '),  # Docstring bullet points
        re.compile(r'sale_type_label\s*='),  # UI labels
        re.compile(r"label\s*=\s*['\"]"),  # UI labels
    ]

    def get_python_files(self):
        files = []
        for scan_dir in self.SCAN_DIRS:
            dir_path = self.BACKEND_ROOT / scan_dir
            if dir_path.exists():
                files.extend(dir_path.rglob('*.py'))
        return files

    def should_skip_file(self, filepath):
        for skip in self.SKIP_FILES:
            if skip in str(filepath):
                return True
        return False

    def should_skip_line(self, line):
        for pattern in self.SKIP_LINE_PATTERNS:
            if pattern.search(line):
                return True
        return False

    def test_no_hardcoded_sale_type_strings(self):
        """
        GUARDRAIL: Detect hardcoded 'New Sale', 'Resale', 'Sub Sale' strings.

        These should use SALE_TYPE_NEW, SALE_TYPE_RESALE, SALE_TYPE_SUB from constants.
        """
        violations = []

        for filepath in self.get_python_files():
            if self.should_skip_file(filepath):
                continue

            try:
                content = filepath.read_text(encoding='utf-8')
            except Exception:
                continue

            lines = content.split('\n')
            for i, line in enumerate(lines, 1):
                if self.should_skip_line(line):
                    continue

                for pattern in self.SALE_TYPE_PATTERNS:
                    if pattern.search(line):
                        violations.append({
                            'file': str(filepath.relative_to(self.BACKEND_ROOT)),
                            'line': i,
                            'content': line.strip()[:100]
                        })
                        break  # Only report once per line

        if violations:
            msg = "GUARDRAIL VIOLATION: Found hardcoded sale_type strings!\n\n"
            msg += "Use constants from constants.py:\n"
            msg += "  - SALE_TYPE_NEW instead of 'New Sale'\n"
            msg += "  - SALE_TYPE_RESALE instead of 'Resale'\n"
            msg += "  - SALE_TYPE_SUB instead of 'Sub Sale'\n\n"
            msg += "For SQL fragments, use f-string: sale_type = '{SALE_TYPE_NEW}'\n\n"
            for v in violations:
                msg += f"  {v['file']}:{v['line']}\n"
                msg += f"    {v['content']}\n\n"
            pytest.fail(msg)
