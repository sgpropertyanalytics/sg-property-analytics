"""
Ingestion Orchestrator - Coordinates ingestion, diff detection, and promotion.

Responsibilities:
1. Manages ingestion runs (start, monitor, complete)
2. Coordinates scrapers/uploaders with rate limiting
3. Computes diffs against existing domain data
4. Triggers promotion with conflict gating
5. Detects schema changes
"""
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Type

from .base import BaseScraper, ScrapeMode, ScrapeResult
from .tier_system import SourceTier, get_tier_config
from .field_authority import FieldAuthorityChecker
from .utils.hashing import compute_json_hash
from .utils.schema_diff import detect_schema_changes
from .utils.diff import (
    DiffStatus,
    DiffReport,
    EntityDiff,
    compute_entity_diff,
    compute_diff_report,
)

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

    # =========================================================================
    # DIFF DETECTION
    # =========================================================================

    def compute_diff_for_gls(
        self,
        incoming_records: List[Dict[str, Any]],
        run_id: Optional[str] = None,
    ) -> DiffReport:
        """
        Compute diff for GLS tenders against existing domain table.

        Args:
            incoming_records: List of tender dicts from scraping
            run_id: Optional run ID (auto-generated if not provided)

        Returns:
            DiffReport with unchanged/changed/new/missing and conflicts
        """
        from models.gls_tender import GLSTender

        run_id = run_id or str(uuid.uuid4())

        # Load existing records as dict keyed by release_id
        existing_tenders = self.db_session.query(GLSTender).all()
        existing_dict = {}
        for tender in existing_tenders:
            tender_dict = tender.to_dict(include_status_label=False)
            existing_dict[tender.release_id] = tender_dict

        # Fields to compare (skip computed/derived fields)
        compare_fields = {
            "status",
            "release_id",
            "release_url",
            "release_date",
            "tender_close_date",
            "location_raw",
            "latitude",
            "longitude",
            "postal_code",
            "postal_district",
            "planning_area",
            "market_segment",
            "site_area_sqm",
            "max_gfa_sqm",
            "estimated_units",
            "successful_tenderer",
            "tendered_price_sgd",
            "num_tenderers",
            "psm_gfa",
        }

        return compute_diff_report(
            source_name="ura_gls",
            source_type="scrape",
            run_id=run_id,
            entity_type="gls_tender",
            incoming_records=incoming_records,
            existing_records=existing_dict,
            key_field="release_id",
            id_field="id",
            compare_fields=compare_fields,
        )

    def promote_with_diff(
        self,
        diff_report: DiffReport,
        force: bool = False,
    ) -> Dict[str, Any]:
        """
        Promote records based on diff report.

        Args:
            diff_report: DiffReport from compute_diff_for_gls
            force: If True, promote even with blocking conflicts

        Returns:
            Dict with promotion statistics
        """
        from models.gls_tender import GLSTender

        stats = {
            "promoted": 0,
            "inserted": 0,
            "updated": 0,
            "skipped_conflict": 0,
            "skipped_unchanged": 0,
            "blocking_conflicts": diff_report.blocking_conflicts,
        }

        # Check for blocking conflicts
        if diff_report.blocking_conflicts > 0 and not force:
            logger.warning(
                f"Promotion blocked: {diff_report.blocking_conflicts} blocking conflicts. "
                f"Use force=True to override."
            )
            stats["skipped_conflict"] = len(diff_report.conflicts)
            return stats

        for diff in diff_report.diffs:
            if diff.status == DiffStatus.UNCHANGED:
                stats["skipped_unchanged"] += 1
                continue

            if diff.status == DiffStatus.MISSING:
                # Don't delete missing records automatically
                continue

            if diff.has_conflicts and diff.blocking_conflicts > 0 and not force:
                stats["skipped_conflict"] += 1
                continue

            if diff.status == DiffStatus.NEW:
                # Insert new record
                tender_data = diff.new_data or diff.incoming_data
                if tender_data:
                    tender = GLSTender(
                        release_id=tender_data.get("release_id"),
                        status=tender_data.get("status", "launched"),
                        release_url=tender_data.get("release_url") or tender_data.get("source_url"),
                        release_date=self._parse_date(tender_data.get("release_date")),
                        tender_close_date=self._parse_date(tender_data.get("tender_close_date")),
                        location_raw=tender_data.get("location_raw"),
                        latitude=tender_data.get("latitude"),
                        longitude=tender_data.get("longitude"),
                        postal_code=tender_data.get("postal_code"),
                        postal_district=tender_data.get("postal_district"),
                        planning_area=tender_data.get("planning_area"),
                        market_segment=tender_data.get("market_segment"),
                        site_area_sqm=tender_data.get("site_area_sqm"),
                        max_gfa_sqm=tender_data.get("max_gfa_sqm"),
                        estimated_units=tender_data.get("estimated_units"),
                        estimated_units_source=tender_data.get("estimated_units_source"),
                        successful_tenderer=tender_data.get("successful_tenderer"),
                        tendered_price_sgd=tender_data.get("tendered_price_sgd"),
                        num_tenderers=tender_data.get("num_tenderers"),
                        psm_gfa=tender_data.get("psm_gfa"),
                    )
                    GLSTender.compute_derived_fields(tender)
                    self.db_session.add(tender)
                    stats["inserted"] += 1
                    stats["promoted"] += 1
                    logger.debug(f"Inserted: {diff.entity_key}")

            elif diff.status == DiffStatus.CHANGED:
                # Update existing record
                existing = self.db_session.query(GLSTender).filter_by(
                    release_id=diff.entity_key
                ).first()

                if existing and diff.incoming_data:
                    for change in diff.changes:
                        if not change.is_conflict or force:
                            setattr(existing, change.field_name, change.new_value)

                    GLSTender.compute_derived_fields(existing)
                    stats["updated"] += 1
                    stats["promoted"] += 1
                    logger.debug(f"Updated: {diff.entity_key} ({len(diff.changes)} fields)")

        self.db_session.commit()
        logger.info(f"Promotion complete: {stats}")
        return stats

    def _parse_date(self, value):
        """Parse date from various formats."""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.date()
        if hasattr(value, 'date'):
            return value
        if isinstance(value, str):
            try:
                from datetime import datetime as dt
                return dt.fromisoformat(value).date()
            except ValueError:
                try:
                    return dt.strptime(value, "%Y-%m-%d").date()
                except ValueError:
                    return None
        return None

    def run_scraper_with_diff(
        self,
        scraper_name: str,
        mode: ScrapeMode = ScrapeMode.CANONICAL_INGEST,
        config: Optional[Dict[str, Any]] = None,
        triggered_by: str = "manual",
        auto_promote: bool = False,
        force_promote: bool = False,
    ) -> Dict[str, Any]:
        """
        Execute a scraper with diff detection before promotion.

        Args:
            scraper_name: Name of registered scraper
            mode: DISCOVERY, CANDIDATE_INGEST, or CANONICAL_INGEST
            config: Scraper-specific configuration
            triggered_by: 'manual', 'cron', or 'webhook'
            auto_promote: Whether to auto-promote after diffing
            force_promote: Whether to force promotion even with conflicts

        Returns:
            Dict with run info, diff report, and promotion stats
        """
        if scraper_name not in self.scrapers:
            raise ValueError(f"Unknown scraper: {scraper_name}")

        # Initialize scraper
        scraper_class = self.scrapers[scraper_name]
        scraper = scraper_class(self.db_session, self.rate_limiter, self.cache)

        # Generate run ID
        run_id = str(uuid.uuid4())

        result = {
            "run_id": run_id,
            "scraper_name": scraper_name,
            "mode": mode.value,
            "triggered_by": triggered_by,
            "scraped_records": [],
            "diff_report": None,
            "promotion_stats": None,
        }

        # Fetch and parse data
        logger.info(f"Starting scrape: {scraper_name} (run_id={run_id})")

        try:
            # Get URLs and scrape
            urls = list(scraper.get_urls_to_scrape(**(config or {})))
            result["urls_found"] = len(urls)

            scraped_records = []
            limit = (config or {}).get("limit")

            for i, url in enumerate(urls):
                if limit and i >= limit:
                    break

                try:
                    records = scraper.parse_page(url, None)  # HTML fetched internally
                    if records:
                        scraped_records.extend(records)
                except Exception as e:
                    logger.warning(f"Failed to parse {url}: {e}")

            result["records_count"] = len(scraped_records)

            # Convert ScrapeResult objects to dicts for diff computation
            incoming_dicts = []
            for record in scraped_records:
                if hasattr(record, 'extracted'):
                    # ScrapeResult object
                    data = record.extracted.copy()
                    data['release_id'] = record.entity_key
                    incoming_dicts.append(data)
                elif isinstance(record, dict):
                    incoming_dicts.append(record)

            result["scraped_records"] = incoming_dicts

            # Compute diff
            if scraper_name == "ura_gls":
                diff_report = self.compute_diff_for_gls(incoming_dicts, run_id)
                result["diff_report"] = diff_report.to_dict()
                result["diff_summary"] = {
                    "unchanged": diff_report.unchanged_count,
                    "changed": diff_report.changed_count,
                    "new": diff_report.new_count,
                    "missing": diff_report.missing_count,
                    "conflicts": diff_report.total_conflicts,
                    "can_auto_promote": diff_report.can_auto_promote,
                }

                # Auto-promote if enabled
                if auto_promote:
                    promotion_stats = self.promote_with_diff(
                        diff_report,
                        force=force_promote,
                    )
                    result["promotion_stats"] = promotion_stats

                # Generate markdown report
                result["diff_markdown"] = diff_report.to_markdown()

        except Exception as e:
            logger.error(f"Scrape failed: {e}")
            result["error"] = str(e)
            import traceback
            result["traceback"] = traceback.format_exc()

        return result

    # =========================================================================
    # CSV UPLOAD DIFF DETECTION
    # =========================================================================

    def compute_diff_for_upcoming_launches(
        self,
        incoming_records: List[Dict[str, Any]],
        run_id: Optional[str] = None,
    ) -> DiffReport:
        """
        Compute diff for upcoming launches CSV against existing database.

        Args:
            incoming_records: List of launch dicts from CSV
            run_id: Optional run ID (auto-generated if not provided)

        Returns:
            DiffReport with unchanged/changed/new/missing and conflicts
        """
        from models.upcoming_launch import UpcomingLaunch

        run_id = run_id or str(uuid.uuid4())

        # Load existing records keyed by project_name (lowercase for matching)
        existing_launches = self.db_session.query(UpcomingLaunch).all()
        existing_dict = {}
        for launch in existing_launches:
            launch_dict = launch.to_dict()
            # Use lowercase project_name as key for case-insensitive matching
            key = launch.project_name.lower().strip()
            existing_dict[key] = launch_dict

        # Normalize incoming records to use lowercase key
        normalized_incoming = []
        for record in incoming_records:
            normalized = record.copy()
            # Store original project_name but use lowercase for key
            normalized['_key'] = record.get('project_name', '').lower().strip()
            normalized_incoming.append(normalized)

        # Fields to compare
        compare_fields = {
            "project_name",
            "developer",
            "district",
            "planning_area",
            "market_segment",
            "address",
            "total_units",
            "indicative_psf_low",
            "indicative_psf_high",
            "tenure",
            "launch_year",
            "expected_launch_date",
            "expected_top_date",
            "land_bid_psf",
            "data_source",
            "data_confidence",
        }

        return compute_diff_report(
            source_name="upcoming_launches_csv",
            source_type="csv_upload",
            run_id=run_id,
            entity_type="upcoming_launch",
            incoming_records=normalized_incoming,
            existing_records=existing_dict,
            key_field="_key",
            id_field="id",
            compare_fields=compare_fields,
        )

    def compute_diff_for_new_launch_units(
        self,
        incoming_records: List[Dict[str, Any]],
        run_id: Optional[str] = None,
    ) -> DiffReport:
        """
        Compute diff for new_launch_units CSV against upcoming_launches database.

        This compares the CSV unit counts against what's in the database
        to find discrepancies that need review.

        Args:
            incoming_records: List of unit dicts from CSV
            run_id: Optional run ID (auto-generated if not provided)

        Returns:
            DiffReport with unchanged/changed/new/missing and conflicts
        """
        from models.upcoming_launch import UpcomingLaunch

        run_id = run_id or str(uuid.uuid4())

        # Load existing records from upcoming_launches table
        existing_launches = self.db_session.query(UpcomingLaunch).all()
        existing_dict = {}
        for launch in existing_launches:
            key = launch.project_name.upper().strip()
            existing_dict[key] = {
                "id": launch.id,
                "project_name": launch.project_name,
                "total_units": launch.total_units,
                "developer": launch.developer,
                "tenure": launch.tenure,
                "district": launch.district,
            }

        # Normalize incoming records
        normalized_incoming = []
        for record in incoming_records:
            normalized = record.copy()
            normalized['_key'] = record.get('project_name', '').upper().strip()
            normalized_incoming.append(normalized)

        # Fields to compare
        compare_fields = {
            "project_name",
            "total_units",
            "developer",
            "tenure",
            "district",
        }

        return compute_diff_report(
            source_name="new_launch_units_csv",
            source_type="csv_upload",
            run_id=run_id,
            entity_type="new_launch_units",
            incoming_records=normalized_incoming,
            existing_records=existing_dict,
            key_field="_key",
            id_field="id",
            compare_fields=compare_fields,
        )

    def run_csv_upload_with_diff(
        self,
        csv_type: str,
        file_path: str,
        auto_promote: bool = False,
        force_promote: bool = False,
        dry_run: bool = True,
    ) -> Dict[str, Any]:
        """
        Run CSV upload with diff detection before promotion.

        Args:
            csv_type: 'upcoming_launches' or 'new_launch_units'
            file_path: Path to CSV file
            auto_promote: Whether to auto-promote after diffing
            force_promote: Whether to force promotion even with conflicts
            dry_run: If True, validate only without saving

        Returns:
            Dict with run info, diff report, and promotion stats
        """
        import csv
        import os

        run_id = str(uuid.uuid4())

        result = {
            "run_id": run_id,
            "csv_type": csv_type,
            "file_path": file_path,
            "dry_run": dry_run,
            "diff_report": None,
            "diff_summary": None,
            "promotion_stats": None,
        }

        # Read CSV file
        if not os.path.exists(file_path):
            result["error"] = f"CSV file not found: {file_path}"
            return result

        try:
            rows = []
            with open(file_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Normalize column names
                    normalized = {}
                    for k, v in row.items():
                        key = str(k).strip().lower().replace(' ', '_')
                        normalized[key] = v if v else None
                    rows.append(normalized)

            result["rows_read"] = len(rows)
            logger.info(f"Read {len(rows)} rows from {file_path}")

        except Exception as e:
            result["error"] = f"Failed to read CSV: {e}"
            return result

        # Compute diff based on CSV type
        try:
            if csv_type == "upcoming_launches":
                # Transform rows to match expected format
                incoming = self._transform_upcoming_launches_csv(rows)
                diff_report = self.compute_diff_for_upcoming_launches(incoming, run_id)

            elif csv_type == "new_launch_units":
                # Transform rows to match expected format
                incoming = self._transform_new_launch_units_csv(rows)
                diff_report = self.compute_diff_for_new_launch_units(incoming, run_id)

            else:
                result["error"] = f"Unknown CSV type: {csv_type}"
                return result

            result["diff_report"] = diff_report.to_dict()
            result["diff_summary"] = {
                "unchanged": diff_report.unchanged_count,
                "changed": diff_report.changed_count,
                "new": diff_report.new_count,
                "missing": diff_report.missing_count,
                "conflicts": diff_report.total_conflicts,
                "blocking_conflicts": diff_report.blocking_conflicts,
                "can_auto_promote": diff_report.can_auto_promote,
            }
            result["diff_markdown"] = diff_report.to_markdown()

            # Auto-promote if enabled and not dry run
            if auto_promote and not dry_run:
                if csv_type == "upcoming_launches":
                    promotion_stats = self._promote_upcoming_launches(
                        diff_report,
                        incoming,
                        force=force_promote,
                    )
                    result["promotion_stats"] = promotion_stats
                elif csv_type == "new_launch_units":
                    # new_launch_units doesn't promote to DB, just updates CSV
                    result["promotion_stats"] = {
                        "note": "new_launch_units is file-based, no DB promotion"
                    }

        except Exception as e:
            logger.error(f"CSV diff failed: {e}")
            result["error"] = str(e)
            import traceback
            result["traceback"] = traceback.format_exc()

        return result

    def _transform_upcoming_launches_csv(
        self,
        rows: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Transform CSV rows to match upcoming_launches format."""
        transformed = []
        for row in rows:
            # Parse numeric fields
            total_units = None
            if row.get('total_units'):
                try:
                    total_units = int(row['total_units'])
                except (ValueError, TypeError):
                    pass

            psf_min = None
            if row.get('psf_min'):
                try:
                    psf_min = float(row['psf_min'])
                except (ValueError, TypeError):
                    pass

            psf_max = None
            if row.get('psf_max'):
                try:
                    psf_max = float(row['psf_max'])
                except (ValueError, TypeError):
                    pass

            land_bid_psf = None
            if row.get('land_bid_psf'):
                try:
                    land_bid_psf = float(row['land_bid_psf'])
                except (ValueError, TypeError):
                    pass

            launch_year = None
            if row.get('launch_year'):
                try:
                    launch_year = int(row['launch_year'])
                except (ValueError, TypeError):
                    pass

            # Format district
            district = str(row.get('district', '')).strip().upper()
            if district and not district.startswith('D'):
                district = f"D{district.zfill(2)}"

            transformed.append({
                "project_name": str(row.get('project_name', '')).strip(),
                "developer": str(row.get('developer', '')).strip() or None,
                "district": district or None,
                "planning_area": str(row.get('planning_area', '')).strip() or None,
                "market_segment": str(row.get('market_segment', '')).strip().upper() or None,
                "address": str(row.get('address', '')).strip() or None,
                "total_units": total_units,
                "indicative_psf_low": psf_min,
                "indicative_psf_high": psf_max or psf_min,
                "tenure": str(row.get('tenure', '')).strip() or None,
                "launch_year": launch_year,
                "expected_launch_date": row.get('launch_date'),
                "land_bid_psf": land_bid_psf,
                "data_source": str(row.get('source', '')).strip() or None,
                "data_confidence": str(row.get('confidence', 'medium')).strip().lower(),
            })

        return transformed

    def _transform_new_launch_units_csv(
        self,
        rows: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Transform CSV rows to match new_launch_units format."""
        transformed = []
        for row in rows:
            total_units = None
            if row.get('total_units'):
                try:
                    total_units = int(row['total_units'])
                except (ValueError, TypeError):
                    pass

            top = None
            if row.get('top'):
                try:
                    top = int(row['top'])
                except (ValueError, TypeError):
                    pass

            transformed.append({
                "project_name": str(row.get('project_name', '')).strip().upper(),
                "total_units": total_units,
                "developer": str(row.get('developer', '')).strip() or None,
                "tenure": str(row.get('tenure', '')).strip() or None,
                "top": top,
                "district": str(row.get('district', '')).strip() or None,
                "source": str(row.get('source', '')).strip() or None,
            })

        return transformed

    def _promote_upcoming_launches(
        self,
        diff_report: DiffReport,
        incoming_data: List[Dict[str, Any]],
        force: bool = False,
    ) -> Dict[str, Any]:
        """
        Promote upcoming launches based on diff report.

        Args:
            diff_report: DiffReport from compute_diff_for_upcoming_launches
            incoming_data: List of transformed launch dicts
            force: If True, promote even with blocking conflicts

        Returns:
            Dict with promotion statistics
        """
        from models.upcoming_launch import UpcomingLaunch
        from utils.normalize import coerce_to_date

        stats = {
            "promoted": 0,
            "inserted": 0,
            "updated": 0,
            "skipped_conflict": 0,
            "skipped_unchanged": 0,
            "blocking_conflicts": diff_report.blocking_conflicts,
        }

        # Check for blocking conflicts
        if diff_report.blocking_conflicts > 0 and not force:
            logger.warning(
                f"Promotion blocked: {diff_report.blocking_conflicts} blocking conflicts. "
                f"Use force=True to override."
            )
            stats["skipped_conflict"] = len(diff_report.conflicts)
            return stats

        # Build lookup for incoming data
        incoming_lookup = {}
        for record in incoming_data:
            key = record.get('project_name', '').lower().strip()
            incoming_lookup[key] = record

        for diff in diff_report.diffs:
            if diff.status == DiffStatus.UNCHANGED:
                stats["skipped_unchanged"] += 1
                continue

            if diff.status == DiffStatus.MISSING:
                # Don't delete missing records automatically
                continue

            if diff.has_conflicts and diff.blocking_conflicts > 0 and not force:
                stats["skipped_conflict"] += 1
                continue

            incoming = incoming_lookup.get(diff.entity_key)
            if not incoming:
                continue

            if diff.status == DiffStatus.NEW:
                # Insert new record
                launch = UpcomingLaunch(
                    project_name=incoming.get("project_name"),
                    developer=incoming.get("developer"),
                    district=incoming.get("district"),
                    planning_area=incoming.get("planning_area"),
                    market_segment=incoming.get("market_segment"),
                    address=incoming.get("address"),
                    total_units=incoming.get("total_units"),
                    indicative_psf_low=incoming.get("indicative_psf_low"),
                    indicative_psf_high=incoming.get("indicative_psf_high"),
                    tenure=incoming.get("tenure"),
                    launch_year=incoming.get("launch_year"),
                    expected_launch_date=coerce_to_date(incoming.get("expected_launch_date")),
                    land_bid_psf=incoming.get("land_bid_psf"),
                    data_source=incoming.get("data_source"),
                    data_confidence=incoming.get("data_confidence"),
                    property_type="Condominium",
                    needs_review=False,
                )
                self.db_session.add(launch)
                stats["inserted"] += 1
                stats["promoted"] += 1
                logger.debug(f"Inserted: {diff.entity_key}")

            elif diff.status == DiffStatus.CHANGED:
                # Update existing record
                existing = self.db_session.query(UpcomingLaunch).filter(
                    UpcomingLaunch.project_name.ilike(diff.entity_key)
                ).first()

                if existing:
                    for change in diff.changes:
                        if not change.is_conflict or force:
                            # Map field names
                            field = change.field_name
                            if field == "indicative_psf_low":
                                existing.indicative_psf_low = change.new_value
                            elif field == "indicative_psf_high":
                                existing.indicative_psf_high = change.new_value
                            elif hasattr(existing, field):
                                setattr(existing, field, change.new_value)

                    stats["updated"] += 1
                    stats["promoted"] += 1
                    logger.debug(f"Updated: {diff.entity_key} ({len(diff.changes)} fields)")

        self.db_session.commit()
        logger.info(f"Promotion complete: {stats}")
        return stats
