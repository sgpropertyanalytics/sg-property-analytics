"""
Verification API Routes

Endpoints for cross-validation against Tier B sources:
- POST /api/verification/run - Trigger verification run
- GET /api/verification/status/{run_id} - Check run status
- GET /api/verification/candidates - List pending candidates
- GET /api/verification/candidates/{id} - Get candidate details
- POST /api/verification/candidates/{id}/approve - Approve candidate
- POST /api/verification/candidates/{id}/reject - Reject candidate
- GET /api/verification/report/{run_id} - Get verification report
- GET /api/verification/summary - Aggregate verification stats
"""
from flask import Blueprint, request, jsonify, g
from models.database import db
from scrapers.models import VerificationCandidate, MIN_SOURCES_FOR_AUTO_CONFIRM
from services.verification_service import VerificationService
from utils.normalize import to_int, to_list, ValidationError, validation_error_response


verification_bp = Blueprint("verification", __name__)


def get_verification_service() -> VerificationService:
    """Get or create verification service instance."""
    if not hasattr(g, "verification_service"):
        from scrapers.adapters.propertyguru_verification import PropertyGuruVerificationAdapter
        from scrapers.adapters.edgeprop_verification import EdgePropVerificationAdapter
        from scrapers.adapters.ninety_nine_verification import NinetyNineVerificationAdapter
        from scrapers.adapters.era_verification import ERAVerificationAdapter
        from scrapers.adapters.propnex_verification import PropNexVerificationAdapter

        service = VerificationService(db.session)

        # Register all Tier B adapters
        service.register_adapter(PropertyGuruVerificationAdapter())
        service.register_adapter(EdgePropVerificationAdapter())
        service.register_adapter(NinetyNineVerificationAdapter())
        service.register_adapter(ERAVerificationAdapter())
        service.register_adapter(PropNexVerificationAdapter())

        g.verification_service = service

    return g.verification_service


# =============================================================================
# RUN ENDPOINTS
# =============================================================================

@verification_bp.route("/run", methods=["POST"])
def trigger_verification():
    """
    Trigger a verification run.

    Body params:
        entity_type: str - 'unit_count', 'upcoming_launch', 'gls_tender', 'project_location'
        project_names: Optional[List[str]] - Projects to verify (default: all)
        sources: Optional[List[str]] - Source domains to use (default: all)
        auto_confirm: bool - Whether to auto-confirm matching results (default: true)

    Returns:
        {run_id, entity_type, sources_used, summary, results}
    """
    data = request.get_json() or {}

    entity_type = data.get("entity_type")
    if not entity_type:
        return jsonify({"error": "entity_type is required"}), 400

    valid_types = ["unit_count", "upcoming_launch", "gls_tender", "project_location"]
    if entity_type not in valid_types:
        return jsonify({
            "error": f"Invalid entity_type. Must be one of: {valid_types}"
        }), 400

    project_names = data.get("project_names")
    sources = data.get("sources")
    auto_confirm = data.get("auto_confirm", True)

    try:
        service = get_verification_service()
        result = service.run_verification(
            entity_type=entity_type,
            project_names=project_names,
            sources=sources,
            auto_confirm=auto_confirm,
        )
        return jsonify(result)

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Verification failed: {str(e)}"}), 500


@verification_bp.route("/status/<run_id>", methods=["GET"])
def get_run_status(run_id: str):
    """
    Get status of a verification run.

    Returns summary and list of candidates created by the run.
    """
    candidates = db.session.query(VerificationCandidate).filter_by(
        run_id=run_id
    ).all()

    if not candidates:
        return jsonify({"error": f"Run {run_id} not found"}), 404

    # Calculate summary
    summary = {
        "run_id": run_id,
        "total": len(candidates),
        "confirmed": sum(1 for c in candidates if c.verification_status == "confirmed"),
        "mismatch": sum(1 for c in candidates if c.verification_status == "mismatch"),
        "unverified": sum(1 for c in candidates if c.verification_status == "unverified"),
        "conflict": sum(1 for c in candidates if c.verification_status == "conflict"),
        "auto_confirmed": sum(1 for c in candidates if c.review_status == "auto_confirmed"),
        "pending_review": sum(1 for c in candidates if c.review_status == "open"),
    }

    return jsonify({
        "summary": summary,
        "candidates": [c.to_summary_dict() for c in candidates],
    })


# =============================================================================
# CANDIDATE ENDPOINTS
# =============================================================================

@verification_bp.route("/candidates", methods=["GET"])
def list_candidates():
    """
    List verification candidates pending review.

    Query params:
        entity_type: Filter by entity type
        verification_status: 'confirmed', 'mismatch', 'pending', 'unverified', 'conflict'
        review_status: 'open', 'approved', 'rejected', 'auto_confirmed', 'deferred'
        run_id: Filter by run
        limit: Max results (default: 50)
        offset: Pagination offset (default: 0)
    """
    try:
        entity_type = request.args.get("entity_type")
        verification_status = request.args.get("verification_status")
        review_status = request.args.get("review_status", "open")
        run_id = request.args.get("run_id")
        limit = to_int(request.args.get("limit"), default=50, field="limit")
        offset = to_int(request.args.get("offset"), default=0, field="offset")
    except ValidationError as e:
        return validation_error_response(e)

    query = db.session.query(VerificationCandidate)

    if entity_type:
        query = query.filter(VerificationCandidate.entity_type == entity_type)
    if verification_status:
        query = query.filter(VerificationCandidate.verification_status == verification_status)
    if review_status:
        query = query.filter(VerificationCandidate.review_status == review_status)
    if run_id:
        query = query.filter(VerificationCandidate.run_id == run_id)

    total = query.count()
    candidates = query.order_by(
        VerificationCandidate.confidence_score.desc(),
        VerificationCandidate.verified_at.desc(),
    ).offset(offset).limit(limit).all()

    return jsonify({
        "total": total,
        "limit": limit,
        "offset": offset,
        "candidates": [c.to_dict() for c in candidates],
    })


@verification_bp.route("/candidates/<int:candidate_id>", methods=["GET"])
def get_candidate(candidate_id: int):
    """
    Get details of a specific verification candidate.
    """
    candidate = db.session.query(VerificationCandidate).get(candidate_id)

    if not candidate:
        return jsonify({"error": f"Candidate {candidate_id} not found"}), 404

    return jsonify(candidate.to_dict())


@verification_bp.route("/candidates/<int:candidate_id>/approve", methods=["POST"])
def approve_candidate(candidate_id: int):
    """
    Approve a verification candidate.

    Body params:
        resolution: str - 'keep_current' or 'update_to_verified'
        reviewed_by: str - Reviewer identifier
        notes: Optional[str] - Review notes
    """
    data = request.get_json() or {}

    resolution = data.get("resolution")
    if resolution not in ("keep_current", "update_to_verified"):
        return jsonify({
            "error": "resolution must be 'keep_current' or 'update_to_verified'"
        }), 400

    reviewed_by = data.get("reviewed_by")
    if not reviewed_by:
        return jsonify({"error": "reviewed_by is required"}), 400

    notes = data.get("notes")

    try:
        service = get_verification_service()
        candidate = service.approve_candidate(
            candidate_id=candidate_id,
            resolution=resolution,
            reviewed_by=reviewed_by,
            notes=notes,
        )
        return jsonify(candidate.to_dict())

    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": f"Approval failed: {str(e)}"}), 500


@verification_bp.route("/candidates/<int:candidate_id>/reject", methods=["POST"])
def reject_candidate(candidate_id: int):
    """
    Reject a verification candidate.

    Body params:
        reviewed_by: str - Reviewer identifier
        notes: Optional[str] - Rejection reason
    """
    data = request.get_json() or {}

    reviewed_by = data.get("reviewed_by")
    if not reviewed_by:
        return jsonify({"error": "reviewed_by is required"}), 400

    notes = data.get("notes")

    try:
        service = get_verification_service()
        candidate = service.reject_candidate(
            candidate_id=candidate_id,
            reviewed_by=reviewed_by,
            notes=notes,
        )
        return jsonify(candidate.to_dict())

    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": f"Rejection failed: {str(e)}"}), 500


# =============================================================================
# REPORT ENDPOINTS
# =============================================================================

@verification_bp.route("/report/<run_id>", methods=["GET"])
def get_report(run_id: str):
    """
    Get verification report for a run.

    Query params:
        format: 'json' or 'markdown' (default: json)
    """
    from services.verification_report import generate_report, generate_markdown_report

    format_type = request.args.get("format", "json")

    try:
        if format_type == "markdown":
            report = generate_markdown_report(run_id)
            return report, 200, {"Content-Type": "text/markdown"}
        else:
            report = generate_report(run_id)
            return jsonify(report)

    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": f"Report generation failed: {str(e)}"}), 500


@verification_bp.route("/summary", methods=["GET"])
def get_summary():
    """
    Get aggregate verification statistics.

    Query params:
        entity_type: Optional filter by entity type
    """
    entity_type = request.args.get("entity_type")

    query = db.session.query(VerificationCandidate)

    if entity_type:
        query = query.filter(VerificationCandidate.entity_type == entity_type)

    candidates = query.all()

    if not candidates:
        return jsonify({
            "total": 0,
            "by_status": {},
            "by_review_status": {},
            "avg_confidence": None,
            "auto_confirm_rate": None,
        })

    # Calculate statistics
    by_status = {}
    by_review_status = {}
    confidence_scores = []

    for c in candidates:
        by_status[c.verification_status] = by_status.get(c.verification_status, 0) + 1
        by_review_status[c.review_status] = by_review_status.get(c.review_status, 0) + 1
        if c.confidence_score:
            confidence_scores.append(float(c.confidence_score))

    avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else None
    auto_confirmed = by_review_status.get("auto_confirmed", 0)
    total = len(candidates)
    auto_confirm_rate = auto_confirmed / total if total > 0 else 0

    return jsonify({
        "total": total,
        "by_status": by_status,
        "by_review_status": by_review_status,
        "avg_confidence": round(avg_confidence, 4) if avg_confidence else None,
        "auto_confirm_rate": round(auto_confirm_rate, 4),
        "min_sources_for_auto_confirm": MIN_SOURCES_FOR_AUTO_CONFIRM,
    })


# =============================================================================
# UTILITY ENDPOINTS
# =============================================================================

@verification_bp.route("/sources", methods=["GET"])
def list_sources():
    """
    List available verification sources (Tier B adapters).
    """
    service = get_verification_service()
    return jsonify({
        "sources": service.get_registered_adapters(),
        "min_sources_for_auto_confirm": MIN_SOURCES_FOR_AUTO_CONFIRM,
    })
