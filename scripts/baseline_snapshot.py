#!/usr/bin/env python3
"""
Baseline Snapshot: Create/update baseline copies for CI comparison.

Usage:
    python3 scripts/baseline_snapshot.py \\
        --src backend/data/new_launch_units.csv \\
        --out .ci/baselines/new_launch_units.csv

This copies the source file exactly (no transformations) to create a
baseline snapshot that CI can compare against.

When to update baseline:
    - After intentionally adding/removing rows from the source CSV
    - Include the baseline update in the same PR as the source change
"""

import argparse
import shutil
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(
        description='Create baseline snapshot for CI comparison',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument(
        '--src',
        required=True,
        help='Source CSV file to snapshot'
    )
    parser.add_argument(
        '--out',
        required=True,
        help='Output baseline file path'
    )

    args = parser.parse_args()

    src_path = Path(args.src)
    out_path = Path(args.out)

    if not src_path.exists():
        print(f"Error: Source file not found: {src_path}")
        return 1

    # Create output directory if needed
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Copy file exactly
    shutil.copy2(src_path, out_path)

    # Count rows (excluding header)
    with open(out_path, 'r') as f:
        row_count = sum(1 for _ in f) - 1

    print(f"Baseline created: {out_path}")
    print(f"Row count: {row_count}")
    print()
    print("Next steps:")
    print(f"  git add {out_path}")
    print("  Include this in your PR with the source CSV changes")

    return 0


if __name__ == '__main__':
    exit(main())
