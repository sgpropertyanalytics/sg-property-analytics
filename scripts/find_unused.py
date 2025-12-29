#!/usr/bin/env python3
"""
Deprecation Sweeper - Find Unused Code Candidates

Scans the codebase for potentially unused code without auto-deleting.
Generates evidence-based reports for manual review.

Usage:
    python scripts/find_unused.py
    python scripts/find_unused.py --verbose
    python scripts/find_unused.py --output report.txt

Output Categories:
    - Versioned Files: Files with _v2, _old, _deprecated patterns
    - Unimported Python: .py files not imported anywhere
    - Route Patterns: Endpoints with v1/v2 versioning
"""

import os
import re
import subprocess
import argparse
from pathlib import Path
from typing import List, Dict, Set, Tuple


def find_versioned_files(base_path: str = '.') -> List[Dict]:
    """Find files with versioning patterns in their names."""
    patterns = ['_v2', '_v3', '_old', '_deprecated', '_backup', '_legacy', '.bak', '_copy']
    results = []

    for root, dirs, files in os.walk(base_path):
        # Skip common non-source directories
        dirs[:] = [d for d in dirs if d not in ['node_modules', '__pycache__', '.git', 'venv', 'dist', 'build']]

        for f in files:
            lower_f = f.lower()
            for pattern in patterns:
                if pattern in lower_f:
                    full_path = os.path.join(root, f)
                    results.append({
                        'path': full_path,
                        'pattern': pattern,
                        'type': 'versioned_file'
                    })
                    break

    return results


def find_unimported_python_files(backend_path: str = 'backend') -> List[Dict]:
    """Find .py files that are never imported anywhere."""
    backend_dir = Path(backend_path)
    if not backend_dir.exists():
        return []

    all_py = list(backend_dir.rglob('*.py'))
    unimported = []

    # Get all import patterns to search for
    for py_file in all_py:
        # Skip special files
        if py_file.name.startswith('__'):
            continue
        if 'test' in str(py_file).lower():
            continue
        if 'migration' in str(py_file).lower():
            continue

        module_name = py_file.stem
        relative_path = py_file.relative_to(backend_dir)

        # Check various import patterns
        patterns = [
            f'import {module_name}',
            f'from {module_name}',
            f'from.*{module_name}',
        ]

        # Also check for path-based imports
        parts = list(relative_path.parts[:-1])  # Exclude filename
        if parts:
            module_path = '.'.join(parts + [module_name])
            patterns.append(f'from {module_path}')
            patterns.append(f'import {module_path}')

        found = False
        for pattern in patterns:
            result = subprocess.run(
                ['grep', '-r', '-l', pattern, backend_path],
                capture_output=True, text=True
            )
            if result.stdout.strip():
                # Found import, but make sure it's not just importing itself
                matching_files = result.stdout.strip().split('\n')
                other_files = [f for f in matching_files if not f.endswith(str(py_file))]
                if other_files:
                    found = True
                    break

        if not found:
            unimported.append({
                'path': str(py_file),
                'module': module_name,
                'type': 'unimported_python',
                'lines': count_lines(py_file)
            })

    return unimported


def find_unused_frontend_components(frontend_path: str = 'frontend/src') -> List[Dict]:
    """Find React components that are never imported."""
    frontend_dir = Path(frontend_path)
    if not frontend_dir.exists():
        return []

    # Find all .jsx and .tsx files
    component_files = list(frontend_dir.rglob('*.jsx')) + list(frontend_dir.rglob('*.tsx'))
    unused = []

    for comp_file in component_files:
        # Skip test files and index files
        if 'test' in str(comp_file).lower():
            continue
        if comp_file.name in ['index.js', 'index.jsx', 'index.ts', 'index.tsx']:
            continue

        component_name = comp_file.stem

        # Check if this component is imported anywhere
        patterns = [
            f"import.*{component_name}",
            f"from.*{component_name}",
            f"<{component_name}",  # JSX usage
        ]

        found = False
        for pattern in patterns:
            result = subprocess.run(
                ['grep', '-r', '-l', '-E', pattern, frontend_path],
                capture_output=True, text=True
            )
            if result.stdout.strip():
                matching_files = result.stdout.strip().split('\n')
                other_files = [f for f in matching_files if not f.endswith(str(comp_file))]
                if other_files:
                    found = True
                    break

        if not found:
            unused.append({
                'path': str(comp_file),
                'component': component_name,
                'type': 'unused_component',
                'lines': count_lines(comp_file)
            })

    return unused


def find_route_version_patterns(backend_path: str = 'backend/routes') -> List[Dict]:
    """Find route files with versioning patterns."""
    routes_dir = Path(backend_path)
    if not routes_dir.exists():
        return []

    results = []

    # Search for routes with version numbers
    result = subprocess.run(
        ['grep', '-rn', '-E', '@.*route.*v[0-9]|/v[0-9]/|_v[0-9]', str(routes_dir)],
        capture_output=True, text=True
    )

    if result.stdout:
        for line in result.stdout.strip().split('\n'):
            if line:
                parts = line.split(':', 2)
                if len(parts) >= 3:
                    results.append({
                        'file': parts[0],
                        'line': parts[1],
                        'content': parts[2].strip(),
                        'type': 'versioned_route'
                    })

    return results


def count_lines(file_path: Path) -> int:
    """Count lines in a file."""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return sum(1 for _ in f)
    except:
        return 0


def generate_report(findings: Dict[str, List], verbose: bool = False) -> str:
    """Generate a formatted report of findings."""
    lines = []
    lines.append("=" * 60)
    lines.append("DEPRECATION SWEEPER REPORT")
    lines.append("=" * 60)
    lines.append("")

    total_candidates = 0
    total_lines = 0

    # Versioned files
    versioned = findings.get('versioned_files', [])
    lines.append(f"## VERSIONED FILES ({len(versioned)} found)")
    lines.append("-" * 40)
    if versioned:
        for item in versioned:
            lines.append(f"  {item['path']}")
            if verbose:
                lines.append(f"    Pattern: {item['pattern']}")
        total_candidates += len(versioned)
    else:
        lines.append("  (none found)")
    lines.append("")

    # Unimported Python
    unimported = findings.get('unimported_python', [])
    lines.append(f"## POTENTIALLY UNIMPORTED PYTHON FILES ({len(unimported)} found)")
    lines.append("-" * 40)
    if unimported:
        for item in unimported:
            lines.append(f"  {item['path']} ({item['lines']} lines)")
            total_lines += item['lines']
        total_candidates += len(unimported)
    else:
        lines.append("  (none found)")
    lines.append("")

    # Unused components
    unused_components = findings.get('unused_components', [])
    lines.append(f"## POTENTIALLY UNUSED REACT COMPONENTS ({len(unused_components)} found)")
    lines.append("-" * 40)
    if unused_components:
        for item in unused_components:
            lines.append(f"  {item['path']} ({item['lines']} lines)")
            total_lines += item['lines']
        total_candidates += len(unused_components)
    else:
        lines.append("  (none found)")
    lines.append("")

    # Route patterns
    routes = findings.get('versioned_routes', [])
    lines.append(f"## VERSIONED ROUTE PATTERNS ({len(routes)} found)")
    lines.append("-" * 40)
    if routes:
        for item in routes:
            lines.append(f"  {item['file']}:{item['line']}")
            if verbose:
                lines.append(f"    {item['content'][:80]}...")
    else:
        lines.append("  (none found)")
    lines.append("")

    # Summary
    lines.append("=" * 60)
    lines.append("SUMMARY")
    lines.append("=" * 60)
    lines.append(f"Total candidates for review: {total_candidates}")
    lines.append(f"Estimated lines to review: {total_lines}")
    lines.append("")
    lines.append("NOTE: This is a report only. No files were modified.")
    lines.append("Review each item manually before deleting.")
    lines.append("See DEPRECATED.md for the official deprecation inventory.")

    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description='Find unused code candidates')
    parser.add_argument('--verbose', '-v', action='store_true', help='Show detailed output')
    parser.add_argument('--output', '-o', type=str, help='Write report to file')
    parser.add_argument('--path', '-p', type=str, default='.', help='Base path to scan')
    args = parser.parse_args()

    # Change to base path
    base_path = Path(args.path)
    if not base_path.exists():
        print(f"Error: Path {base_path} does not exist")
        return 1

    os.chdir(base_path)

    print("Scanning codebase for unused code candidates...")
    print("")

    findings = {
        'versioned_files': find_versioned_files('.'),
        'unimported_python': find_unimported_python_files('backend'),
        'unused_components': find_unused_frontend_components('frontend/src'),
        'versioned_routes': find_route_version_patterns('backend/routes'),
    }

    report = generate_report(findings, verbose=args.verbose)

    if args.output:
        with open(args.output, 'w') as f:
            f.write(report)
        print(f"Report written to {args.output}")
    else:
        print(report)

    return 0


if __name__ == '__main__':
    exit(main())
