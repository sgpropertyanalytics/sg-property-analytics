"""
Scraping Orchestrator - Coordinates scraping, promotion, and projection.

Responsibilities:
1. Manages scrape runs (start, monitor, complete)
2. Coordinates scrapers with rate limiting
3. Triggers promotion (scraped -> canonical)
4. Triggers projection (canonical -> domain tables)
5. Detects schema changes
"""
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Type

from .base import BaseScraper, ScrapeMode, ScrapeResult
from .tier_system import SourceTier, get_tier_config
from .field_authority import FieldAuthorityChecker
from .utils.hashing import compute_json_hash
from .utils.schema_diff import detect_schema_changes

logger = logging.getLogger(__name__)


class PromotionResult:
    """Result of promoting a scraped entity to canonical."""

    def __init__(
        self,
        entity_key: str,
        action: str,
        canonical_id: Optional[int] = None,
        candidate_id: Optional[int] = None,
        reason: Optional[str] = None,
    ):
        self.entity_key = entity_key
        self.action = action  # 'created', 'updated', 'candidate', 'skipped'
        self.canonical_id = canonical_id
        self.candidate_id = candidate_id
        self.reason = reason

    def __repr__(self):
        return f"<PromotionResult {self.entity_key} action={self.action}>"


class ScrapingOrchestrator:
    """
    Main orchestrator for scraping operations.

    Coordinates:
    - Scraper execution with rate limiting
    - Promotion from scraped_entities to canonical_entities
    - Projection from canonical_entities to domain tables
    - Schema change detection
    """

    def __init__(self, db_session, rate_limiter=None, cache=None):
        """
        Initialize orchestrator.

        Args:
            db_session: SQLAlchemy database session
            rate_limiter: Optional ScraperRateLimiter instance
            cache: Optional cache for HTTP responses
        """
        self.db_session = db_session
        self.rate_limiter = rate_limiter
        self.cache = cache
        self.scrapers: Dict[str, Type[BaseScraper]] = {}
        self.promoters: Dict[str, "BasePromoter"] = {}
        self.field_authority = FieldAuthorityChecker(db_session)

    def register_scraper(self, scraper_class: Type[BaseScraper]):
        """
        Register a scraper class.

        Args:
            scraper_class: BaseScraper subclass
        """
        self.scrapers[scraper_class.SCRAPER_NAME] = scraper_class
        logger.info(f"Registered scraper: {scraper_class.SCRAPER_NAME}")

    def register_promoter(self, entity_type: str, promoter: "BasePromoter"):
        """
        Register a promoter for an entity type.

        Args:
            entity_type: Entity type (e.g., 'gls_tender')
            promoter: BasePromoter subclass instance
        """
        self.promoters[entity_type] = promoter
        logger.info(f"Registered promoter for: {entity_type}")

    def run_scraper(
        self,
        scraper_name: str,
        mode: ScrapeMode = ScrapeMode.CANONICAL_INGEST,
        config: Optional[Dict[str, Any]] = None,
        triggered_by: str = "manual",
        auto_promote: bool = True,
    ):
        """
        Execute a scraper with full orchestration.

        Args:
            scraper_name: Name of registered scraper
            mode: DISCOVERY, CANDIDATE_INGEST, or CANONICAL_INGEST
            config: Scraper-specific configuration
            triggered_by: 'manual', 'cron', or 'webhook'
            auto_promote: Whether to auto-promote after scraping

        Returns:
            ScrapeRun model instance
        """
        if scraper_name not in self.scrapers:
            raise ValueError(f"Unknown scraper: {scraper_name}")

        scraper_class = self.scrapers[scraper_name]
        scraper = scraper_class(self.db_session, self.rate_limiter, self.cache)

        # Run scraper
        run = scraper.run(mode=mode, config=config, triggered_by=triggered_by)

        # Auto-promote if enabled and mode allows
        if auto_promote and mode in (ScrapeMode.CANONICAL_INGEST,):
            self.promote_run(run.run_id)

        return run

    def promote_run(self, run_id: str) -> Dict[str, int]:
        """
        Promote all entities from a scrape run.

        Args:
            run_id: ID of the scrape run

        Returns:
            Dict with promotion statistics
        """
        from .models import ScrapedEntity

        stats = {
            "total": 0,
            "created": 0,
            "updated": 0,
            "candidate": 0,
            "skipped": 0,
        }

        entities = self.db_session.query(ScrapedEntity).filter_by(
            run_id=run_id
        ).all()

        for entity in entities:
            stats["total"] += 1
            result = self._promote_entity(entity)

            if result.action == "created":
                stats["created"] += 1
            elif result.action == "updated":
                stats["updated"] += 1
            elif result.action == "candidate":
                stats["candidate"] += 1
            else:
                stats["skipped"] += 1

        self.db_session.commit()
        logger.info(f"Promotion complete for run {run_id}: {stats}")
        return stats

    def _promote_entity(self, scraped) -> PromotionResult:
        """
        Promote a single scraped entity to canonical.

        Promotion rules:
        1. Tier A: Direct promotion, can create or update
        2. Tier B: Promote with validation, restricted fields
        3. Tier C: Candidate only
        """
        from .models import CanonicalEntity, EntityCandidate

        tier = SourceTier(scraped.source_tier)
        tier_config = get_tier_config(tier)

        # Tier C cannot update canonical
        if not tier_config.can_update_canonical:
            candidate = self._create_candidate(scraped, reason="tier_c_only")
            return PromotionResult(
                entity_key=scraped.entity_key,
                action="candidate",
                candidate_id=candidate.id,
                reason="tier_c_only",
            )

        # Check for schema changes
        self._check_schema_change(scraped)

        # Find existing canonical
        existing = self.db_session.query(CanonicalEntity).filter_by(
            entity_type=scraped.entity_type,
            entity_key=scraped.entity_key,
        ).first()

        if existing:
            return self._update_canonical(existing, scraped, tier)
        else:
            return self._create_canonical(scraped, tier)

    def _create_canonical(self, scraped, tier: SourceTier) -> PromotionResult:
        """Create new canonical entity."""
        from .models import CanonicalEntity

        # Filter fields based on authority
        allowed_data = self.field_authority.filter_allowed_fields(
            entity_type=scraped.entity_type,
            tier=tier,
            data=scraped.extracted,
        )

        canonical = CanonicalEntity(
            entity_type=scraped.entity_type,
            entity_key=scraped.entity_key,
            canonical=allowed_data,
            canonical_hash=compute_json_hash(allowed_data),
            confidence_score=1.0 if tier == SourceTier.A else 0.8,
            status="active",
            provenance=[{
                "source": scraped.source_domain,
                "scraped_entity_id": scraped.id,
                "tier": tier.value,
                "contributed_fields": list(allowed_data.keys()),
                "at": datetime.utcnow().isoformat(),
            }],
            highest_tier=tier.value,
            last_promoted_at=datetime.utcnow(),
        )
        self.db_session.add(canonical)
        self.db_session.flush()  # Get ID

        logger.debug(f"Created canonical: {scraped.entity_key}")
        return PromotionResult(
            entity_key=scraped.entity_key,
            action="created",
            canonical_id=canonical.id,
        )

    def _update_canonical(
        self, existing, scraped, tier: SourceTier
    ) -> PromotionResult:
        """Update existing canonical with new data."""
        from .models import EntityCandidate

        existing_tier = SourceTier(existing.highest_tier)

        # Filter fields based on authority and existing tier
        allowed_data = self.field_authority.filter_allowed_fields(
            entity_type=scraped.entity_type,
            tier=tier,
            data=scraped.extracted,
            existing_tier=existing_tier,
        )

        # Check for conflicts
        conflicts = []
        for field, value in allowed_data.items():
            existing_value = existing.canonical.get(field)
            if existing_value is not None and existing_value != value:
                # Check if this tier can override
                can_override = self.field_authority.can_update(
                    scraped.entity_type, field, tier, existing_tier
                )
                if not can_override:
                    conflicts.append(field)

        if conflicts:
            # Create candidate for conflicting updates
            candidate = self._create_candidate(
                scraped,
                reason="conflict",
                conflict_details={
                    f: {"expected": existing.canonical.get(f), "actual": allowed_data.get(f)}
                    for f in conflicts
                },
            )
            return PromotionResult(
                entity_key=scraped.entity_key,
                action="candidate",
                candidate_id=candidate.id,
                reason=f"field_conflicts: {conflicts}",
            )

        if allowed_data:
            # Update canonical
            existing.update_from_source(
                source_domain=scraped.source_domain,
                source_tier=tier.value,
                scraped_entity_id=scraped.id,
                contributed_fields=list(allowed_data.keys()),
                new_data=allowed_data,
            )

            logger.debug(f"Updated canonical: {scraped.entity_key}")
            return PromotionResult(
                entity_key=scraped.entity_key,
                action="updated",
                canonical_id=existing.id,
            )

        return PromotionResult(
            entity_key=scraped.entity_key,
            action="skipped",
            reason="no_new_data",
        )

    def _create_candidate(
        self,
        scraped,
        reason: str,
        conflict_details: Optional[Dict] = None,
    ):
        """Create a candidate for manual review."""
        from .models import EntityCandidate

        candidate = EntityCandidate(
            entity_type=scraped.entity_type,
            entity_key=scraped.entity_key,
            candidate=scraped.extracted,
            candidate_hash=scraped.extracted_hash,
            reason=reason,
            source_domain=scraped.source_domain,
            source_tier=scraped.source_tier,
            scraped_entity_id=scraped.id,
            conflict_details=conflict_details,
        )
        self.db_session.add(candidate)
        self.db_session.flush()

        logger.debug(f"Created candidate: {scraped.entity_key} reason={reason}")
        return candidate

    def _check_schema_change(self, entity):
        """Check for schema changes and log if detected."""
        from .models import ScrapedEntity, ScraperSchemaChange

        # Find previous version
        previous = self.db_session.query(ScrapedEntity).filter(
            ScrapedEntity.entity_type == entity.entity_type,
            ScrapedEntity.entity_key == entity.entity_key,
            ScrapedEntity.source_domain == entity.source_domain,
            ScrapedEntity.id != entity.id,
        ).order_by(ScrapedEntity.scraped_at.desc()).first()

        if previous and previous.extracted_hash != entity.extracted_hash:
            changes = detect_schema_changes(previous.extracted, entity.extracted)
            if changes:
                change = ScraperSchemaChange(
                    entity_type=entity.entity_type,
                    entity_key=entity.entity_key,
                    source_domain=entity.source_domain,
                    previous_hash=previous.extracted_hash,
                    new_hash=entity.extracted_hash,
                    change_type=changes.change_type.value,
                    change_details=changes.to_dict(),
                    run_id=entity.run_id,
                )
                self.db_session.add(change)
                logger.info(
                    f"Schema change detected: {entity.entity_key} "
                    f"type={changes.change_type.value}"
                )

    def project_to_domain_table(self, entity_type: str) -> int:
        """
        Project canonical entities to domain-specific tables.

        e.g., canonical_entities(gls_tender) -> gls_tenders

        Args:
            entity_type: Type of entity to project

        Returns:
            Number of entities projected
        """
        from .models import CanonicalEntity

        if entity_type not in self.promoters:
            raise ValueError(f"No promoter for entity type: {entity_type}")

        promoter = self.promoters[entity_type]

        # Get all active canonical entities of this type
        canonicals = self.db_session.query(CanonicalEntity).filter(
            CanonicalEntity.entity_type == entity_type,
            CanonicalEntity.status == "active",
        ).all()

        count = 0
        for canonical in canonicals:
            result = promoter.project_to_domain(canonical)
            if result:
                count += 1

        self.db_session.commit()
        logger.info(f"Projected {count} {entity_type} entities to domain table")
        return count

    def get_pending_candidates(
        self,
        entity_type: Optional[str] = None,
        limit: int = 100,
    ) -> List:
        """
        Get candidates pending review.

        Args:
            entity_type: Filter by entity type
            limit: Maximum number to return

        Returns:
            List of EntityCandidate objects
        """
        from .models import EntityCandidate

        query = self.db_session.query(EntityCandidate).filter_by(
            review_status="open"
        )
        if entity_type:
            query = query.filter_by(entity_type=entity_type)

        return query.order_by(EntityCandidate.created_at.desc()).limit(limit).all()

    def get_unacknowledged_schema_changes(
        self,
        source_domain: Optional[str] = None,
        limit: int = 100,
    ) -> List:
        """
        Get schema changes that haven't been acknowledged.

        Args:
            source_domain: Filter by source domain
            limit: Maximum number to return

        Returns:
            List of ScraperSchemaChange objects
        """
        from .models import ScraperSchemaChange

        query = self.db_session.query(ScraperSchemaChange).filter_by(
            acknowledged=False
        )
        if source_domain:
            query = query.filter_by(source_domain=source_domain)

        return query.order_by(ScraperSchemaChange.detected_at.desc()).limit(limit).all()
