"""
New Launch Data Service - 2026 Private Condo Launches

Data sources (in order of preference):
1. Excel/CSV import (source-of-truth) - see excel_loader.py
2. Seed data (fallback)

This module provides:
- Seed data loading
- GLS tender linking
- Utility functions for project matching
"""
import re
from datetime import datetime
from typing import Optional, Dict, List, Any, Tuple

# Import from gls_scraper for reuse of region/planning_area logic
from services.gls_scraper import (
    get_region_from_planning_area,
    geocode_location,
    PLANNING_AREA_TO_REGION,
)


# =============================================================================
# CONFIGURATION
# =============================================================================

# Discrepancy tolerance thresholds (for cross-validation)
TOLERANCE = {
    'total_units': 5,      # +/- 5 units
    'indicative_psf': 50,  # +/- $50
}


# =============================================================================
# DISTRICT TO MARKET SEGMENT MAPPING
# =============================================================================

DISTRICT_TO_SEGMENT = {
    # CCR - Core Central Region
    '01': 'CCR', '02': 'CCR', '06': 'CCR', '07': 'CCR',
    '09': 'CCR', '10': 'CCR', '11': 'CCR',
    # RCR - Rest of Central Region
    '03': 'RCR', '04': 'RCR', '05': 'RCR', '08': 'RCR',
    '12': 'RCR', '13': 'RCR', '14': 'RCR', '15': 'RCR',
    '20': 'RCR', '21': 'RCR',
    # OCR - Outside Central Region
    '16': 'OCR', '17': 'OCR', '18': 'OCR', '19': 'OCR',
    '22': 'OCR', '23': 'OCR', '24': 'OCR', '25': 'OCR',
    '26': 'OCR', '27': 'OCR', '28': 'OCR',
}


def get_market_segment_from_district(district: str) -> Optional[str]:
    """Get market segment (CCR/RCR/OCR) from district code."""
    if not district:
        return None
    d = district.upper().replace('D', '').zfill(2)
    return DISTRICT_TO_SEGMENT.get(d)


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def normalize_project_name(name: str) -> str:
    """
    Normalize project name for matching.

    Handles variations like:
    - "AMO Residence" vs "Amo Residence" vs "AMO RESIDENCE"
    - "The Botany at Dairy Farm" vs "Botany @ Dairy Farm"
    - "CanningHill Piers" vs "Canning Hill Piers"
    """
    if not name:
        return ""
    normalized = name.lower().strip()
    # Remove common suffixes/prefixes
    normalized = re.sub(r'\b(the|condo|condominium|residences|residence|at|@)\b', ' ', normalized)
    # Normalize spacing
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    # Remove punctuation
    normalized = re.sub(r'[^\w\s]', '', normalized)
    return normalized


def fuzzy_match_score(name_a: str, name_b: str) -> float:
    """
    Calculate fuzzy match score between two project names.
    Returns score from 0.0 to 1.0 (1.0 = exact match).

    Uses token-based matching for better results with name variations.
    """
    if not name_a or not name_b:
        return 0.0

    # Exact match
    if name_a == name_b:
        return 1.0

    # Token-based matching
    tokens_a = set(name_a.split())
    tokens_b = set(name_b.split())

    if not tokens_a or not tokens_b:
        return 0.0

    # Jaccard similarity
    intersection = len(tokens_a & tokens_b)
    union = len(tokens_a | tokens_b)
    jaccard = intersection / union if union > 0 else 0

    # Also check if one contains most of the other (for partial matches)
    containment_a = intersection / len(tokens_a) if tokens_a else 0
    containment_b = intersection / len(tokens_b) if tokens_b else 0
    containment = max(containment_a, containment_b)

    # Combined score (weight towards containment for partial matches)
    return max(jaccard, containment * 0.9)


def match_projects(projects_a: List[Dict], projects_b: List[Dict], threshold: float = 0.6) -> List[Tuple[Dict, Dict]]:
    """
    Match projects from two sources using fuzzy name matching.

    Args:
        projects_a: First list of projects
        projects_b: Second list of projects
        threshold: Minimum similarity score to consider a match (0.0-1.0)
    """
    matches = []
    used_b = set()

    for a in projects_a:
        name_a = normalize_project_name(a.get('project_name', ''))
        if not name_a:
            continue

        best_match = None
        best_score = 0.0

        for i, b in enumerate(projects_b):
            if i in used_b:
                continue

            name_b = normalize_project_name(b.get('project_name', ''))
            if not name_b:
                continue

            # Use fuzzy matching
            score = fuzzy_match_score(name_a, name_b)
            if score > best_score:
                best_match = (i, b)
                best_score = score

            # Early exit on exact match
            if score == 1.0:
                break

        if best_match and best_score >= threshold:
            matches.append((a, best_match[1]))
            used_b.add(best_match[0])

    return matches


# =============================================================================
# GLS TENDER LINKING
# =============================================================================

def link_to_gls_tenders(db_session) -> Dict[str, int]:
    """Link NewLaunch records to GLS tender records."""
    from models.new_launch import NewLaunch
    from models.gls_tender import GLSTender

    stats = {'linked': 0, 'already_linked': 0, 'no_match': 0}

    unlinked = db_session.query(NewLaunch).filter(
        NewLaunch.gls_tender_id.is_(None)
    ).all()

    print(f"  Found {len(unlinked)} unlinked new launches")

    for launch in unlinked:
        gls_tender = _find_matching_gls_tender(launch, db_session)

        if gls_tender:
            launch.gls_tender_id = gls_tender.id
            launch.land_bid_psf = float(gls_tender.psf_ppr) if gls_tender.psf_ppr else None
            stats['linked'] += 1
            print(f"    Linked: {launch.project_name} → {gls_tender.location_raw}")
        else:
            stats['no_match'] += 1

    stats['already_linked'] = db_session.query(NewLaunch).filter(
        NewLaunch.gls_tender_id.isnot(None)
    ).count()

    try:
        db_session.commit()
    except Exception as e:
        db_session.rollback()
        print(f"  Error committing GLS links: {e}")

    return stats


def _find_matching_gls_tender(launch, db_session):
    """Find matching GLS tender for a new launch."""
    from models.gls_tender import GLSTender

    if launch.planning_area and launch.developer:
        tender = db_session.query(GLSTender).filter(
            GLSTender.status == 'awarded',
            GLSTender.planning_area == launch.planning_area,
            GLSTender.successful_tenderer.ilike(f'%{launch.developer.split()[0]}%')
        ).first()
        if tender:
            return tender

    if launch.district:
        segment = get_market_segment_from_district(launch.district)
        if segment:
            tender = db_session.query(GLSTender).filter(
                GLSTender.status == 'awarded',
                GLSTender.market_segment == segment,
            )

            if launch.developer:
                tender = tender.filter(
                    GLSTender.successful_tenderer.ilike(f'%{launch.developer.split()[0]}%')
                )

            tender = tender.first()
            if tender:
                return tender

    return None


# =============================================================================
# SEED DATA - Known 2026 New Launches (Fallback)
# =============================================================================

SEED_DATA_2026 = [
    {
        'project_name': 'AMO Residence',
        'developer': 'UOL Group',
        'district': 'D20',
        'planning_area': 'Ang Mo Kio',
        'market_segment': 'OCR',
        'total_units': 372,
        'indicative_psf_low': 2400,
        'indicative_psf_high': 2600,
        'tenure': '99-year',
    },
    {
        'project_name': 'Tembusu Grand',
        'developer': 'CDL & MCL Land',
        'district': 'D15',
        'planning_area': 'Marine Parade',
        'market_segment': 'RCR',
        'total_units': 638,
        'indicative_psf_low': 2400,
        'indicative_psf_high': 2500,
        'tenure': '99-year',
    },
    {
        'project_name': 'Grand Dunman',
        'developer': 'SingHaiyi Group',
        'district': 'D15',
        'planning_area': 'Marine Parade',
        'market_segment': 'RCR',
        'total_units': 1008,
        'indicative_psf_low': 2400,
        'indicative_psf_high': 2500,
        'tenure': '99-year',
    },
    {
        'project_name': 'CanningHill Piers',
        'developer': 'CDL & CapitaLand',
        'district': 'D06',
        'planning_area': 'River Valley',
        'market_segment': 'CCR',
        'total_units': 696,
        'indicative_psf_low': 2800,
        'indicative_psf_high': 3500,
        'tenure': '99-year',
    },
    {
        'project_name': 'The Botany at Dairy Farm',
        'developer': 'Sim Lian Group',
        'district': 'D23',
        'planning_area': 'Bukit Panjang',
        'market_segment': 'OCR',
        'total_units': 386,
        'indicative_psf_low': 2000,
        'indicative_psf_high': 2100,
        'tenure': '99-year',
    },
    {
        'project_name': 'Blossoms By The Park',
        'developer': 'EL Development',
        'district': 'D05',
        'planning_area': 'Buona Vista',
        'market_segment': 'RCR',
        'total_units': 275,
        'indicative_psf_low': 2200,
        'indicative_psf_high': 2400,
        'tenure': '99-year',
    },
    {
        'project_name': 'Watten House',
        'developer': 'UOL Group & Singapore Land',
        'district': 'D11',
        'planning_area': 'Bukit Timah',
        'market_segment': 'CCR',
        'total_units': 180,
        'indicative_psf_low': 3000,
        'indicative_psf_high': 3500,
        'tenure': 'Freehold',
    },
]


def seed_new_launches(db_session=None, reset: bool = False) -> Dict[str, Any]:
    """Seed the database with known 2026 new launch projects."""
    from models.new_launch import NewLaunch
    from models.database import db

    if db_session is None:
        db_session = db.session

    stats = {
        'existing': 0,
        'inserted': 0,
        'skipped': 0,
        'errors': [],
    }

    print(f"\n{'='*60}")
    print("Seeding New Launch Data (2026)")
    print(f"{'='*60}\n")

    if reset:
        deleted = db_session.query(NewLaunch).filter(NewLaunch.launch_year == 2026).delete()
        db_session.commit()
        print(f"Deleted {deleted} existing 2026 records")

    existing_names = {
        r[0].lower() for r in
        db_session.query(NewLaunch.project_name).filter(NewLaunch.launch_year == 2026).all()
    }
    stats['existing'] = len(existing_names)

    for project_data in SEED_DATA_2026:
        try:
            project_name = project_data['project_name']

            if project_name.lower() in existing_names:
                stats['skipped'] += 1
                print(f"  Skipped (exists): {project_name}")
                continue

            new_launch = NewLaunch(
                project_name=project_name,
                developer=project_data.get('developer'),
                district=project_data.get('district'),
                planning_area=project_data.get('planning_area'),
                market_segment=project_data.get('market_segment'),
                total_units=project_data.get('total_units'),
                indicative_psf_low=project_data.get('indicative_psf_low'),
                indicative_psf_high=project_data.get('indicative_psf_high'),
                tenure=project_data.get('tenure'),
                launch_year=2026,
                property_type='Condominium',
                data_source='Seed data',
                data_confidence='medium',
                source_urls={'seed': 'Manual seed data'},
                needs_review=False,
                last_scraped=datetime.utcnow(),
            )

            db_session.add(new_launch)
            db_session.commit()
            stats['inserted'] += 1
            print(f"  Inserted: {project_name}")

        except Exception as e:
            db_session.rollback()
            stats['errors'].append(f"{project_name}: {str(e)}")
            print(f"  Error: {project_name} - {e}")

    print(f"\n{'='*60}")
    print("Seed Complete")
    print(f"{'='*60}")
    print(f"Already existed: {stats['existing']}")
    print(f"Inserted: {stats['inserted']}")
    print(f"Skipped: {stats['skipped']}")

    return stats
