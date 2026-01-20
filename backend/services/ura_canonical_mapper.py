"""
URA Canonical Mapper - Transform URA API responses to DB schema

Maps URA Data Service API responses to the canonical transactions table schema.
Handles:
- Field name mapping (URA camelCase → DB snake_case)
- Type conversions (mmyy → date, typeOfSale → sale_type enum)
- Computed fields (psf, bedroom_count, floor_level, remaining_lease)
- Row hash for deduplication
- Unknown field preservation for schema drift safety

PRICE FIELD POLICY:
    We use `price` (gross transaction price) for all calculations, NOT `nettPrice`.
    - `price`: What the buyer actually pays (transaction price)
    - `nettPrice`: Price after deducting seller's stamp duty (optional, informational only)

    Rationale: Analytics should reflect actual buyer cost. nettPrice is stored
    separately for reference but never used for PSF or aggregations.

BACKFILL / REVISION STRATEGY:
    URA data can be revised retroactively. Our strategy:
    - Each sync re-fetches the last REVISION_WINDOW_MONTHS of data (default: 3 months)
    - Use row_hash-based upsert with ON CONFLICT DO UPDATE to catch revisions
    - Fields that can change: price, area_sqft, psf, floor_range, sale_type, district, nett_price
    - Historical data beyond the window is not re-synced unless explicit full refresh
    - Track inserted_rows vs updated_rows for monitoring

    This balances freshness vs. API load while allowing corrections.

Usage:
    from services.ura_canonical_mapper import URACanonicalMapper

    mapper = URACanonicalMapper()

    # Map single project with transactions
    for row in mapper.map_project(project_dict):
        print(row)  # Dict ready for DB insertion

    # Map all projects from API response
    all_rows = mapper.map_all_projects(projects_list)
"""

import json
import logging
import math
from datetime import date
from typing import Dict, List, Any, Optional, Iterator

from services.classifier import classify_bedroom_three_tier
from services.classifier_extended import (
    classify_floor_level,
    extract_lease_start_year,
    calculate_remaining_lease
)
from services.etl.fingerprint import compute_row_hash, normalize_floor_range
from constants import SALE_TYPE_NEW, SALE_TYPE_SUB, SALE_TYPE_RESALE

logger = logging.getLogger(__name__)

# Public API
__all__ = [
    'URACanonicalMapper',
    'NATURAL_KEY_FIELDS',
    'parse_contract_date',
    'format_contract_date',
    'map_ura_projects_to_rows',
    'get_canonical_mapper',
]


# =============================================================================
# Constants
# =============================================================================

# URA typeOfSale mapping: "1" = New Sale, "2" = Sub Sale, "3" = Resale
TYPE_OF_SALE_MAP = {
    "1": SALE_TYPE_NEW,
    "2": SALE_TYPE_SUB,
    "3": SALE_TYPE_RESALE,
}

# Area conversion: URA API returns area in square meters (sqm)
# Our DB stores area in square feet (sqft)
SQM_TO_SQFT = 10.7639

# Revision window: re-sync this many months on each run to catch URA corrections
# URA may revise data retroactively; 3 months covers typical revision lag
REVISION_WINDOW_MONTHS = 3

# =============================================================================
# Natural Key Fields for Transaction Identity
# =============================================================================
#
# These fields uniquely identify a transaction for deduplication and matching.
# Used by compute_row_hash() to generate row_hash for upserts.
#
# Canonicalization (handled by compute_row_hash in fingerprint.py):
# - area_sqft_int: Rounds area_sqft to integer (e.g., 699.66 → 700)
#   This absorbs tiny precision differences between CSV and API sources.
# - floor_range: Normalized to "XX-YY" format (e.g., "01 to 05" → "01-05")

NATURAL_KEY_FIELDS = [
    'project_name',
    'transaction_month',
    'price',
    'area_sqft_int',       # Canonical: area rounded to integer
    'floor_range',         # Normalized format (e.g., "11-15")
    'property_type',
    'district',
    'sale_type',
]

# Known URA API fields at project level
KNOWN_PROJECT_FIELDS = {
    'project', 'street', 'marketSegment', 'x', 'y', 'transaction'
}

# Known URA API fields at transaction level
KNOWN_TRANSACTION_FIELDS = {
    'contractDate', 'propertyType', 'district', 'tenure',
    'price', 'area', 'floorRange', 'typeOfSale', 'noOfUnits',
    'typeOfArea', 'nettPrice'
}


# =============================================================================
# Date Parsing
# =============================================================================

def parse_contract_date(mmyy: str) -> Optional[date]:
    """
    Parse URA's mmyy contract date format to Python date.

    URA format: "0125" = January 2025, "1224" = December 2024

    Args:
        mmyy: String in mmyy format (e.g., "0125", "1224")

    Returns:
        date object with day=1, or None if parsing fails

    Examples:
        >>> parse_contract_date("0125")
        date(2025, 1, 1)
        >>> parse_contract_date("1224")
        date(2024, 12, 1)
    """
    if not mmyy or not isinstance(mmyy, str):
        return None

    mmyy = mmyy.strip()
    if len(mmyy) != 4:
        logger.warning(f"Invalid contract date format: '{mmyy}' (expected 4 chars)")
        return None

    try:
        mm = int(mmyy[:2])
        yy = int(mmyy[2:])

        if not (1 <= mm <= 12):
            logger.warning(f"Invalid month in contract date: '{mmyy}' (month={mm})")
            return None

        # URA data covers ~5 years, so 20xx is safe assumption
        # Handle edge case: yy >= 50 could be 19xx but URA data is recent
        year = 2000 + yy

        return date(year, mm, 1)
    except (ValueError, TypeError) as e:
        logger.warning(f"Failed to parse contract date '{mmyy}': {e}")
        return None


def format_contract_date(transaction_date: date) -> str:
    """
    Format date back to URA's mmyy format (for storage/reference).

    Args:
        transaction_date: Python date object

    Returns:
        String in mmyy format (e.g., "0125")
    """
    return f"{transaction_date.month:02d}{transaction_date.year % 100:02d}"


# =============================================================================
# Field Parsing Helpers
# =============================================================================

def parse_float_safe(value: Any, field_name: str = "unknown") -> Optional[float]:
    """Safely parse a value to float, returning None on failure."""
    if value is None:
        return None
    try:
        result = float(value)
        # Check for NaN
        if result != result:  # NaN check
            return None
        return result
    except (ValueError, TypeError):
        logger.debug(f"Failed to parse {field_name} as float: '{value}'")
        return None


def parse_int_safe(value: Any, field_name: str = "unknown", default: int = 1) -> int:
    """Safely parse a value to int, returning default on failure."""
    if value is None:
        return default
    try:
        return int(float(value))  # Handle "1.0" strings
    except (ValueError, TypeError):
        logger.debug(f"Failed to parse {field_name} as int: '{value}'")
        return default


def normalize_district(district: str) -> str:
    """
    Normalize district to D01, D02, etc. format.

    URA API returns "01", "02", etc. We standardize to "D01", "D02".

    Args:
        district: District string from URA API (e.g., "01", "1", "D01")

    Returns:
        Normalized district string (e.g., "D01")
    """
    if not district:
        return ""

    district = str(district).strip()

    # Already in D0X format
    if district.upper().startswith('D'):
        num = district[1:]
        return f"D{int(num):02d}"

    # Just a number
    try:
        num = int(district)
        return f"D{num:02d}"
    except ValueError:
        logger.warning(f"Unable to normalize district: '{district}'")
        return district


def map_sale_type(type_of_sale: str) -> str:
    """
    Map URA typeOfSale code to canonical sale type.

    Args:
        type_of_sale: URA code ("1", "2", or "3")

    Returns:
        Canonical sale type string ("New Sale", "Sub Sale", "Resale")
    """
    return TYPE_OF_SALE_MAP.get(str(type_of_sale), SALE_TYPE_RESALE)


# =============================================================================
# URA Canonical Mapper
# =============================================================================

class URACanonicalMapper:
    """
    Maps URA API responses to canonical DB schema.

    Handles the transformation from URA's nested project/transaction structure
    to flat rows suitable for database insertion.

    Example:
        mapper = URACanonicalMapper()

        # URA API returns projects with nested transactions
        for project in api_response['Result']:
            for db_row in mapper.map_project(project):
                # db_row is ready for DB insertion
                insert_transaction(db_row)
    """

    def __init__(self, source: str = 'ura_api'):
        """
        Initialize mapper.

        Args:
            source: Source identifier for tracking data origin (default: 'ura_api')
        """
        self.source = source
        self._stats = {
            'projects_processed': 0,
            'transactions_processed': 0,
            'transactions_skipped': 0,
            'unknown_fields_preserved': 0,
            # Granular skip reasons for debugging
            'skip_missing_project': 0,
            'skip_invalid_date': 0,
            'skip_invalid_price': 0,
            'skip_invalid_area': 0,
            'skip_invalid_psf': 0,
            'skip_exception': 0,
            'outliers_flagged': 0,
        }

    def reset_stats(self) -> None:
        """Reset processing statistics."""
        for key in self._stats:
            self._stats[key] = 0

    def get_stats(self) -> Dict[str, int]:
        """Get processing statistics."""
        return dict(self._stats)

    def map_project(self, project: Dict[str, Any]) -> Iterator[Dict[str, Any]]:
        """
        Map a single URA project to DB rows.

        A URA project contains metadata and a list of transactions.
        Each transaction becomes one DB row.

        Args:
            project: URA project dict with 'project', 'street', 'transaction', etc.

        Yields:
            Dict for each transaction, ready for DB insertion
        """
        self._stats['projects_processed'] += 1

        # Extract project-level fields
        project_name = str(project.get('project', '')).strip()
        street_name = str(project.get('street', '')).strip() or None
        market_segment = str(project.get('marketSegment', '')).strip() or None

        # SVY21 coordinates (preserve for future geocoding)
        svy21_x = project.get('x')
        svy21_y = project.get('y')

        # Collect unknown project-level fields
        unknown_project_fields = {
            k: v for k, v in project.items()
            if k not in KNOWN_PROJECT_FIELDS
        }

        transactions = project.get('transaction', [])
        if not transactions:
            logger.debug(f"Project '{project_name}' has no transactions")
            return

        for txn in transactions:
            try:
                row = self._map_transaction(
                    txn,
                    project_name=project_name,
                    street_name=street_name,
                    market_segment=market_segment,
                    svy21_x=svy21_x,
                    svy21_y=svy21_y,
                    unknown_project_fields=unknown_project_fields
                )
                if row:
                    self._stats['transactions_processed'] += 1
                    yield row
                else:
                    self._stats['transactions_skipped'] += 1
            except Exception as e:
                logger.error(f"Error mapping transaction in '{project_name}': {e}")
                self._stats['transactions_skipped'] += 1
                self._stats['skip_exception'] += 1

    def _map_transaction(
        self,
        txn: Dict[str, Any],
        project_name: str,
        street_name: Optional[str],
        market_segment: Optional[str],
        svy21_x: Optional[str],
        svy21_y: Optional[str],
        unknown_project_fields: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Map a single transaction to a DB row.

        Args:
            txn: URA transaction dict
            project_name: Parent project name
            street_name: Parent street name
            market_segment: Parent market segment (CCR/RCR/OCR)
            svy21_x: SVY21 X coordinate
            svy21_y: SVY21 Y coordinate
            unknown_project_fields: Unknown fields from project level

        Returns:
            Dict ready for DB insertion, or None if essential fields missing
        """
        # === Required fields ===
        contract_date_raw = txn.get('contractDate')
        price_raw = txn.get('price')
        area_raw = txn.get('area')

        # Parse required fields
        transaction_date = parse_contract_date(contract_date_raw)
        price = parse_float_safe(price_raw, 'price')
        area_sqm = parse_float_safe(area_raw, 'area')

        # Validate required fields (with granular skip counters)
        if not project_name:
            logger.debug("Skipping transaction: missing project_name")
            self._stats['skip_missing_project'] += 1
            return None
        if not transaction_date:
            logger.debug(f"Skipping transaction in '{project_name}': invalid contract date '{contract_date_raw}'")
            self._stats['skip_invalid_date'] += 1
            return None
        if not price or price <= 0:
            logger.debug(f"Skipping transaction in '{project_name}': invalid price '{price_raw}'")
            self._stats['skip_invalid_price'] += 1
            return None
        if not area_sqm or area_sqm <= 0:
            logger.debug(f"Skipping transaction in '{project_name}': invalid area '{area_raw}'")
            self._stats['skip_invalid_area'] += 1
            return None

        # Convert area from sqm (API) to sqft (DB)
        area_sqft = round(area_sqm * SQM_TO_SQFT, 2)

        # === Optional fields ===
        district = normalize_district(txn.get('district', ''))
        property_type = str(txn.get('propertyType', '')).strip() or 'Condominium'
        tenure = str(txn.get('tenure', '')).strip() or None
        # Normalize floor_range for consistent hashing (CSV uses "XX to YY", API uses "XX-YY")
        floor_range = normalize_floor_range(str(txn.get('floorRange', '')).strip() or None)
        type_of_sale = txn.get('typeOfSale', '3')
        num_units = parse_int_safe(txn.get('noOfUnits'), 'noOfUnits', default=1)
        type_of_area = str(txn.get('typeOfArea', '')).strip() or None
        nett_price = parse_float_safe(txn.get('nettPrice'), 'nettPrice')

        # === Derived fields ===
        sale_type = map_sale_type(type_of_sale)

        # PSF calculation with sanity bounds
        # area_sqft > 0 is guaranteed by validation above
        psf = price / area_sqft
        psf = round(psf, 2)

        # Guard against NaN/Infinity - reject row (P1 fix: don't set to 0)
        if math.isnan(psf) or math.isinf(psf):
            logger.warning(f"Invalid PSF for '{project_name}': price={price}, area={area_sqft}")
            self._stats['skip_invalid_psf'] += 1
            return None

        # PSF sanity bounds (Singapore market: $100 - $50,000 psf)
        # Flag as outlier if outside bounds (per CLAUDE.md Rule 7)
        is_outlier = False
        if psf < 100 or psf > 50000:
            logger.info(f"Flagging outlier PSF for '{project_name}': ${psf:.2f}/sqft")
            is_outlier = True
            self._stats['outliers_flagged'] += 1

        contract_date = contract_date_raw  # Store original mmyy format
        transaction_month = transaction_date.replace(day=1)  # First of month

        # Bedroom classification (3-tier system)
        bedroom_count = classify_bedroom_three_tier(
            area_sqft=area_sqft,
            sale_type=sale_type,
            transaction_date=transaction_date
        )

        # Floor level classification
        floor_level = classify_floor_level(floor_range) if floor_range else None

        # Lease info
        lease_start_year = extract_lease_start_year(tenure) if tenure else None
        remaining_lease = None
        if lease_start_year:
            remaining_lease = calculate_remaining_lease(
                tenure,
                contract_or_txn_date=transaction_date
            )

        # === Unknown fields (schema drift safety) ===
        unknown_txn_fields = {
            k: v for k, v in txn.items()
            if k not in KNOWN_TRANSACTION_FIELDS
        }

        # Combine unknown fields from project + transaction + coordinates
        raw_extras = {}
        if unknown_project_fields:
            raw_extras['_project'] = unknown_project_fields
        if unknown_txn_fields:
            raw_extras['_transaction'] = unknown_txn_fields
        if svy21_x or svy21_y:
            raw_extras['svy21_x'] = svy21_x
            raw_extras['svy21_y'] = svy21_y

        if raw_extras:
            self._stats['unknown_fields_preserved'] += 1

        # === Build DB row ===
        row = {
            # Core required fields
            'project_name': project_name,
            'transaction_date': transaction_date,
            'price': price,
            'area_sqft': area_sqft,
            'psf': psf,  # Already rounded above
            'district': district,
            'bedroom_count': bedroom_count,

            # Optional fields
            'property_type': property_type,
            'sale_type': sale_type,
            'tenure': tenure,
            'lease_start_year': lease_start_year,
            'remaining_lease': remaining_lease,
            'street_name': street_name,
            'floor_range': floor_range,
            'floor_level': floor_level,
            'num_units': num_units,
            'nett_price': nett_price,
            'type_of_area': type_of_area,
            'market_segment': market_segment,

            # Derived/tracking fields
            'contract_date': contract_date,
            'transaction_month': transaction_month,
            'source': self.source,

            # Outlier flag (for COALESCE(is_outlier, false) = false filtering)
            'is_outlier': is_outlier,

            # Schema drift safety
            'raw_extras': json.dumps(raw_extras) if raw_extras else None,
        }

        # === Compute row hash for deduplication ===
        row['row_hash'] = compute_row_hash(row, NATURAL_KEY_FIELDS)

        return row

    def map_all_projects(
        self,
        projects: List[Dict[str, Any]],
        cutoff_date: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """
        Map all projects from URA API response to DB rows.

        Args:
            projects: List of project dicts from URA API
            cutoff_date: Optional date filter - only include transactions >= this date

        Returns:
            List of dicts ready for DB insertion
        """
        self.reset_stats()
        rows = []

        for project in projects:
            for row in self.map_project(project):
                # Apply cutoff filter if specified
                if cutoff_date and row['transaction_date'] < cutoff_date:
                    continue
                rows.append(row)

        # Log summary with skip breakdown
        skip_breakdown = []
        if self._stats['skip_invalid_date'] > 0:
            skip_breakdown.append(f"date={self._stats['skip_invalid_date']}")
        if self._stats['skip_invalid_price'] > 0:
            skip_breakdown.append(f"price={self._stats['skip_invalid_price']}")
        if self._stats['skip_invalid_area'] > 0:
            skip_breakdown.append(f"area={self._stats['skip_invalid_area']}")
        if self._stats['skip_invalid_psf'] > 0:
            skip_breakdown.append(f"psf={self._stats['skip_invalid_psf']}")
        if self._stats['skip_missing_project'] > 0:
            skip_breakdown.append(f"project={self._stats['skip_missing_project']}")
        if self._stats['skip_exception'] > 0:
            skip_breakdown.append(f"error={self._stats['skip_exception']}")

        skip_detail = f" ({', '.join(skip_breakdown)})" if skip_breakdown else ""
        outlier_detail = f", {self._stats['outliers_flagged']} outliers" if self._stats['outliers_flagged'] > 0 else ""

        logger.info(
            f"Mapped {self._stats['projects_processed']} projects, "
            f"{self._stats['transactions_processed']} transactions, "
            f"{self._stats['transactions_skipped']} skipped{skip_detail}{outlier_detail}"
        )

        return rows


# =============================================================================
# Module-level convenience functions
# =============================================================================

_mapper: Optional[URACanonicalMapper] = None


def get_canonical_mapper() -> URACanonicalMapper:
    """Get global canonical mapper instance."""
    global _mapper
    if _mapper is None:
        _mapper = URACanonicalMapper()
    return _mapper


def map_ura_projects_to_rows(
    projects: List[Dict[str, Any]],
    cutoff_date: Optional[date] = None
) -> List[Dict[str, Any]]:
    """
    Convenience function to map URA projects to DB rows.

    Args:
        projects: List of project dicts from URA API
        cutoff_date: Optional date filter

    Returns:
        List of dicts ready for DB insertion
    """
    return get_canonical_mapper().map_all_projects(projects, cutoff_date)
