"""
Base Promoter - Projects canonical entities to domain tables.

Projectors handle the final step: canonical_entities -> domain-specific tables.
This keeps domain tables optimized for app queries while canonical stays normalized.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


class BasePromoter(ABC):
    """
    Abstract base for entity promoters/projectors.

    Subclasses must implement:
    - project_to_domain(): Project a canonical entity to its domain table
    - map_fields(): Map canonical fields to domain table fields
    """

    ENTITY_TYPE: str = ""
    TARGET_TABLE: str = ""

    def __init__(self, db_session):
        """
        Initialize promoter.

        Args:
            db_session: SQLAlchemy database session
        """
        self.db_session = db_session

    @abstractmethod
    def project_to_domain(self, canonical) -> Optional[Any]:
        """
        Project a canonical entity to its domain table.

        Args:
            canonical: CanonicalEntity instance

        Returns:
            The domain model instance or None if skipped
        """
        pass

    @abstractmethod
    def map_fields(self, canonical_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Map canonical fields to domain table fields.

        Handle any transformations needed between the generic
        canonical structure and the domain-specific table.

        Args:
            canonical_data: Data from canonical.canonical JSON field

        Returns:
            Dict with keys matching domain table columns
        """
        pass
