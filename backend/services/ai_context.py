"""
AI Context Assembly Service

Assembles structured context for the AI agent based on context type.
Supports both chart-specific interpretation and Argus project analysis.
Implements chunked retrieval to avoid token bloat.

Design principles:
1. Conceptual knowledge (static) != Volatile data (snapshot)
2. Select relevant sections per context type
3. Include version metadata for caching and freshness display

Context types:
- Chart types (absolute_psf, beads, etc.): Single chart interpretation
- Argus: Comprehensive project/unit analysis using all relevant context
"""

import json
import hashlib
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Base path for AI context documents
AI_CONTEXT_DIR = Path(__file__).parent.parent.parent / "docs" / "ai-context"


@dataclass
class ContextBundle:
    """Structured inputs for the agent - not a giant concatenated string."""
    chart_type: str
    chart_title: str
    chart_payload: dict
    filters: dict
    static_snippets: list = field(default_factory=list)
    snapshot_snippets: list = field(default_factory=list)
    versions: dict = field(default_factory=dict)

    def cache_key(self) -> str:
        """Generate cache key for this context bundle."""
        payload_hash = hashlib.md5(
            json.dumps(self.chart_payload, sort_keys=True, default=str).encode()
        ).hexdigest()[:8]
        filter_hash = hashlib.md5(
            json.dumps(self.filters, sort_keys=True, default=str).encode()
        ).hexdigest()[:8]
        snapshot_version = self.versions.get("snapshot_version", "unknown")
        return f"ai:interpret:{self.chart_type}:{snapshot_version}:{payload_hash}:{filter_hash}"


class PropertyContext:
    """
    Context assembly for Singapore property market AI agent.

    Loads and assembles relevant context documents based on chart type.
    """

    # Context type to static document mapping
    # All context types get definitions.md at minimum
    STATIC_MAPPINGS = {
        # Time series charts
        "absolute_psf": ["definitions.md", "district-mapping.md", "reasoning-guide.md"],
        "time_trend": ["definitions.md", "reasoning-guide.md"],
        # Distribution & scatter charts
        "price_distribution": ["definitions.md", "reasoning-guide.md"],
        "beads": ["definitions.md", "reasoning-guide.md"],
        # Comparison charts
        "district_comparison": ["definitions.md", "district-mapping.md", "reasoning-guide.md"],
        "new_vs_resale": ["definitions.md", "reasoning-guide.md"],
        # Heatmap charts
        "budget_heatmap": ["definitions.md", "reasoning-guide.md"],
        "floor_liquidity": ["definitions.md", "reasoning-guide.md"],
        # Dumbbell charts
        "growth_dumbbell": ["definitions.md", "district-mapping.md", "reasoning-guide.md"],
        # Price analysis charts
        "price_band": ["definitions.md", "reasoning-guide.md"],
        "price_compression": ["definitions.md", "district-mapping.md", "reasoning-guide.md"],
        "price_growth": ["definitions.md", "reasoning-guide.md"],
        # Supply & market charts
        "supply_waterfall": ["definitions.md", "reasoning-guide.md"],
        "market_oscillator": ["definitions.md", "market-cycles.md", "reasoning-guide.md"],
        "new_launch_timeline": ["definitions.md", "reasoning-guide.md"],
        # Matrix/Grid charts
        "price_range_matrix": ["definitions.md", "reasoning-guide.md"],
        "market_momentum": ["definitions.md", "district-mapping.md", "reasoning-guide.md"],

        # Argus - comprehensive project/unit analysis
        # Gets ALL static docs for full context
        "argus": [
            "definitions.md",
            "district-mapping.md",
            "market-cycles.md",
            "reasoning-guide.md",
        ],
    }

    # Context types that need policy context (involve pricing/affordability)
    NEEDS_POLICY = {
        "absolute_psf", "price_distribution", "beads", "time_trend",
        "price_compression", "market_oscillator", "price_band",
        "price_growth", "price_range_matrix", "new_vs_resale",
        "budget_heatmap", "growth_dumbbell",
        "argus",  # Argus needs full policy context for unit analysis
    }

    # Context types that need demographics context (involve buyer profiles/demand)
    NEEDS_DEMOGRAPHICS = {
        "budget_heatmap", "district_comparison", "new_vs_resale",
        "market_momentum", "new_launch_timeline", "supply_waterfall",
        "price_compression", "growth_dumbbell",
        "argus",  # Argus needs demographics for buyer pool assessment
    }

    # Context types that need interest rate context (involve affordability/financing)
    NEEDS_INTEREST_RATES = {
        "absolute_psf", "time_trend", "price_distribution",
        "price_band", "price_range_matrix", "budget_heatmap",
        "market_oscillator", "new_vs_resale",
        "argus",  # Argus needs rates for affordability analysis
    }

    # Context types that need economic indicators (market-wide trends)
    NEEDS_ECONOMIC_INDICATORS = {
        "time_trend", "market_oscillator", "price_growth",
        "supply_waterfall", "market_momentum", "new_vs_resale",
        "growth_dumbbell", "new_launch_timeline",
        "argus",  # Argus needs economic context for market positioning
    }

    def __init__(self, context_dir: Optional[Path] = None):
        self.context_dir = context_dir or AI_CONTEXT_DIR
        self._manifest = None

    @property
    def manifest(self) -> dict:
        """Load and cache manifest.json."""
        if self._manifest is None:
            manifest_path = self.context_dir / "manifest.json"
            if manifest_path.exists():
                with open(manifest_path, "r") as f:
                    self._manifest = json.load(f)
            else:
                logger.warning(f"Manifest not found at {manifest_path}")
                self._manifest = {}
        return self._manifest

    def _load_file(self, relative_path: str) -> Optional[str]:
        """Load a context file by relative path."""
        file_path = self.context_dir / relative_path
        if not file_path.exists():
            logger.warning(f"Context file not found: {file_path}")
            return None
        try:
            with open(file_path, "r") as f:
                return f.read()
        except Exception as e:
            logger.error(f"Error loading {file_path}: {e}")
            return None

    def _load_section(self, file_path: str, section: Optional[str] = None) -> Optional[str]:
        """
        Load a file or specific section from a file.

        Args:
            file_path: Relative path to the file
            section: Optional heading to extract (e.g., "## Time Series Charts")

        Returns:
            File content or section content
        """
        content = self._load_file(file_path)
        if content is None or section is None:
            return content

        # Extract section by heading
        lines = content.split("\n")
        in_section = False
        section_lines = []
        section_level = section.count("#")

        for line in lines:
            if line.strip().startswith("#"):
                current_level = len(line) - len(line.lstrip("#"))
                if section.lower() in line.lower():
                    in_section = True
                    section_lines.append(line)
                elif in_section and current_level <= section_level:
                    break
            elif in_section:
                section_lines.append(line)

        return "\n".join(section_lines) if section_lines else None

    def get_relevant_static(self, context_type: str) -> list:
        """
        Get relevant static context snippets for a context type.

        For chart types: Returns only the sections relevant to the specific chart.
        For Argus: Returns full documents for comprehensive analysis.
        """
        snippets = []

        # Get mapped files for this context type
        static_files = self.STATIC_MAPPINGS.get(context_type, ["definitions.md"])

        # Argus gets full documents for comprehensive analysis
        is_argus = context_type == "argus"

        for file_name in static_files:
            file_path = f"static/{file_name}"
            file_meta = self.manifest.get("files", {}).get(file_path, {})
            injection_rule = file_meta.get("injection", "always")

            # Argus always loads full documents
            if is_argus or injection_rule == "always":
                content = self._load_file(file_path)
                if content:
                    snippets.append(f"# {file_name}\n{content}")

            elif injection_rule == "always_trimmed":
                # Load summary only (first section or table)
                content = self._load_file(file_path)
                if content:
                    # Take first ~50 lines as summary
                    lines = content.split("\n")[:50]
                    snippets.append(f"# {file_name} (summary)\n" + "\n".join(lines))

            elif injection_rule == "relevant_section":
                # Load section matching chart type from reasoning-guide.md
                section_map = {
                    # Time series
                    "time_trend": "## Time Series Charts",
                    "absolute_psf": "## Time Series Charts",
                    # Distribution
                    "price_distribution": "## Distribution Charts",
                    # Scatter
                    "beads": "## Beads Charts",
                    # Comparison
                    "district_comparison": "## Comparison Charts",
                    "new_vs_resale": "## Comparison Charts",
                    # Heatmaps
                    "budget_heatmap": "## Heatmap Charts",
                    "floor_liquidity": "## Heatmap Charts",
                    # Dumbbell
                    "growth_dumbbell": "## Dumbbell Charts",
                    # Price analysis
                    "price_band": "## Price Band Charts",
                    "price_compression": "## Price Compression Charts",
                    "price_growth": "## Growth Charts",
                    # Supply & market
                    "supply_waterfall": "## Waterfall Charts",
                    "market_oscillator": "## Oscillator Charts",
                    "new_launch_timeline": "## Timeline Charts",
                    # Matrix/Grid
                    "price_range_matrix": "## Matrix/Grid Charts",
                    "market_momentum": "## Matrix/Grid Charts",
                }
                section = section_map.get(context_type)
                content = self._load_section(file_path, section)
                if content:
                    snippets.append(content)

        return snippets

    def get_relevant_snapshot(self, context_type: str) -> list:
        """
        Get relevant snapshot (volatile) context with freshness metadata.

        Always includes market snapshot header.
        Conditionally includes based on context type:
        - Policy: when context involves pricing/affordability
        - Demographics: when context involves buyer profiles/demand
        - Interest rates: when context involves financing
        - Economic indicators: when context involves market trends

        For Argus: includes ALL snapshot context for comprehensive analysis.
        """
        snippets = []

        # Argus gets full market snapshot, charts get header only
        is_argus = context_type == "argus"

        # Include market snapshot
        market_snapshot = self._load_file("snapshot/market-snapshot.md")
        if market_snapshot:
            if is_argus:
                # Argus gets full market snapshot
                snippets.append("# Market Context\n" + market_snapshot)
            else:
                # Charts get header section only (first 30 lines)
                lines = market_snapshot.split("\n")[:30]
                snippets.append("# Market Context\n" + "\n".join(lines))

        # Include policy measures for pricing-related contexts
        if context_type in self.NEEDS_POLICY:
            policy = self._load_file("snapshot/policy-measures.md")
            if policy:
                snippets.append("# Policy Measures\n" + policy)

        # Include demographics for buyer-profile-related contexts
        if context_type in self.NEEDS_DEMOGRAPHICS:
            demographics = self._load_file("snapshot/demographics.md")
            if demographics:
                snippets.append("# Demographics & Buyer Profiles\n" + demographics)

        # Include interest rate context for affordability-related contexts
        if context_type in self.NEEDS_INTEREST_RATES:
            interest_rates = self._load_file("snapshot/interest-rates.md")
            if interest_rates:
                snippets.append("# Interest Rates & Affordability\n" + interest_rates)

        # Include economic indicators for market-wide trend contexts
        if context_type in self.NEEDS_ECONOMIC_INDICATORS:
            economic = self._load_file("snapshot/economic-indicators.md")
            if economic:
                snippets.append("# Economic Indicators\n" + economic)

        return snippets

    def get_versions(self) -> dict:
        """
        Get version metadata for caching and freshness display.

        Returns:
            dict with snapshot_version, policy_version, data_watermark
        """
        files = self.manifest.get("files", {})

        # Get snapshot version from market-snapshot
        snapshot_meta = files.get("snapshot/market-snapshot.md", {})
        snapshot_version = snapshot_meta.get("updated_at", "unknown")

        # Get policy version from policy-measures
        policy_meta = files.get("snapshot/policy-measures.md", {})
        policy_version = policy_meta.get("updated_at", "unknown")

        # Data watermark would come from database - placeholder for now
        # TODO: Query latest transaction date from DB
        data_watermark = snapshot_version

        return {
            "snapshot_version": snapshot_version,
            "policy_version": policy_version,
            "data_watermark": data_watermark,
        }

    def assemble(
        self,
        chart_type: str,
        chart_title: str,
        chart_data: dict,
        filters: dict,
        kpis: Optional[dict] = None
    ) -> ContextBundle:
        """
        Assemble complete context bundle for AI interpretation.

        Args:
            chart_type: Type of chart (e.g., 'absolute_psf', 'beads')
            chart_title: Display title of the chart
            chart_data: The data payload from the chart
            filters: Active filters applied to the chart
            kpis: Optional KPI values displayed with the chart

        Returns:
            ContextBundle ready for AI consumption
        """
        # Build chart payload with optional KPIs
        payload = {
            "data": chart_data,
            "filters": filters,
        }
        if kpis:
            payload["kpis"] = kpis

        return ContextBundle(
            chart_type=chart_type,
            chart_title=chart_title,
            chart_payload=payload,
            filters=filters,
            static_snippets=self.get_relevant_static(chart_type),
            snapshot_snippets=self.get_relevant_snapshot(chart_type),
            versions=self.get_versions(),
        )


# Module-level singleton for convenience
_context_service: Optional[PropertyContext] = None


def get_context_service() -> PropertyContext:
    """Get the singleton PropertyContext instance."""
    global _context_service
    if _context_service is None:
        _context_service = PropertyContext()
    return _context_service
