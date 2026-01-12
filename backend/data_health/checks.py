"""
Data Health Checks - Phase 1 Internal Validation

Three core checks that run without external API calls:

1. COMPLETENESS: All projects in transactions exist in project_units registry
2. PLAUSIBILITY: New sale count <= total_units (no overselling)
3. COVERAGE: Percentage of projects with known units per district

Usage:
    from data_health.checks import run_all_checks, check_completeness

    # Run all checks
    report = run_all_checks()

    # Run individual check
    completeness = check_completeness()
"""

import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field, asdict
from enum import Enum

logger = logging.getLogger('data_health.checks')


# =============================================================================
# ISSUE TYPES
# =============================================================================

class IssueType(str, Enum):
    """Types of data health issues."""
    MISSING_PROJECT = 'missing_project'           # Project in transactions but not in registry
    UNITS_NULL = 'units_null'                     # Project exists but units unknown
    SOLD_GT_TOTAL = 'sold_gt_total'               # New sale count > total_units
    NEAR_TOTAL = 'near_total'                     # Sold >= 95% of total (warning)
    LOW_COVERAGE = 'low_coverage'                 # District has < 70% coverage


class Severity(str, Enum):
    """Issue severity levels."""
    ERROR = 'error'       # Must fix - data is wrong
    WARNING = 'warning'   # Should investigate
    INFO = 'info'         # For awareness


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class Issue:
    """A single data health issue."""
    issue_type: IssueType
    severity: Severity
    project_key: Optional[str] = None
    project_name: Optional[str] = None
    district: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)
    message: str = ''

    def to_dict(self) -> Dict[str, Any]:
        return {
            'issue_type': self.issue_type.value,
            'severity': self.severity.value,
            'project_key': self.project_key,
            'project_name': self.project_name,
            'district': self.district,
            'details': self.details,
            'message': self.message,
        }


@dataclass
class CheckResult:
    """Result of a single check."""
    check_name: str
    passed: bool
    issues: List[Issue] = field(default_factory=list)
    stats: Dict[str, Any] = field(default_factory=dict)

    @property
    def error_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == Severity.ERROR)

    @property
    def warning_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == Severity.WARNING)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'check_name': self.check_name,
            'passed': self.passed,
            'error_count': self.error_count,
            'warning_count': self.warning_count,
            'issues': [i.to_dict() for i in self.issues],
            'stats': self.stats,
        }


@dataclass
class HealthReport:
    """Complete health check report."""
    completeness: Optional[CheckResult] = None
    plausibility: Optional[CheckResult] = None
    coverage: Optional[CheckResult] = None

    @property
    def all_passed(self) -> bool:
        checks = [self.completeness, self.plausibility, self.coverage]
        return all(c.passed for c in checks if c is not None)

    @property
    def total_errors(self) -> int:
        checks = [self.completeness, self.plausibility, self.coverage]
        return sum(c.error_count for c in checks if c is not None)

    @property
    def total_warnings(self) -> int:
        checks = [self.completeness, self.plausibility, self.coverage]
        return sum(c.warning_count for c in checks if c is not None)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'all_passed': self.all_passed,
            'total_errors': self.total_errors,
            'total_warnings': self.total_warnings,
            'completeness': self.completeness.to_dict() if self.completeness else None,
            'plausibility': self.plausibility.to_dict() if self.plausibility else None,
            'coverage': self.coverage.to_dict() if self.coverage else None,
        }


# =============================================================================
# CHECK: COMPLETENESS
# =============================================================================

def check_completeness(db_session=None) -> CheckResult:
    """
    Check that all projects in transactions exist in project_units registry.

    Finds:
    - Projects in transactions table that have no entry in project_units
    - Projects in registry with units_status='unknown' (exist but no unit data)

    Args:
        db_session: SQLAlchemy session (uses Flask app context if None)

    Returns:
        CheckResult with issues for missing projects
    """
    from sqlalchemy import text
    from data_health.core import project_key, normalize_name
    from models import ProjectUnits

    if db_session is None:
        from models import db
        db_session = db.session

    issues = []
    stats = {
        'projects_in_transactions': 0,
        'projects_in_registry': 0,
        'missing_from_registry': 0,
        'units_unknown': 0,
    }

    # Get all distinct projects from transactions
    query = text("""
        SELECT
            UPPER(TRIM(project_name)) as project_name,
            district,
            COUNT(*) as total_tx,
            COUNT(CASE WHEN sale_type = 'New Sale' THEN 1 END) as new_sale_count,
            COUNT(CASE WHEN sale_type = 'Resale' THEN 1 END) as resale_count
        FROM transactions
        WHERE COALESCE(is_outlier, false) = false
          AND project_name IS NOT NULL
        GROUP BY UPPER(TRIM(project_name)), district
        ORDER BY COUNT(*) DESC
    """)

    rows = db_session.execute(query).fetchall()
    stats['projects_in_transactions'] = len(rows)

    # Check each project against registry
    registry_keys = {p.project_key for p in ProjectUnits.query.all()}
    stats['projects_in_registry'] = len(registry_keys)

    for row in rows:
        raw_name = row[0]
        district = row[1]
        total_tx = row[2]
        new_sale = row[3]
        resale = row[4]

        key = project_key(raw_name)

        if key not in registry_keys:
            stats['missing_from_registry'] += 1
            issues.append(Issue(
                issue_type=IssueType.MISSING_PROJECT,
                severity=Severity.ERROR if total_tx > 10 else Severity.WARNING,
                project_key=key,
                project_name=raw_name,
                district=district,
                details={
                    'total_tx': total_tx,
                    'new_sale': new_sale,
                    'resale': resale,
                },
                message=f"Project '{raw_name}' has {total_tx} transactions but is not in registry",
            ))

    # Check for projects with unknown units
    unknown_projects = ProjectUnits.query.filter_by(units_status='unknown').all()
    stats['units_unknown'] = len(unknown_projects)

    for proj in unknown_projects:
        issues.append(Issue(
            issue_type=IssueType.UNITS_NULL,
            severity=Severity.WARNING,
            project_key=proj.project_key,
            project_name=proj.project_name_canonical,
            district=proj.district,
            message=f"Project '{proj.project_name_canonical}' exists but has no unit count",
        ))

    # Determine pass/fail
    # Fail if any ERROR-severity missing projects
    error_count = sum(1 for i in issues if i.severity == Severity.ERROR)
    passed = error_count == 0

    return CheckResult(
        check_name='completeness',
        passed=passed,
        issues=issues,
        stats=stats,
    )


# =============================================================================
# CHECK: PLAUSIBILITY
# =============================================================================

def check_plausibility(db_session=None) -> CheckResult:
    """
    Check that new sale counts don't exceed total units.

    Finds:
    - CONFLICT: Projects where new_sale_count > total_units (impossible)
    - WARNING: Projects where new_sale_count >= 95% of total_units (suspicious)

    Args:
        db_session: SQLAlchemy session (uses Flask app context if None)

    Returns:
        CheckResult with issues for conflicts
    """
    from sqlalchemy import text
    from data_health.core import project_key
    from models import ProjectUnits

    if db_session is None:
        from models import db
        db_session = db.session

    issues = []
    stats = {
        'projects_checked': 0,
        'conflicts': 0,
        'near_total': 0,
        'healthy': 0,
    }

    # Get new sale counts per project from transactions
    query = text("""
        SELECT
            UPPER(TRIM(project_name)) as project_name,
            district,
            COUNT(*) as new_sale_count
        FROM transactions
        WHERE sale_type = 'New Sale'
          AND COALESCE(is_outlier, false) = false
          AND project_name IS NOT NULL
        GROUP BY UPPER(TRIM(project_name)), district
        ORDER BY COUNT(*) DESC
    """)

    rows = db_session.execute(query).fetchall()

    # Build lookup of registry projects with units
    registry = {}
    for proj in ProjectUnits.query.filter(ProjectUnits.total_units.isnot(None)).all():
        registry[proj.project_key] = proj

    for row in rows:
        raw_name = row[0]
        district = row[1]
        new_sale_count = row[2]

        key = project_key(raw_name)
        proj = registry.get(key)

        if not proj or not proj.total_units:
            continue  # Can't check without unit data

        stats['projects_checked'] += 1
        total_units = proj.total_units

        if new_sale_count > total_units:
            # CONFLICT: Sold more than total units
            stats['conflicts'] += 1
            issues.append(Issue(
                issue_type=IssueType.SOLD_GT_TOTAL,
                severity=Severity.ERROR,
                project_key=key,
                project_name=raw_name,
                district=district,
                details={
                    'new_sale_count': new_sale_count,
                    'total_units': total_units,
                    'over_by': new_sale_count - total_units,
                },
                message=f"CONFLICT: '{raw_name}' sold {new_sale_count} but only has {total_units} units (+{new_sale_count - total_units})",
            ))
        elif new_sale_count >= total_units * 0.95:
            # WARNING: Near total
            stats['near_total'] += 1
            pct = round(100 * new_sale_count / total_units, 1)
            issues.append(Issue(
                issue_type=IssueType.NEAR_TOTAL,
                severity=Severity.WARNING,
                project_key=key,
                project_name=raw_name,
                district=district,
                details={
                    'new_sale_count': new_sale_count,
                    'total_units': total_units,
                    'percent_sold': pct,
                },
                message=f"WARNING: '{raw_name}' has sold {pct}% of units ({new_sale_count}/{total_units})",
            ))
        else:
            stats['healthy'] += 1

    passed = stats['conflicts'] == 0

    return CheckResult(
        check_name='plausibility',
        passed=passed,
        issues=issues,
        stats=stats,
    )


# =============================================================================
# CHECK: COVERAGE
# =============================================================================

def check_coverage(
    db_session=None,
    min_coverage_pct: float = 70.0,
) -> CheckResult:
    """
    Check unit data coverage by district.

    Flags districts where < min_coverage_pct of projects have unit data.

    Args:
        db_session: SQLAlchemy session
        min_coverage_pct: Minimum acceptable coverage percentage (default 70%)

    Returns:
        CheckResult with issues for low-coverage districts
    """
    from sqlalchemy import func
    from models import ProjectUnits
    from models.project_units import UNITS_STATUS_VERIFIED

    if db_session is None:
        from models import db
        db_session = db.session

    issues = []
    stats = {
        'districts_checked': 0,
        'districts_low_coverage': 0,
        'overall_coverage_pct': 0.0,
        'by_district': {},
    }

    # Get coverage by district
    # Total projects per district
    total_by_district = dict(
        db_session.query(
            ProjectUnits.district,
            func.count(ProjectUnits.id)
        ).filter(
            ProjectUnits.district.isnot(None)
        ).group_by(ProjectUnits.district).all()
    )

    # Projects with verified units per district
    verified_by_district = dict(
        db_session.query(
            ProjectUnits.district,
            func.count(ProjectUnits.id)
        ).filter(
            ProjectUnits.district.isnot(None),
            ProjectUnits.total_units.isnot(None),
            ProjectUnits.units_status == UNITS_STATUS_VERIFIED
        ).group_by(ProjectUnits.district).all()
    )

    total_projects = 0
    total_with_units = 0

    for district in sorted(total_by_district.keys()):
        total = total_by_district.get(district, 0)
        with_units = verified_by_district.get(district, 0)
        coverage_pct = round(100 * with_units / total, 1) if total > 0 else 0.0

        stats['districts_checked'] += 1
        stats['by_district'][district] = {
            'total': total,
            'with_units': with_units,
            'coverage_pct': coverage_pct,
        }

        total_projects += total
        total_with_units += with_units

        if coverage_pct < min_coverage_pct:
            stats['districts_low_coverage'] += 1
            issues.append(Issue(
                issue_type=IssueType.LOW_COVERAGE,
                severity=Severity.WARNING,
                district=district,
                details={
                    'total_projects': total,
                    'projects_with_units': with_units,
                    'coverage_pct': coverage_pct,
                    'threshold': min_coverage_pct,
                },
                message=f"District {district} has only {coverage_pct}% coverage ({with_units}/{total} projects)",
            ))

    # Overall coverage
    stats['overall_coverage_pct'] = round(
        100 * total_with_units / total_projects, 1
    ) if total_projects > 0 else 0.0

    # Pass if no districts below threshold
    passed = stats['districts_low_coverage'] == 0

    return CheckResult(
        check_name='coverage',
        passed=passed,
        issues=issues,
        stats=stats,
    )


# =============================================================================
# ORCHESTRATOR
# =============================================================================

def run_all_checks(db_session=None) -> HealthReport:
    """
    Run all Phase 1 data health checks.

    Args:
        db_session: SQLAlchemy session (optional)

    Returns:
        HealthReport with results from all checks
    """
    logger.info("Running data health checks...")

    report = HealthReport()

    # Run completeness check
    logger.info("  [1/3] Checking completeness...")
    report.completeness = check_completeness(db_session)
    logger.info(f"        {report.completeness.error_count} errors, {report.completeness.warning_count} warnings")

    # Run plausibility check
    logger.info("  [2/3] Checking plausibility...")
    report.plausibility = check_plausibility(db_session)
    logger.info(f"        {report.plausibility.error_count} errors, {report.plausibility.warning_count} warnings")

    # Run coverage check
    logger.info("  [3/3] Checking coverage...")
    report.coverage = check_coverage(db_session)
    logger.info(f"        {report.coverage.error_count} errors, {report.coverage.warning_count} warnings")

    logger.info(f"Health check complete. Total: {report.total_errors} errors, {report.total_warnings} warnings")

    return report


# =============================================================================
# PRINTING UTILITIES
# =============================================================================

def print_report(report: HealthReport, verbose: bool = False) -> None:
    """
    Print a human-readable health report to stdout.

    Args:
        report: HealthReport to print
        verbose: If True, show all issues; if False, show top issues only
    """
    print("=" * 80)
    print("DATA HEALTH REPORT")
    print("=" * 80)

    status = "✓ PASSED" if report.all_passed else "✗ FAILED"
    print(f"\nOverall: {status}")
    print(f"  Errors:   {report.total_errors}")
    print(f"  Warnings: {report.total_warnings}")

    # Completeness
    if report.completeness:
        c = report.completeness
        print(f"\n{'─' * 80}")
        print(f"COMPLETENESS: {'✓ PASSED' if c.passed else '✗ FAILED'}")
        print(f"  Projects in transactions: {c.stats.get('projects_in_transactions', 0):,}")
        print(f"  Projects in registry:     {c.stats.get('projects_in_registry', 0):,}")
        print(f"  Missing from registry:    {c.stats.get('missing_from_registry', 0):,}")
        print(f"  Units unknown:            {c.stats.get('units_unknown', 0):,}")

        if c.issues and (verbose or c.error_count > 0):
            errors = [i for i in c.issues if i.severity == Severity.ERROR]
            if errors:
                print(f"\n  Missing projects (top {min(20, len(errors))}):")
                for issue in errors[:20]:
                    tx = issue.details.get('total_tx', 0)
                    print(f"    ✗ {issue.project_name:<40} {issue.district or '?':<6} {tx:>6} tx")

    # Plausibility
    if report.plausibility:
        p = report.plausibility
        print(f"\n{'─' * 80}")
        print(f"PLAUSIBILITY: {'✓ PASSED' if p.passed else '✗ FAILED'}")
        print(f"  Projects checked: {p.stats.get('projects_checked', 0):,}")
        print(f"  Conflicts:        {p.stats.get('conflicts', 0):,}")
        print(f"  Near total:       {p.stats.get('near_total', 0):,}")
        print(f"  Healthy:          {p.stats.get('healthy', 0):,}")

        if p.issues:
            conflicts = [i for i in p.issues if i.issue_type == IssueType.SOLD_GT_TOTAL]
            if conflicts:
                print(f"\n  Conflicts (sold > total):")
                print(f"  {'Project':<40} {'District':<8} {'Units':>8} {'Sold':>8} {'Over':>8}")
                print(f"  {'-' * 72}")
                for issue in conflicts[:20]:
                    d = issue.details
                    print(f"  {issue.project_name[:39]:<40} {issue.district or '?':<8} {d['total_units']:>8} {d['new_sale_count']:>8} {d['over_by']:>+8}")

    # Coverage
    if report.coverage:
        cv = report.coverage
        print(f"\n{'─' * 80}")
        print(f"COVERAGE: {'✓ PASSED' if cv.passed else '✗ FAILED'}")
        print(f"  Overall coverage: {cv.stats.get('overall_coverage_pct', 0):.1f}%")
        print(f"  Districts checked: {cv.stats.get('districts_checked', 0)}")
        print(f"  Low coverage (<70%): {cv.stats.get('districts_low_coverage', 0)}")

        if cv.issues:
            print(f"\n  Districts below threshold:")
            print(f"  {'District':<10} {'Total':>8} {'With Units':>12} {'Coverage':>10}")
            print(f"  {'-' * 42}")
            for issue in sorted(cv.issues, key=lambda i: i.details.get('coverage_pct', 100)):
                d = issue.details
                print(f"  {issue.district:<10} {d['total_projects']:>8} {d['projects_with_units']:>12} {d['coverage_pct']:>9.1f}%")

    print("\n" + "=" * 80)
