"""
AI Service - Claude Streaming for Chart Interpretation

Handles communication with Anthropic Claude API for chart interpretation.
Implements SSE streaming for real-time response delivery.

Key features:
- Streaming token delivery for responsive UX
- Citation rules enforced via system prompt
- Response caching with version-aware keys
"""

import json
import logging
import hashlib
from typing import Generator, Optional
from dataclasses import dataclass

from config import Config
from services.ai_context import ContextBundle, get_context_service

logger = logging.getLogger(__name__)


@dataclass
class StreamEvent:
    """Represents a single SSE event."""
    event_type: str  # 'meta', 'token', 'done', 'error'
    data: dict

    def to_sse(self) -> str:
        """Format as SSE data line."""
        return f"data: {json.dumps(self.data)}\n\n"


# System prompt with citation and freshness rules
SYSTEM_PROMPT = """You are a senior Singapore property market analyst with deep expertise in URA transaction data. You help buyers, investors, and agents make informed decisions.

## Your Expertise
- 15+ years analyzing Singapore private condo markets
- Deep knowledge of CCR/RCR/OCR dynamics and district nuances
- Expert at translating raw data into actionable investment insights
- Understand buyer psychology across different segments

## Response Structure (MANDATORY)
Structure EVERY response with these exact headers:

### 📊 At a Glance
One powerful sentence summarizing the key insight. Make it memorable and quotable.

### 🔍 What the Data Shows
2-3 bullet points describing the raw patterns in the data. Be specific with numbers.

### 💡 What This Means
2-3 bullet points interpreting WHY these patterns exist. Connect to market dynamics, buyer behavior, or policy effects.

### ⚡ Actionable Insight
1-2 specific, practical recommendations. Be bold but grounded.
- For BUYERS: What does this mean for your purchase decision?
- For INVESTORS: What opportunity or risk does this reveal?

### ⚠️ Important Context
One line noting sample size, time period, or key limitations.

## Quality Standards

**Be Specific, Not Generic:**
- BAD: "Prices have increased"
- GOOD: "3BR units appreciated 12% YoY, outpacing the district average of 8%"

**Connect to Singapore Context:**
- Reference districts by character (D09 prime, D15 East Coast lifestyle, D19 family-oriented)
- Note proximity to MRT lines, schools, or amenities when relevant
- Consider cooling measures impact on different buyer segments

**Show Comparative Insight:**
- Compare to district averages when available
- Note if patterns are typical or anomalous
- Reference market cycles if data spans multiple years

## Citation Rules (NON-NEGOTIABLE)

1. Policy claims MUST cite the provided snippet with date:
   ✓ "ABSD for foreigners is 60% (IRAS, effective 27 Apr 2023)"
   ✗ "ABSD is around 60%" (unsourced)

2. If no policy context provided, say: "Policy rates apply but specific rates were not provided in context"

3. Always reference data freshness: "Based on transactions through {date}"

## Confidence Calibration
- <30 transactions: "Limited sample - interpret with caution"
- 30-100 transactions: "Moderate sample size"
- >100 transactions: Can state patterns confidently

## What NOT to Do
- Never predict future prices
- Never recommend specific projects
- Never ignore the data to tell a story
- Never use generic filler phrases
"""


def _build_user_message(bundle: ContextBundle) -> str:
    """
    Build the user message from the context bundle.

    Structures the message with clear sections for the AI to parse.
    """
    parts = []

    # Chart info
    parts.append(f"## Chart: {bundle.chart_title}")
    parts.append(f"Chart Type: {bundle.chart_type}")

    # Filters
    if bundle.filters:
        filter_str = ", ".join(f"{k}={v}" for k, v in bundle.filters.items() if v)
        parts.append(f"Active Filters: {filter_str}")

    # Version metadata
    if bundle.versions:
        parts.append(f"\n## Data Freshness")
        parts.append(f"- Data through: {bundle.versions.get('data_watermark', 'unknown')}")
        parts.append(f"- Market context as of: {bundle.versions.get('snapshot_version', 'unknown')}")
        parts.append(f"- Policy rates as of: {bundle.versions.get('policy_version', 'unknown')}")

    # Static context
    if bundle.static_snippets:
        parts.append("\n## Reference Context")
        for snippet in bundle.static_snippets:
            parts.append(snippet)

    # Snapshot context
    if bundle.snapshot_snippets:
        parts.append("\n## Current Market Context")
        for snippet in bundle.snapshot_snippets:
            parts.append(snippet)

    # Chart data
    parts.append("\n## Chart Data")
    parts.append("```json")
    parts.append(json.dumps(bundle.chart_payload, indent=2, default=str))
    parts.append("```")

    # Instruction with chart-specific guidance
    parts.append("\n## Task")
    parts.append(f"Analyze this {bundle.chart_type} chart for a Singapore property buyer/investor.")
    parts.append("Follow the MANDATORY response structure with all 5 sections.")
    parts.append("Be specific with numbers from the data. Connect insights to Singapore market context.")

    # Add chart-specific focus hints
    chart_focus = {
        "budget_heatmap": "Focus on buyer preference patterns across segments and what drives these choices.",
        "floor_liquidity": "Focus on which floor levels sell faster and why - consider views, noise, pricing.",
        "beads": "Focus on price clustering, outliers, and what recent transactions signal.",
        "price_distribution": "Focus on where the market centers, spread tightness, and value zones.",
        "absolute_psf": "Focus on PSF trends over time and what's driving movement.",
        "time_trend": "Focus on trend direction, inflection points, and seasonal patterns.",
        "price_compression": "Focus on CCR/RCR/OCR spread dynamics and what compression signals.",
        "growth_dumbbell": "Focus on top/bottom performers and what differentiates them.",
        "price_band": "Focus on where current prices sit vs historical bands - floor support or premium risk.",
        "market_oscillator": "Focus on over/undervaluation signals and cycle positioning.",
        "supply_waterfall": "Focus on supply pipeline and absorption implications.",
        "new_launch_timeline": "Focus on launch timing, absorption rates, and market appetite.",
        "price_range_matrix": "Focus on fair value ranges and where specific inputs fall.",
        "market_momentum": "Focus on district-level momentum patterns and divergences.",
        "district_comparison": "Focus on relative value across districts and why gaps exist.",
        "new_vs_resale": "Focus on new sale premium dynamics and what justifies the spread.",
        "price_growth": "Focus on appreciation trajectory and comparison to benchmarks.",
    }
    if bundle.chart_type in chart_focus:
        parts.append(f"\n**Chart Focus:** {chart_focus[bundle.chart_type]}")

    return "\n".join(parts)


class AIService:
    """
    Service for AI-powered chart interpretation.

    Uses Anthropic Claude API with streaming for responsive UX.
    """

    def __init__(self):
        self._client = None
        self._context_service = get_context_service()

    @property
    def client(self):
        """Lazy initialization of Anthropic client."""
        if self._client is None:
            if not Config.ANTHROPIC_API_KEY:
                raise ValueError("ANTHROPIC_API_KEY not configured")

            try:
                import anthropic
                self._client = anthropic.Anthropic(api_key=Config.ANTHROPIC_API_KEY)
            except ImportError:
                raise ImportError("anthropic package not installed. Run: pip install anthropic>=0.49.0")

        return self._client

    def interpret_chart(
        self,
        chart_type: str,
        chart_title: str,
        chart_data: dict,
        filters: dict,
        kpis: Optional[dict] = None,
    ) -> Generator[StreamEvent, None, None]:
        """
        Interpret a chart using Claude and stream the response.

        Args:
            chart_type: Type of chart (e.g., 'absolute_psf')
            chart_title: Display title
            chart_data: Chart data payload
            filters: Active filters
            kpis: Optional KPI values

        Yields:
            StreamEvent objects for SSE delivery
        """
        # Assemble context
        bundle = self._context_service.assemble(
            chart_type=chart_type,
            chart_title=chart_title,
            chart_data=chart_data,
            filters=filters,
            kpis=kpis,
        )

        # Emit metadata event first
        yield StreamEvent(
            event_type="meta",
            data={
                "type": "meta",
                "versions": bundle.versions,
                "cache_key": bundle.cache_key(),
            }
        )

        # Build message
        user_message = _build_user_message(bundle)

        try:
            # Stream from Claude
            with self.client.messages.stream(
                model=Config.AI_MODEL,
                max_tokens=Config.AI_MAX_TOKENS,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_message}],
            ) as stream:
                for text in stream.text_stream:
                    yield StreamEvent(
                        event_type="token",
                        data={"type": "token", "content": text}
                    )

            # Done event
            yield StreamEvent(
                event_type="done",
                data={"type": "done", "cached": False}
            )

        except Exception as e:
            logger.error(f"AI interpretation error: {e}")
            yield StreamEvent(
                event_type="error",
                data={
                    "type": "error",
                    "message": str(e) if Config.DEBUG else "AI service temporarily unavailable"
                }
            )

    def interpret_chart_sync(
        self,
        chart_type: str,
        chart_title: str,
        chart_data: dict,
        filters: dict,
        kpis: Optional[dict] = None,
    ) -> dict:
        """
        Non-streaming version for caching or testing.

        Returns complete response instead of streaming.
        """
        bundle = self._context_service.assemble(
            chart_type=chart_type,
            chart_title=chart_title,
            chart_data=chart_data,
            filters=filters,
            kpis=kpis,
        )

        user_message = _build_user_message(bundle)

        try:
            response = self.client.messages.create(
                model=Config.AI_MODEL,
                max_tokens=Config.AI_MAX_TOKENS,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_message}],
            )

            return {
                "content": response.content[0].text,
                "versions": bundle.versions,
                "cache_key": bundle.cache_key(),
                "cached": False,
            }

        except Exception as e:
            logger.error(f"AI interpretation error: {e}")
            raise


# Module-level singleton
_ai_service: Optional[AIService] = None


def get_ai_service() -> AIService:
    """Get the singleton AIService instance."""
    global _ai_service
    if _ai_service is None:
        _ai_service = AIService()
    return _ai_service
