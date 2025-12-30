"""
Verification Report Generator

Generates structured reports from verification runs:
1. Summary statistics
2. Confidence distribution
3. Mismatch breakdown by entity type
4. Source coverage analysis
5. Recommended actions
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from models.database import db
from scrapers.models import VerificationCandidate, MIN_SOURCES_FOR_AUTO_CONFIRM


def generate_report(run_id: str) -> Dict[str, Any]:
    """
    Generate a JSON verification report for a run.

    Args:
        run_id: Verification run ID

    Returns:
        Dict with summary, candidates, and recommendations
    """
    candidates = db.session.query(VerificationCandidate).filter_by(
        run_id=run_id
    ).order_by(
        VerificationCandidate.confidence_score.desc()
    ).all()

    if not candidates:
        raise ValueError(f"No verification results found for run_id: {run_id}")

    # Summary statistics
    summary = _calculate_summary(candidates)

    # Confidence distribution
    confidence_dist = _calculate_confidence_distribution(candidates)

    # Status breakdown
    status_breakdown = _calculate_status_breakdown(candidates)

    # Source coverage
    source_coverage = _calculate_source_coverage(candidates)

    # Top issues (mismatches and conflicts)
    top_issues = _get_top_issues(candidates)

    # Recommendations
    recommendations = _generate_recommendations(candidates, summary)

    return {
        "run_id": run_id,
        "generated_at": datetime.utcnow().isoformat(),
        "summary": summary,
        "confidence_distribution": confidence_dist,
        "status_breakdown": status_breakdown,
        "source_coverage": source_coverage,
        "top_issues": top_issues,
        "recommendations": recommendations,
        "min_sources_for_auto_confirm": MIN_SOURCES_FOR_AUTO_CONFIRM,
    }


def generate_markdown_report(run_id: str) -> str:
    """
    Generate a markdown verification report.

    Args:
        run_id: Verification run ID

    Returns:
        Markdown formatted report string
    """
    report = generate_report(run_id)

    lines = []

    # Header
    lines.append("# Verification Report")
    lines.append("")
    lines.append(f"**Run ID:** `{run_id}`")
    lines.append(f"**Generated:** {report['generated_at']}")
    lines.append("")

    # Summary
    summary = report["summary"]
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- **Total Projects Verified:** {summary['total']}")
    lines.append(f"- **Confirmed:** {summary['confirmed']} ({_pct(summary['confirmed'], summary['total'])})")
    lines.append(f"- **Mismatch:** {summary['mismatch']} ({_pct(summary['mismatch'], summary['total'])})")
    lines.append(f"- **Unverified:** {summary['unverified']} ({_pct(summary['unverified'], summary['total'])})")
    lines.append(f"- **Conflict:** {summary['conflict']} ({_pct(summary['conflict'], summary['total'])})")
    lines.append("")
    lines.append(f"- **Auto-Confirmed:** {summary['auto_confirmed']}")
    lines.append(f"- **Pending Review:** {summary['pending_review']}")
    lines.append(f"- **Average Confidence:** {summary['avg_confidence']:.2%}" if summary['avg_confidence'] else "")
    lines.append("")

    # Status Legend
    lines.append("### Status Legend")
    lines.append("")
    lines.append("| Symbol | Status | Description |")
    lines.append("|--------|--------|-------------|")
    lines.append("| ✅ | Confirmed | Verified value matches current value |")
    lines.append("| ⚠️ | Mismatch | Verified value differs from current |")
    lines.append("| 🟨 | Unverified | Insufficient sources (< 3) |")
    lines.append("| ‼️ | Conflict | Sources disagree with each other |")
    lines.append("")

    # Top Issues Table
    top_issues = report["top_issues"]
    if top_issues:
        lines.append("## Top Issues")
        lines.append("")
        lines.append("| Project | Current | Verified | Sources | Confidence | Action |")
        lines.append("|---------|---------|----------|---------|------------|--------|")

        for issue in top_issues[:15]:
            status_icon = _get_status_icon(issue["verification_status"])
            current = _format_value(issue.get("current_value", {}))
            verified = _format_value(issue.get("verified_value", {}))
            sources = issue.get("agreeing_source_count", 0)
            total = issue.get("total_source_count", 0)
            confidence = issue.get("confidence_score", 0)
            action = issue.get("recommended_action", "REVIEW").upper()

            lines.append(
                f"| {status_icon} {issue['entity_key'][:30]} | {current} | {verified} | "
                f"{sources}/{total} | {confidence:.0%} | {action} |"
            )

        lines.append("")

    # Source Coverage
    source_coverage = report["source_coverage"]
    if source_coverage:
        lines.append("## Source Coverage")
        lines.append("")
        lines.append("| Source | Found | Not Found | Error | Coverage |")
        lines.append("|--------|-------|-----------|-------|----------|")

        for source, stats in source_coverage.items():
            total = stats.get("found", 0) + stats.get("not_found", 0) + stats.get("error", 0)
            coverage = stats.get("found", 0) / total if total > 0 else 0
            lines.append(
                f"| {source} | {stats.get('found', 0)} | {stats.get('not_found', 0)} | "
                f"{stats.get('error', 0)} | {coverage:.0%} |"
            )

        lines.append("")

    # Recommendations
    recommendations = report["recommendations"]
    if recommendations:
        lines.append("## Recommendations")
        lines.append("")
        for i, rec in enumerate(recommendations, 1):
            lines.append(f"{i}. {rec}")
        lines.append("")

    # Footer
    lines.append("---")
    lines.append(f"*Minimum sources for auto-confirm: {MIN_SOURCES_FOR_AUTO_CONFIRM}*")

    return "\n".join(lines)


def _calculate_summary(candidates: List[VerificationCandidate]) -> Dict[str, Any]:
    """Calculate summary statistics."""
    total = len(candidates)
    confirmed = sum(1 for c in candidates if c.verification_status == "confirmed")
    mismatch = sum(1 for c in candidates if c.verification_status == "mismatch")
    unverified = sum(1 for c in candidates if c.verification_status == "unverified")
    conflict = sum(1 for c in candidates if c.verification_status == "conflict")
    auto_confirmed = sum(1 for c in candidates if c.review_status == "auto_confirmed")
    pending_review = sum(1 for c in candidates if c.review_status == "open")

    confidence_scores = [float(c.confidence_score) for c in candidates if c.confidence_score]
    avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else None

    return {
        "total": total,
        "confirmed": confirmed,
        "mismatch": mismatch,
        "unverified": unverified,
        "conflict": conflict,
        "auto_confirmed": auto_confirmed,
        "pending_review": pending_review,
        "avg_confidence": avg_confidence,
    }


def _calculate_confidence_distribution(candidates: List[VerificationCandidate]) -> Dict[str, int]:
    """Calculate confidence score distribution."""
    dist = {
        "high_90_100": 0,
        "medium_70_90": 0,
        "low_50_70": 0,
        "very_low_0_50": 0,
    }

    for c in candidates:
        if c.confidence_score:
            score = float(c.confidence_score)
            if score >= 0.9:
                dist["high_90_100"] += 1
            elif score >= 0.7:
                dist["medium_70_90"] += 1
            elif score >= 0.5:
                dist["low_50_70"] += 1
            else:
                dist["very_low_0_50"] += 1

    return dist


def _calculate_status_breakdown(candidates: List[VerificationCandidate]) -> Dict[str, Dict[str, int]]:
    """Calculate status breakdown by entity type."""
    breakdown = {}

    for c in candidates:
        if c.entity_type not in breakdown:
            breakdown[c.entity_type] = {
                "confirmed": 0,
                "mismatch": 0,
                "unverified": 0,
                "conflict": 0,
            }

        status = c.verification_status
        if status in breakdown[c.entity_type]:
            breakdown[c.entity_type][status] += 1

    return breakdown


def _calculate_source_coverage(candidates: List[VerificationCandidate]) -> Dict[str, Dict[str, int]]:
    """Calculate coverage by source domain."""
    coverage = {}

    for c in candidates:
        if c.verified_sources:
            for source_info in c.verified_sources:
                source = source_info.get("source_domain") or source_info.get("source", "unknown")
                if source not in coverage:
                    coverage[source] = {"found": 0, "not_found": 0, "error": 0}

                if source_info.get("found", True) and not source_info.get("error"):
                    coverage[source]["found"] += 1
                elif source_info.get("error"):
                    coverage[source]["error"] += 1
                else:
                    coverage[source]["not_found"] += 1

    return coverage


def _get_top_issues(candidates: List[VerificationCandidate], limit: int = 20) -> List[Dict[str, Any]]:
    """Get top issues requiring attention."""
    # Filter to mismatches and conflicts
    issues = [
        c for c in candidates
        if c.verification_status in ("mismatch", "conflict")
        and c.review_status == "open"
    ]

    # Sort by confidence descending (higher confidence mismatches are more concerning)
    issues.sort(key=lambda c: float(c.confidence_score or 0), reverse=True)

    return [
        {
            "id": c.id,
            "entity_type": c.entity_type,
            "entity_key": c.entity_key,
            "verification_status": c.verification_status,
            "current_value": c.current_value,
            "verified_value": c.verified_value,
            "agreeing_source_count": c.agreeing_source_count,
            "total_source_count": c.total_source_count,
            "confidence_score": float(c.confidence_score) if c.confidence_score else 0,
            "field_mismatches": c.field_mismatches,
            "recommended_action": _get_recommended_action(c),
        }
        for c in issues[:limit]
    ]


def _generate_recommendations(
    candidates: List[VerificationCandidate],
    summary: Dict[str, Any],
) -> List[str]:
    """Generate actionable recommendations."""
    recommendations = []

    # High mismatch rate
    mismatch_rate = summary["mismatch"] / summary["total"] if summary["total"] > 0 else 0
    if mismatch_rate > 0.2:
        recommendations.append(
            f"High mismatch rate ({mismatch_rate:.0%}). Consider reviewing data sources for systematic issues."
        )

    # Low source coverage
    unverified_rate = summary["unverified"] / summary["total"] if summary["total"] > 0 else 0
    if unverified_rate > 0.3:
        recommendations.append(
            f"Low source coverage ({1 - unverified_rate:.0%}). {summary['unverified']} projects "
            "could not be verified by 3+ sources. Consider adding more verification sources."
        )

    # Pending reviews
    if summary["pending_review"] > 0:
        recommendations.append(
            f"{summary['pending_review']} candidates pending manual review. "
            "Prioritize high-confidence mismatches."
        )

    # Conflicts
    if summary["conflict"] > 0:
        recommendations.append(
            f"{summary['conflict']} candidates have conflicting source data. "
            "These require investigation to determine authoritative value."
        )

    # Good auto-confirm rate
    auto_rate = summary["auto_confirmed"] / summary["total"] if summary["total"] > 0 else 0
    if auto_rate > 0.5:
        recommendations.append(
            f"Good auto-confirm rate ({auto_rate:.0%}). "
            f"{summary['auto_confirmed']} projects verified with 3+ agreeing sources."
        )

    return recommendations


def _get_recommended_action(candidate: VerificationCandidate) -> str:
    """Get recommended action for a candidate."""
    if candidate.verification_status == "conflict":
        return "INVESTIGATE"
    elif candidate.verification_status == "mismatch":
        if candidate.confidence_score and float(candidate.confidence_score) >= 0.8:
            return "UPDATE"
        return "REVIEW"
    elif candidate.verification_status == "unverified":
        return "VERIFY"
    return "CONFIRM"


def _get_status_icon(status: str) -> str:
    """Get status icon for markdown."""
    icons = {
        "confirmed": "✅",
        "mismatch": "⚠️",
        "unverified": "🟨",
        "conflict": "‼️",
        "pending": "⏳",
    }
    return icons.get(status, "❓")


def _format_value(value: Dict[str, Any]) -> str:
    """Format a value dict for display."""
    if not value:
        return "-"

    # Try to get the most important field
    for key in ["total_units", "developer", "district"]:
        if key in value and value[key]:
            return str(value[key])

    # Fall back to first non-None value
    for v in value.values():
        if v is not None:
            return str(v)[:20]

    return "-"


def _pct(value: int, total: int) -> str:
    """Calculate percentage string."""
    if total == 0:
        return "0%"
    return f"{value / total:.0%}"
