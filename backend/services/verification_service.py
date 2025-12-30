"""
Verification Service - Cross-validates data against Tier B sources.

Orchestrates:
1. Loading current values from CSV/database
2. Fetching verification data from Tier B adapters
3. Computing comparison and confidence scores
4. Storing results in verification_candidates table
5. Generating verification reports

Key rule: Minimum 3 sources must agree for auto-confirmation.
"""
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Type

from models.database import db
from models.upcoming_launch import UpcomingLaunch
from models.gls_tender import GLSTender
from models.project_location import ProjectLocation
from scrapers.models import VerificationCandidate, MIN_SOURCES_FOR_AUTO_CONFIRM
from scrapers.adapters.verification_base import (
    BaseVerificationAdapter,
    VerificationResult,
)
from scrapers.utils.cross_validator import (
    cross_validate_project,
    CrossValidationResult,
    VerificationStatus,
    RecommendedAction,
    can_auto_confirm,
)


class VerificationService:
    """
    Service for cross-validating data against Tier B sources.

    Usage:
        service = VerificationService(db.session)
        service.register_adapter(PropertyGuruAdapter())
        service.register_adapter(EdgePropAdapter())

        result = service.run_verification(
            entity_type='unit_count',
            project_names=['THE INTERLACE', 'D\'LEEDON'],
        )
    """

    def __init__(self, db_session):
        """
        Initialize verification service.

        Args:
            db_session: SQLAlchemy database session
        """
        self.db_session = db_session
        self._adapters: List[BaseVerificationAdapter] = []
        self._run_id: Optional[str] = None

    def register_adapter(self, adapter: BaseVerificationAdapter):
        """
        Register a verification adapter.

        Args:
            adapter: Verification adapter instance
        """
        self._adapters.append(adapter)

    def get_registered_adapters(self) -> List[str]:
        """Get list of registered adapter domains."""
        return [a.SOURCE_DOMAIN for a in self._adapters]

    # =========================================================================
    # MAIN VERIFICATION METHODS
    # =========================================================================

    def run_verification(
        self,
        entity_type: str,
        project_names: Optional[List[str]] = None,
        sources: Optional[List[str]] = None,
        auto_confirm: bool = True,
    ) -> Dict[str, Any]:
        """
        Run verification for a set of projects.

        Args:
            entity_type: Type of entity to verify ('unit_count', 'upcoming_launch', etc.)
            project_names: List of project names to verify (None = all projects)
            sources: List of source domains to use (None = all registered adapters)
            auto_confirm: Whether to auto-confirm results meeting criteria

        Returns:
            Dict with run_id, summary, and results
        """
        # Generate run ID
        self._run_id = str(uuid.uuid4())

        # Get project names if not provided
        if project_names is None:
            project_names = self._get_all_project_names(entity_type)

        # Filter adapters if sources specified
        adapters = self._adapters
        if sources:
            adapters = [a for a in adapters if a.SOURCE_DOMAIN in sources]

        if not adapters:
            raise ValueError("No verification adapters registered or matching sources")

        # Process each project
        results = []
        summary = {
            "total": len(project_names),
            "confirmed": 0,
            "mismatch": 0,
            "unverified": 0,
            "conflict": 0,
            "auto_confirmed": 0,
            "review_required": 0,
        }

        for project_name in project_names:
            try:
                result = self.verify_project(
                    project_name=project_name,
                    entity_type=entity_type,
                    adapters=adapters,
                    auto_confirm=auto_confirm,
                )
                results.append(result)

                # Update summary
                status = result.get("verification_status")
                if status == "confirmed":
                    summary["confirmed"] += 1
                elif status == "mismatch":
                    summary["mismatch"] += 1
                elif status == "unverified":
                    summary["unverified"] += 1
                elif status == "conflict":
                    summary["conflict"] += 1

                if result.get("auto_confirmed"):
                    summary["auto_confirmed"] += 1
                else:
                    summary["review_required"] += 1

            except Exception as e:
                results.append({
                    "project_name": project_name,
                    "entity_type": entity_type,
                    "error": str(e),
                })
                summary["unverified"] += 1

        # Commit all results
        self.db_session.commit()

        return {
            "run_id": self._run_id,
            "entity_type": entity_type,
            "sources_used": [a.SOURCE_DOMAIN for a in adapters],
            "summary": summary,
            "results": results,
        }

    def verify_project(
        self,
        project_name: str,
        entity_type: str,
        adapters: Optional[List[BaseVerificationAdapter]] = None,
        auto_confirm: bool = True,
    ) -> Dict[str, Any]:
        """
        Verify a single project against Tier B sources.

        Args:
            project_name: Name of the project to verify
            entity_type: Type of entity
            adapters: List of adapters to use (None = all registered)
            auto_confirm: Whether to auto-confirm if criteria met

        Returns:
            Dict with verification result details
        """
        adapters = adapters or self._adapters

        # Get current value from our system
        current_data, current_source = self._get_current_value(project_name, entity_type)

        # Fetch verification data from each adapter
        verification_results = []
        for adapter in adapters:
            try:
                result = adapter.verify_project(project_name)
                verification_results.append(result)
            except Exception as e:
                # Log error but continue with other sources
                verification_results.append(
                    VerificationResult.error_result(
                        project_name=project_name,
                        source_domain=adapter.SOURCE_DOMAIN,
                        error=str(e),
                    )
                )

        # Cross-validate against current value
        cv_result = cross_validate_project(
            project_name=project_name,
            entity_type=entity_type,
            current_data=current_data,
            verification_results=verification_results,
        )

        # Store verification candidate
        candidate = self._store_verification_result(
            project_name=project_name,
            entity_type=entity_type,
            current_data=current_data,
            current_source=current_source,
            cv_result=cv_result,
            verification_results=verification_results,
        )

        # Attempt auto-confirm if enabled
        auto_confirmed = False
        if auto_confirm and candidate.can_auto_confirm():
            candidate.auto_confirm()
            self._update_domain_verification_status(
                entity_type=entity_type,
                entity_key=project_name,
                status="verified",
                run_id=self._run_id,
                sources=[r.source_domain for r in verification_results if r.found],
                confidence=cv_result.confidence_score,
            )
            auto_confirmed = True

        return {
            "project_name": project_name,
            "entity_type": entity_type,
            "verification_status": cv_result.verification_status.value,
            "confidence_score": cv_result.confidence_score,
            "agreeing_source_count": cv_result.agreeing_source_count,
            "total_source_count": cv_result.total_source_count,
            "recommended_action": cv_result.recommended_action.value,
            "auto_confirmed": auto_confirmed,
            "candidate_id": candidate.id,
            "has_mismatches": cv_result.has_mismatches,
            "mismatch_fields": cv_result.mismatch_fields,
        }

    # =========================================================================
    # DATA ACCESS METHODS
    # =========================================================================

    def _get_current_value(
        self,
        project_name: str,
        entity_type: str,
    ) -> tuple[Dict[str, Any], str]:
        """
        Get current value from our system.

        Args:
            project_name: Project name
            entity_type: Entity type

        Returns:
            Tuple of (current_data_dict, source_type)
        """
        if entity_type == "unit_count":
            return self._get_unit_count_data(project_name)
        elif entity_type == "upcoming_launch":
            return self._get_upcoming_launch_data(project_name)
        elif entity_type == "gls_tender":
            return self._get_gls_tender_data(project_name)
        elif entity_type == "project_location":
            return self._get_project_location_data(project_name)
        else:
            raise ValueError(f"Unknown entity type: {entity_type}")

    def _get_unit_count_data(self, project_name: str) -> tuple[Dict[str, Any], str]:
        """Get unit count data from 3-tier lookup."""
        from services.new_launch_units import lookup_project_units

        result = lookup_project_units(project_name)
        if result:
            return {
                "total_units": result.get("total_units"),
                "source": result.get("source"),
                "confidence": result.get("confidence"),
            }, result.get("source", "unknown")

        return {"total_units": None}, "unknown"

    def _get_upcoming_launch_data(self, project_name: str) -> tuple[Dict[str, Any], str]:
        """Get upcoming launch data from database."""
        launch = self.db_session.query(UpcomingLaunch).filter_by(
            project_name=project_name
        ).first()

        if launch:
            return {
                "total_units": launch.total_units,
                "developer": launch.developer,
                "district": launch.district,
                "tenure": launch.tenure,
                "indicative_psf_low": float(launch.indicative_psf_low) if launch.indicative_psf_low else None,
                "indicative_psf_high": float(launch.indicative_psf_high) if launch.indicative_psf_high else None,
                "launch_year": launch.launch_year,
                "market_segment": launch.market_segment,
            }, "database"

        return {}, "unknown"

    def _get_gls_tender_data(self, release_id: str) -> tuple[Dict[str, Any], str]:
        """Get GLS tender data from database."""
        tender = self.db_session.query(GLSTender).filter_by(
            release_id=release_id
        ).first()

        if tender:
            return {
                "estimated_units": tender.estimated_units,
                "location_raw": tender.location_raw,
                "postal_district": tender.postal_district,
                "market_segment": tender.market_segment,
                "tendered_price_sgd": float(tender.tendered_price_sgd) if tender.tendered_price_sgd else None,
                "psf_ppr": float(tender.psf_ppr) if tender.psf_ppr else None,
            }, "database"

        return {}, "unknown"

    def _get_project_location_data(self, project_name: str) -> tuple[Dict[str, Any], str]:
        """Get project location data from database."""
        location = self.db_session.query(ProjectLocation).filter_by(
            project_name=project_name
        ).first()

        if location:
            return {
                "district": location.district,
                "market_segment": location.market_segment,
                "latitude": float(location.latitude) if location.latitude else None,
                "longitude": float(location.longitude) if location.longitude else None,
                "address": location.address,
                "postal_code": location.postal_code,
            }, "database"

        return {}, "unknown"

    def _get_all_project_names(self, entity_type: str) -> List[str]:
        """Get all project names for an entity type."""
        if entity_type in ("unit_count", "upcoming_launch"):
            launches = self.db_session.query(UpcomingLaunch.project_name).all()
            return [l.project_name for l in launches]
        elif entity_type == "project_location":
            locations = self.db_session.query(ProjectLocation.project_name).all()
            return [l.project_name for l in locations]
        elif entity_type == "gls_tender":
            tenders = self.db_session.query(GLSTender.release_id).all()
            return [t.release_id for t in tenders]
        else:
            return []

    # =========================================================================
    # STORAGE METHODS
    # =========================================================================

    def _store_verification_result(
        self,
        project_name: str,
        entity_type: str,
        current_data: Dict[str, Any],
        current_source: str,
        cv_result: CrossValidationResult,
        verification_results: List[VerificationResult],
    ) -> VerificationCandidate:
        """
        Store a verification result in the candidates table.

        Args:
            project_name: Project name
            entity_type: Entity type
            current_data: Current data from our system
            current_source: Source of current data
            cv_result: CrossValidationResult
            verification_results: Raw verification results

        Returns:
            VerificationCandidate model instance
        """
        # Build verified_value from consensus
        verified_value = {}
        for field_result in cv_result.field_results:
            if field_result.verified_value is not None:
                verified_value[field_result.field_name] = field_result.verified_value

        # Build verified_sources list
        verified_sources = []
        for vr in verification_results:
            if vr.found and not vr.error:
                verified_sources.append(vr.to_dict())

        # Build field_mismatches list
        field_mismatches = []
        for fr in cv_result.field_results:
            if fr.is_mismatch:
                field_mismatches.append(fr.to_dict())

        # Create or update candidate
        candidate = VerificationCandidate(
            entity_type=entity_type,
            entity_key=project_name,
            current_value=current_data,
            current_source=current_source,
            verified_value=verified_value,
            verified_sources=verified_sources,
            agreeing_source_count=cv_result.agreeing_source_count,
            total_source_count=cv_result.total_source_count,
            verification_status=cv_result.verification_status.value,
            confidence_score=cv_result.confidence_score,
            field_mismatches=field_mismatches if field_mismatches else None,
            run_id=self._run_id,
        )

        self.db_session.add(candidate)
        return candidate

    def _update_domain_verification_status(
        self,
        entity_type: str,
        entity_key: str,
        status: str,
        run_id: str,
        sources: List[str],
        confidence: float,
    ):
        """
        Update verification status on the domain table.

        Args:
            entity_type: Entity type
            entity_key: Project name or release_id
            status: Verification status
            run_id: Verification run ID
            sources: List of source domains used
            confidence: Confidence score
        """
        if entity_type in ("unit_count", "upcoming_launch"):
            launch = self.db_session.query(UpcomingLaunch).filter_by(
                project_name=entity_key
            ).first()
            if launch:
                launch.verification_status = status
                launch.verified_at = datetime.utcnow()
                launch.verified_run_id = run_id
                launch.verified_sources = [{"source": s} for s in sources]
                launch.units_confidence_score = confidence
                launch.agreeing_source_count = len(sources)

        elif entity_type == "gls_tender":
            tender = self.db_session.query(GLSTender).filter_by(
                release_id=entity_key
            ).first()
            if tender:
                tender.verification_status = status
                tender.verified_at = datetime.utcnow()
                tender.verified_run_id = run_id
                tender.verified_sources = [{"source": s} for s in sources]

        elif entity_type == "project_location":
            location = self.db_session.query(ProjectLocation).filter_by(
                project_name=entity_key
            ).first()
            if location:
                location.verification_status = status
                location.verified_at = datetime.utcnow()
                location.verified_run_id = run_id
                location.verified_sources = [{"source": s} for s in sources]
                location.geocode_confidence = confidence

    # =========================================================================
    # CANDIDATE MANAGEMENT
    # =========================================================================

    def get_pending_candidates(
        self,
        entity_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[VerificationCandidate]:
        """
        Get pending verification candidates for review.

        Args:
            entity_type: Filter by entity type
            limit: Max results
            offset: Pagination offset

        Returns:
            List of VerificationCandidate objects
        """
        query = self.db_session.query(VerificationCandidate).filter(
            VerificationCandidate.review_status == "open"
        )

        if entity_type:
            query = query.filter(VerificationCandidate.entity_type == entity_type)

        return query.order_by(
            VerificationCandidate.confidence_score.desc()
        ).offset(offset).limit(limit).all()

    def approve_candidate(
        self,
        candidate_id: int,
        resolution: str,
        reviewed_by: str,
        notes: Optional[str] = None,
    ) -> VerificationCandidate:
        """
        Approve a verification candidate.

        Args:
            candidate_id: Candidate ID
            resolution: Resolution ('keep_current', 'update_to_verified')
            reviewed_by: Reviewer identifier
            notes: Optional review notes

        Returns:
            Updated VerificationCandidate
        """
        candidate = self.db_session.query(VerificationCandidate).get(candidate_id)
        if not candidate:
            raise ValueError(f"Candidate {candidate_id} not found")

        candidate.approve(reviewed_by=reviewed_by, resolution=resolution, notes=notes)

        # Update domain table if resolution is to update
        if resolution == "update_to_verified":
            self._apply_verified_value(candidate)

        self.db_session.commit()
        return candidate

    def reject_candidate(
        self,
        candidate_id: int,
        reviewed_by: str,
        notes: Optional[str] = None,
    ) -> VerificationCandidate:
        """
        Reject a verification candidate.

        Args:
            candidate_id: Candidate ID
            reviewed_by: Reviewer identifier
            notes: Optional review notes

        Returns:
            Updated VerificationCandidate
        """
        candidate = self.db_session.query(VerificationCandidate).get(candidate_id)
        if not candidate:
            raise ValueError(f"Candidate {candidate_id} not found")

        candidate.reject(reviewed_by=reviewed_by, notes=notes)
        self.db_session.commit()
        return candidate

    def _apply_verified_value(self, candidate: VerificationCandidate):
        """Apply the verified value to the domain table."""
        if candidate.entity_type in ("unit_count", "upcoming_launch"):
            launch = self.db_session.query(UpcomingLaunch).filter_by(
                project_name=candidate.entity_key
            ).first()
            if launch and candidate.verified_value:
                for field, value in candidate.verified_value.items():
                    if hasattr(launch, field) and value is not None:
                        setattr(launch, field, value)
                launch.verification_status = "verified"
                launch.verified_at = datetime.utcnow()

        # Add similar logic for other entity types as needed
