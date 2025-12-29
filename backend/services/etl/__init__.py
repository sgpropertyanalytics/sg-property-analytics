"""
ETL Services Package

Provides ETL infrastructure for URA transaction data ingestion:
- RuleRegistry: Wraps canonical classifiers (no hardcoding)
- RunContext: Unified context for pipeline runs
- Fingerprinting: File/header/row hashing for idempotency
"""

from .rule_registry import RuleRegistry, get_rule_registry
from .run_context import RunContext
from .fingerprint import compute_file_sha256, compute_header_fingerprint, compute_row_hash

__all__ = [
    'RuleRegistry',
    'get_rule_registry',
    'RunContext',
    'compute_file_sha256',
    'compute_header_fingerprint',
    'compute_row_hash',
]
