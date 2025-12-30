#!/usr/bin/env python3
"""
Data Guard: Validates critical CSV invariants to prevent silent data corruption.

Usage:
    # CI mode (default) - compare against baseline
    python3 scripts/data_guard.py --file backend/data/new_launch_units.csv --baseline .ci/baselines/new_launch_units.csv

    # Local mode - for pre-commit hooks
    python3 scripts/data_guard.py --mode local --file backend/data/new_launch_units.csv --baseline .ci/baselines/new_launch_units.csv

    # Runtime mode - for startup checks (warnings only)
    python3 scripts/data_guard.py --mode runtime --file backend/data/new_launch_units.csv

Validations:
    1. File exists and is parseable as CSV
    2. Required columns exist (project_name, total_units)
    3. Row count >= MIN_ROWS (default 800)
    4. Row drop vs baseline <= DROP_PCT (default 20%)
    5. No duplicate project_name values
    6. total_units is positive integer for 95%+ rows

Environment variables:
    DATA_GUARD_MIN_ROWS_NEW_LAUNCH_UNITS: Minimum row count (default: 800)
    DATA_GUARD_DROP_PCT_NEW_LAUNCH_UNITS: Max drop percentage (default: 0.20)
"""

import argparse
import csv
import os
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional

# Defaults (can be overridden via env vars)
MIN_ROWS_DEFAULT = 800
DROP_PCT_DEFAULT = 0.20
VALID_UNITS_THRESHOLD = 0.95  # 95% of rows must have valid total_units


def get_config(filename: str) -> Dict[str, Any]:
    """Get configuration for a specific file from env vars or defaults."""
    # Convert filename to env var suffix: new_launch_units.csv -> NEW_LAUNCH_UNITS
    suffix = Path(filename).stem.upper()

    min_rows = int(os.environ.get(f'DATA_GUARD_MIN_ROWS_{suffix}', MIN_ROWS_DEFAULT))
    drop_pct = float(os.environ.get(f'DATA_GUARD_DROP_PCT_{suffix}', DROP_PCT_DEFAULT))

    return {
        'min_rows': min_rows,
        'drop_pct': drop_pct,
        'valid_units_threshold': VALID_UNITS_THRESHOLD,
    }


def read_csv(filepath: str) -> tuple[List[str], List[Dict[str, str]]]:
    """Read CSV file and return headers and rows."""
    with open(filepath, 'r', newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        rows = list(reader)
    return headers, rows


def validate_file(filepath: str, baseline_path: Optional[str], mode: str) -> Dict[str, Any]:
    """
    Validate a CSV file against invariants.

    Returns dict with:
        - passed: bool
        - errors: list of error messages
        - warnings: list of warning messages
        - stats: dict of computed statistics
    """
    config = get_config(filepath)
    result = {
        'passed': True,
        'errors': [],
        'warnings': [],
        'stats': {},
    }

    # 1. File exists and is parseable
    try:
        headers, rows = read_csv(filepath)
    except FileNotFoundError:
        result['passed'] = False
        result['errors'].append(f"File not found: {filepath}")
        return result
    except Exception as e:
        result['passed'] = False
        result['errors'].append(f"Failed to parse CSV: {e}")
        return result

    row_count = len(rows)
    result['stats']['row_count'] = row_count
    result['stats']['columns'] = headers

    # 2. Required columns exist
    required_columns = ['project_name', 'total_units']
    missing_columns = [col for col in required_columns if col not in headers]
    if missing_columns:
        result['passed'] = False
        result['errors'].append(
            f"Missing required columns: {missing_columns}. "
            f"Available columns: {headers}"
        )
        return result  # Can't continue without required columns

    # 3. Row count minimum
    min_rows = config['min_rows']
    if row_count < min_rows:
        result['passed'] = False
        result['errors'].append(
            f"Row count {row_count} is below minimum {min_rows}"
        )

    # 4. Row count drop vs baseline
    if baseline_path:
        try:
            _, baseline_rows = read_csv(baseline_path)
            baseline_count = len(baseline_rows)
            result['stats']['baseline_count'] = baseline_count

            if baseline_count > 0:
                drop_pct = (baseline_count - row_count) / baseline_count
                result['stats']['drop_pct'] = drop_pct

                max_drop = config['drop_pct']
                if drop_pct > max_drop:
                    result['passed'] = False
                    result['errors'].append(
                        f"Row count dropped {drop_pct:.1%} from baseline "
                        f"({baseline_count} -> {row_count}). Max allowed: {max_drop:.0%}"
                    )
        except FileNotFoundError:
            result['warnings'].append(f"Baseline file not found: {baseline_path}")
        except Exception as e:
            result['warnings'].append(f"Failed to read baseline: {e}")

    # 5. Duplicate project_name detection
    project_names = [
        row.get('project_name', '').strip().upper()
        for row in rows
        if row.get('project_name', '').strip()
    ]
    name_counts = Counter(project_names)
    duplicates = {name: count for name, count in name_counts.items() if count > 1}
    result['stats']['duplicates'] = len(duplicates)

    if duplicates:
        result['passed'] = False
        dup_examples = list(duplicates.items())[:5]
        result['errors'].append(
            f"Found {len(duplicates)} duplicate project_name values: "
            f"{dup_examples}"
        )

    # 6. Numeric sanity for total_units
    valid_units = 0
    invalid_units = 0
    for row in rows:
        units_str = row.get('total_units', '').strip()
        if units_str:
            try:
                units = int(units_str)
                if units > 0:
                    valid_units += 1
                else:
                    invalid_units += 1
            except ValueError:
                invalid_units += 1
        else:
            # Empty is considered "needs data" but not invalid
            pass

    total_with_units = valid_units + invalid_units
    if total_with_units > 0:
        valid_pct = valid_units / total_with_units
        result['stats']['valid_units_pct'] = valid_pct
        result['stats']['valid_units'] = valid_units
        result['stats']['invalid_units'] = invalid_units

        threshold = config['valid_units_threshold']
        if valid_pct < threshold:
            result['passed'] = False
            result['errors'].append(
                f"Only {valid_pct:.1%} of rows have valid total_units (>0). "
                f"Required: {threshold:.0%}"
            )

    return result


def print_report(filepath: str, result: Dict[str, Any], mode: str) -> None:
    """Print a formatted report of validation results."""
    stats = result['stats']
    passed = result['passed']

    # Header
    print()
    print("=" * 60)
    print("DATA GUARD REPORT")
    print("=" * 60)
    print(f"File: {filepath}")
    print(f"Mode: {mode}")
    print("-" * 60)

    # Stats
    if 'row_count' in stats:
        baseline_info = ""
        if 'baseline_count' in stats:
            drop_pct = stats.get('drop_pct', 0)
            baseline_info = f" (baseline: {stats['baseline_count']}, drop: {drop_pct:+.1%})"
        print(f"Rows: {stats['row_count']}{baseline_info}")

    if 'columns' in stats:
        print(f"Columns: {', '.join(stats['columns'])}")

    if 'duplicates' in stats:
        dup_status = "PASS" if stats['duplicates'] == 0 else "FAIL"
        print(f"Duplicates: {stats['duplicates']} [{dup_status}]")

    if 'valid_units_pct' in stats:
        pct = stats['valid_units_pct']
        pct_status = "PASS" if pct >= VALID_UNITS_THRESHOLD else "FAIL"
        print(f"Valid total_units: {pct:.1%} [{pct_status}]")

    print("-" * 60)

    # Errors
    if result['errors']:
        print("ERRORS:")
        for error in result['errors']:
            print(f"  - {error}")

    # Warnings
    if result['warnings']:
        print("WARNINGS:")
        for warning in result['warnings']:
            print(f"  - {warning}")

    # Summary
    print("-" * 60)
    if passed:
        print("RESULT: PASSED")
    else:
        print("RESULT: FAILED")
    print("=" * 60)
    print()


def validate_csv_runtime(filepath: str) -> Dict[str, Any]:
    """
    Runtime validation for use in backend startup.
    Returns result dict but does NOT exit - caller handles logging.
    """
    result = validate_file(filepath, baseline_path=None, mode='runtime')
    return result


def main():
    parser = argparse.ArgumentParser(
        description='Validate critical CSV file invariants',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument(
        '--file',
        action='append',
        required=True,
        dest='files',
        help='CSV file to validate (can be repeated)'
    )
    parser.add_argument(
        '--mode',
        choices=['ci', 'local', 'runtime'],
        default='ci',
        help='Validation mode (default: ci)'
    )
    parser.add_argument(
        '--baseline',
        help='Baseline file for row count comparison'
    )
    parser.add_argument(
        '--strict',
        action='store_true',
        help='Treat warnings as errors'
    )

    args = parser.parse_args()

    exit_code = 0

    for filepath in args.files:
        result = validate_file(filepath, args.baseline, args.mode)

        # In strict mode, warnings become errors
        if args.strict and result['warnings']:
            result['passed'] = False
            result['errors'].extend(result['warnings'])

        print_report(filepath, result, args.mode)

        if not result['passed']:
            exit_code = 1

    sys.exit(exit_code)


if __name__ == '__main__':
    main()
