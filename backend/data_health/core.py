"""
Data Health Core - Project Name Normalization and Registry Operations

This module handles:
1. Project name canonicalization (normalize_name)
2. Stable key generation for lookups (project_key)
3. Registry CRUD operations (get_project, upsert_project)

Name Normalization Rules:
- Uppercase everything
- Normalize whitespace (collapse multiple spaces)
- Convert "@" to " AT "
- Remove leading "THE "
- Remove punctuation (except spaces)
- Collapse resulting whitespace

Examples:
    "THE SAIL @ MARINA BAY" -> "SAIL AT MARINA BAY" -> "sail-at-marina-bay"
    "D'LEEDON"              -> "DLEEDON"            -> "dleedon"
    "8@BT"                  -> "8 AT BT"            -> "8-at-bt"
    "  NORMANTON   PARK  "  -> "NORMANTON PARK"     -> "normanton-park"
"""

import re
import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger('data_health.core')


# =============================================================================
# NAME NORMALIZATION
# =============================================================================

def normalize_name(raw: str) -> str:
    """
    Canonicalize project name to a normalized, human-readable form.

    Transformations applied:
    1. Uppercase
    2. Collapse whitespace
    3. "@" -> " AT "
    4. Remove leading "THE "
    5. Remove punctuation (keeps alphanumeric + spaces)
    6. Final whitespace collapse

    Args:
        raw: Original project name (any casing, with punctuation)

    Returns:
        Normalized name (uppercase, no punctuation, human-readable)

    Examples:
        >>> normalize_name("THE SAIL @ MARINA BAY")
        'SAIL AT MARINA BAY'
        >>> normalize_name("D'LEEDON")
        'DLEEDON'
        >>> normalize_name("8@BT")
        '8 AT BT'
    """
    if not raw:
        return ''

    s = raw.upper().strip()

    # Collapse whitespace
    s = re.sub(r'\s+', ' ', s)

    # @ -> AT (with spaces)
    s = re.sub(r'@', ' AT ', s)

    # Remove leading "THE " (common in Singapore condo names)
    s = re.sub(r'^THE\s+', '', s)

    # Remove punctuation (keep alphanumeric and spaces)
    # This handles: apostrophes (D'LEEDON), hyphens, periods, etc.
    s = re.sub(r'[^\w\s]', '', s)

    # Final whitespace collapse and strip
    s = re.sub(r'\s+', ' ', s).strip()

    return s


def slugify(text: str) -> str:
    """
    Convert text to URL-safe slug (lowercase, hyphens instead of spaces).

    Args:
        text: Input text (typically already normalized)

    Returns:
        Lowercase slug with hyphens

    Examples:
        >>> slugify("SAIL AT MARINA BAY")
        'sail-at-marina-bay'
        >>> slugify("DLEEDON")
        'dleedon'
    """
    if not text:
        return ''

    # Lowercase
    s = text.lower()

    # Replace spaces with hyphens
    s = re.sub(r'\s+', '-', s)

    # Remove any remaining non-alphanumeric except hyphens
    s = re.sub(r'[^a-z0-9-]', '', s)

    # Collapse multiple hyphens
    s = re.sub(r'-+', '-', s)

    # Strip leading/trailing hyphens
    s = s.strip('-')

    return s


def project_key(raw: str) -> str:
    """
    Generate stable lookup key for a project name.

    This is the canonical identifier used in the project_units table.
    Two project names that should match will produce the same key.

    Args:
        raw: Original project name (any format)

    Returns:
        Slugified key for database lookup

    Examples:
        >>> project_key("THE SAIL @ MARINA BAY")
        'sail-at-marina-bay'
        >>> project_key("The Sail at Marina Bay")
        'sail-at-marina-bay'
        >>> project_key("D'LEEDON")
        'dleedon'
    """
    return slugify(normalize_name(raw))


# =============================================================================
# REGISTRY OPERATIONS
# =============================================================================

def get_project(key: str) -> Optional[Dict[str, Any]]:
    """
    Look up a project by its normalized key.

    Args:
        key: Project key (slugified, e.g., 'sail-at-marina-bay')

    Returns:
        Project dict or None if not found
    """
    from models import ProjectUnits

    project = ProjectUnits.query.filter_by(project_key=key).first()
    return project.to_dict() if project else None


def get_project_by_raw_name(raw_name: str) -> Optional[Dict[str, Any]]:
    """
    Look up a project by its raw name (normalizes internally).

    Args:
        raw_name: Original project name (any format)

    Returns:
        Project dict or None if not found
    """
    key = project_key(raw_name)
    return get_project(key)


def upsert_project(
    raw_name: str,
    district: Optional[str] = None,
    total_units: Optional[int] = None,
    units_status: Optional[str] = None,
    developer: Optional[str] = None,
    tenure: Optional[str] = None,
    top_year: Optional[int] = None,
    data_source: Optional[str] = None,
    confidence_score: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Insert or update a project in the registry.

    If project exists (by key), updates non-None fields.
    If project doesn't exist, creates new entry.

    Args:
        raw_name: Original project name
        district: District code (D01-D28)
        total_units: Total unit count (None if unknown)
        units_status: 'verified', 'unknown', or 'conflict'
        developer: Developer name
        tenure: Tenure type (Freehold, 99-year, etc.)
        top_year: TOP year
        data_source: Source of data (csv, scraper:edgeprop, etc.)
        confidence_score: Confidence in unit count (0.0-1.0)

    Returns:
        Dict with 'action' ('created' or 'updated') and 'project' data
    """
    from models import ProjectUnits, db
    from models.project_units import UNITS_STATUS_UNKNOWN

    key = project_key(raw_name)
    canonical = normalize_name(raw_name)

    existing = ProjectUnits.query.filter_by(project_key=key).first()

    if existing:
        # Update existing - only update non-None fields
        if district is not None:
            existing.district = district
        if total_units is not None:
            existing.total_units = total_units
        if units_status is not None:
            existing.units_status = units_status
        if developer is not None:
            existing.developer = developer
        if tenure is not None:
            existing.tenure = tenure
        if top_year is not None:
            existing.top_year = top_year
        if data_source is not None:
            existing.data_source = data_source
        if confidence_score is not None:
            existing.confidence_score = confidence_score

        db.session.commit()
        return {'action': 'updated', 'project': existing.to_dict()}

    else:
        # Create new
        new_project = ProjectUnits(
            project_key=key,
            project_name_raw=raw_name,
            project_name_canonical=canonical,
            district=district,
            total_units=total_units,
            units_status=units_status or UNITS_STATUS_UNKNOWN,
            developer=developer,
            tenure=tenure,
            top_year=top_year,
            data_source=data_source,
            confidence_score=confidence_score,
        )
        db.session.add(new_project)
        db.session.commit()
        return {'action': 'created', 'project': new_project.to_dict()}


def get_district_coverage(district: str) -> Dict[str, Any]:
    """
    Get coverage statistics for a district.

    Args:
        district: District code (e.g., 'D10')

    Returns:
        Dict with total_projects, projects_with_units, coverage_pct
    """
    from models import ProjectUnits
    from models.project_units import UNITS_STATUS_VERIFIED

    total = ProjectUnits.query.filter_by(district=district).count()
    with_units = ProjectUnits.query.filter(
        ProjectUnits.district == district,
        ProjectUnits.total_units.isnot(None),
        ProjectUnits.units_status == UNITS_STATUS_VERIFIED
    ).count()

    return {
        'district': district,
        'total_projects': total,
        'projects_with_units': with_units,
        'coverage_pct': round(100 * with_units / total, 1) if total > 0 else 0.0,
    }


def get_all_projects(
    district: Optional[str] = None,
    units_status: Optional[str] = None,
    needs_review: Optional[bool] = None,
    limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Query projects with optional filters.

    Args:
        district: Filter by district
        units_status: Filter by status ('verified', 'unknown', 'conflict')
        needs_review: Filter by review flag
        limit: Max results to return

    Returns:
        List of project dicts
    """
    from models import ProjectUnits

    query = ProjectUnits.query

    if district:
        query = query.filter_by(district=district)
    if units_status:
        query = query.filter_by(units_status=units_status)
    if needs_review is not None:
        query = query.filter_by(needs_review=needs_review)

    query = query.order_by(ProjectUnits.project_name_canonical)

    if limit:
        query = query.limit(limit)

    return [p.to_dict() for p in query.all()]


# =============================================================================
# BATCH OPERATIONS
# =============================================================================

def bulk_upsert_from_csv(csv_path: str, dry_run: bool = False) -> Dict[str, Any]:
    """
    Bulk import projects from CSV file.

    Expected CSV columns:
    - project_name (required)
    - total_units (optional)
    - district (optional)
    - developer (optional)
    - tenure (optional)
    - top (optional, maps to top_year)
    - source (optional, maps to data_source)

    Args:
        csv_path: Path to CSV file
        dry_run: If True, don't commit changes

    Returns:
        Dict with counts: created, updated, skipped, errors
    """
    import csv
    from models import db
    from models.project_units import UNITS_STATUS_VERIFIED, UNITS_STATUS_UNKNOWN

    stats = {'created': 0, 'updated': 0, 'skipped': 0, 'errors': []}

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)

        for row_num, row in enumerate(reader, start=2):  # Start at 2 (header is row 1)
            try:
                raw_name = row.get('project_name', '').strip()
                if not raw_name:
                    stats['skipped'] += 1
                    continue

                total_units = None
                if row.get('total_units'):
                    try:
                        total_units = int(row['total_units'])
                    except ValueError:
                        pass

                result = upsert_project(
                    raw_name=raw_name,
                    district=row.get('district') or None,
                    total_units=total_units,
                    units_status=UNITS_STATUS_VERIFIED if total_units else UNITS_STATUS_UNKNOWN,
                    developer=row.get('developer') or None,
                    tenure=row.get('tenure') or None,
                    top_year=int(row['top']) if row.get('top') else None,
                    data_source=row.get('source') or 'csv',
                    confidence_score=0.9 if total_units else None,
                )

                if result['action'] == 'created':
                    stats['created'] += 1
                else:
                    stats['updated'] += 1

            except Exception as e:
                stats['errors'].append({
                    'row': row_num,
                    'name': row.get('project_name', ''),
                    'error': str(e),
                })

    if dry_run:
        db.session.rollback()
        logger.info(f"Dry run complete. Would have created {stats['created']}, updated {stats['updated']}")
    else:
        db.session.commit()
        logger.info(f"Import complete. Created {stats['created']}, updated {stats['updated']}")

    return stats


def bulk_upsert_from_transactions(db_session, dry_run: bool = False) -> Dict[str, Any]:
    """
    Discover projects from transactions table and add to registry.

    Only adds projects that don't already exist in the registry.
    New projects are added with units_status='unknown'.

    Args:
        db_session: SQLAlchemy session
        dry_run: If True, don't commit changes

    Returns:
        Dict with counts: created, skipped (already exists), errors
    """
    from sqlalchemy import text
    from models import ProjectUnits, db
    from models.project_units import UNITS_STATUS_UNKNOWN

    stats = {'created': 0, 'skipped': 0, 'errors': []}

    # Get all distinct projects from transactions
    query = text("""
        SELECT DISTINCT
            project_name,
            district
        FROM transactions
        WHERE COALESCE(is_outlier, false) = false
          AND project_name IS NOT NULL
        ORDER BY project_name
    """)

    rows = db_session.execute(query).fetchall()
    logger.info(f"Found {len(rows)} distinct projects in transactions")

    for row in rows:
        raw_name = row[0]
        district = row[1]

        try:
            key = project_key(raw_name)

            # Check if already exists
            existing = ProjectUnits.query.filter_by(project_key=key).first()
            if existing:
                stats['skipped'] += 1
                continue

            # Create new entry with unknown units
            canonical = normalize_name(raw_name)
            new_project = ProjectUnits(
                project_key=key,
                project_name_raw=raw_name,
                project_name_canonical=canonical,
                district=district,
                total_units=None,
                units_status=UNITS_STATUS_UNKNOWN,
                data_source='transactions',
            )
            db.session.add(new_project)
            stats['created'] += 1

        except Exception as e:
            stats['errors'].append({
                'name': raw_name,
                'error': str(e),
            })

    if dry_run:
        db.session.rollback()
        logger.info(f"Dry run complete. Would have created {stats['created']} projects")
    else:
        db.session.commit()
        logger.info(f"Discovery complete. Created {stats['created']} projects")

    return stats
