"""
Contract Loader Utilities

Provides functions to load and work with the URA transaction schema contract.
Handles column resolution, alias mapping, and contract compatibility checks.
"""
import json
import hashlib
from pathlib import Path
from typing import Dict, Any, List, Set, Tuple, Optional

CONTRACT_DIR = Path(__file__).parent


def load_transaction_schema() -> Dict[str, Any]:
    """Load URA transaction schema contract."""
    path = CONTRACT_DIR / 'ura_transactions.schema.json'
    with open(path) as f:
        return json.load(f)


def get_schema_version() -> str:
    """Get schema version string."""
    return load_transaction_schema().get('version', 'unknown')


def get_contract_hash() -> str:
    """
    Hash of schema content for traceability.
    Changes when the contract file changes.
    """
    path = CONTRACT_DIR / 'ura_transactions.schema.json'
    content = path.read_bytes()
    return hashlib.sha256(content).hexdigest()[:16]


def get_natural_key_fields() -> List[str]:
    """Get list of fields that form the natural key for deduplication."""
    schema = load_transaction_schema()
    return schema.get('etl', {}).get('natural_key_fields', [])


def get_column_aliases() -> Dict[str, List[str]]:
    """
    Get column aliases as canonical -> [possible CSV headers].

    Example:
        {'price': ['Transacted Price ($)', 'Transacted Price', 'Price ($)']}
    """
    return load_transaction_schema().get('column_aliases', {})


def get_etl_config() -> Dict[str, Any]:
    """Get ETL configuration from schema."""
    return load_transaction_schema().get('etl', {})


def get_semantic_assertions() -> Dict[str, Any]:
    """Get semantic assertion rules from schema."""
    return load_transaction_schema().get('semantic_assertions', {})


def resolve_columns(csv_headers: List[str]) -> Tuple[Dict[str, str], Set[str], Set[str]]:
    """
    Resolve CSV headers to canonical field names using aliases.

    Args:
        csv_headers: List of column headers from CSV file

    Returns:
        Tuple of:
        - mapping: {csv_header: canonical_name}
        - missing_required: set of required fields not found
        - unknown_columns: set of CSV headers not recognized
    """
    schema = load_transaction_schema()
    aliases = schema.get('column_aliases', {})
    required = set(schema.get('required', []))

    # Build reverse lookup: csv_header (lowercase) -> canonical_name
    csv_to_canonical = {}
    for canonical, possibilities in aliases.items():
        for csv_name in possibilities:
            csv_to_canonical[csv_name.lower().strip()] = canonical

    mapping = {}
    unknown = set()
    found_canonical = set()

    for header in csv_headers:
        header_clean = header.strip()
        canonical = csv_to_canonical.get(header_clean.lower())
        if canonical:
            mapping[header_clean] = canonical
            found_canonical.add(canonical)
        else:
            unknown.add(header_clean)

    missing_required = required - found_canonical
    return mapping, missing_required, unknown


def check_contract_compatibility(csv_headers: List[str]) -> Dict[str, Any]:
    """
    Contract compatibility check - run BEFORE parsing rows.

    Detects schema drift and reports:
    - missing_required: list of required fields not found (FAIL if non-empty)
    - missing_optional: list of optional fields not found (WARN)
    - unknown_headers: list of CSV headers not recognized (INFO)
    - aliases_used: dict of {csv_header: canonical_name} where alias was used

    Args:
        csv_headers: List of column headers from CSV file

    Returns:
        Compatibility report dict with is_valid flag
    """
    mapping, missing_req, unknown = resolve_columns(csv_headers)

    schema = load_transaction_schema()
    all_canonical = set(schema.get('properties', {}).keys())
    required = set(schema.get('required', []))
    optional = all_canonical - required

    found = set(mapping.values())
    missing_optional = optional - found

    # Identify where aliases were used (header != canonical)
    aliases_used = {}
    for header, canonical in mapping.items():
        if header.lower() != canonical.lower():
            aliases_used[header] = canonical

    return {
        'missing_required': sorted(list(missing_req)),
        'missing_optional': sorted(list(missing_optional)),
        'unknown_headers': sorted(list(unknown)),
        'aliases_used': aliases_used,
        'resolved_mapping': mapping,
        'is_valid': len(missing_req) == 0
    }


def compute_header_fingerprint(headers: List[str]) -> str:
    """
    Compute stable hash of sorted header list.
    Detects schema drift between batches.

    Args:
        headers: List of CSV column headers

    Returns:
        16-character hex hash
    """
    sorted_headers = sorted([h.strip().lower() for h in headers])
    combined = '|'.join(sorted_headers)
    return hashlib.sha256(combined.encode()).hexdigest()[:16]


def get_validation_thresholds() -> Dict[str, Any]:
    """
    Get validation thresholds from ETL config.

    Returns dict with:
    - min_row_count
    - max_null_rate per column
    - price_range
    - psf_range
    - area_range
    """
    schema = load_transaction_schema()
    etl = schema.get('etl', {})

    # Get price/psf/area ranges from properties
    props = schema.get('properties', {})

    return {
        'min_row_count': etl.get('min_row_count', 1000),
        'max_null_rate': etl.get('max_null_rate', {}),
        'price_range': (
            props.get('price', {}).get('minimum', 50000),
            props.get('price', {}).get('maximum', 100000000)
        ),
        'psf_range': (100, 20000),  # Not in schema, using defaults
        'area_range': (
            props.get('area_sqft', {}).get('minimum', 100),
            props.get('area_sqft', {}).get('maximum', 50000)
        ),
        'outlier_iqr_multiplier': etl.get('outlier_iqr_multiplier', 5.0),
        'enbloc_area_threshold': etl.get('enbloc_area_threshold', 10000),
        'psf_tolerance': etl.get('psf_tolerance', {'absolute': 3, 'percent': 0.005}),
    }
