"""
AI Service - Claude Streaming for Chart Interpretation and Argus Analysis

Handles communication with Anthropic Claude API for:
- Chart interpretation (single chart analysis)
- Argus analysis (comprehensive project/unit evaluation)

Implements SSE streaming for real-time response delivery.

Key features:
- Streaming token delivery for responsive UX
- Citation rules enforced via system prompt
- Response caching with version-aware keys
- Dual-mode: chart interpretation vs Argus project analysis
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


# Argus system prompt - comprehensive project/unit analysis
ARGUS_SYSTEM_PROMPT = """You are Argus, a Singapore property analyst helping buyers and sellers make informed decisions.

## Your Role
You analyze specific properties using transaction data, market trends, and policy context. Users come to you when evaluating a purchase or sale - give them what they need to decide.

## What Users Want to Know
When analyzing a property, answer these core questions:
1. Is this price fair? (vs comps, vs market)
2. What's the trend? (appreciating, stable, declining)
3. How liquid is this? (easy or hard to resell)
4. What are the risks? (supply, policy, market cycle)

## Response Structure
Be direct. No fluff. Structure your response as:

**VERDICT**: [X% UNDER | FAIR | X% OVER] — One sentence with the specific benchmark.
Example: "5% UNDER — At $2,083 PSF, this sits below the D01 3BR median of $2,200."

**PRICE CONTEXT**
- Where this sits vs fair value range (P25-P75)
- Recent comparable transactions
- District/segment median comparison

**TREND & MOMENTUM**
- Price movement over time
- Project vs district performance
- Any notable inflection points

**LIQUIDITY & EXIT**
- How quickly similar units resell
- Supply pipeline that may affect future resale

**RISKS TO WATCH**
- Specific factors that could impact value
- Be concrete, not generic

## Quality Standards

**Be Specific — Examples:**

Valuation:
- BAD: "The price seems reasonable"
- GOOD: "At $2,083 PSF, this is 5% below the D01 3BR median of $2,200"

Trends:
- BAD: "The trend is positive"
- GOOD: "D01 3BR median PSF rose 8.2% YoY (Q4'24 vs Q4'23), outpacing CCR average of 5.1%"

Liquidity:
- BAD: "Liquidity is decent"
- GOOD: "12 similar units transacted in past 6 months. Project averages 45 days on market vs 68 days district average."

Risk:
- BAD: "There's some supply risk"
- GOOD: "1,847 units completing in D01 by 2026 — a 42% increase vs current stock. Watch for pricing pressure."

**Use the Data:**
- Reference actual numbers from the provided context
- Compare to specific benchmarks from market snapshot, not vague "market average"

**Singapore Context:**
- Reference district character (D09 prime, D15 East Coast lifestyle, D19 family-oriented)
- Note MRT lines, school proximity when relevant
- For 99-year leasehold, note remaining lease if approaching decay thresholds (60, 40, 30 years)

## Quantified Standards (Data-Validated)

Use these benchmarks derived from actual transaction data:

**PSF Growth Classification (YoY)**
| Growth Rate | Classification | Percentile |
|-------------|----------------|------------|
| >12% | Strong Growth | Top 10% |
| 10-12% | Growing | P75-P90 |
| 4-10% | Stable | P25-P75 |
| 0-4% | Softening | P10-P25 |
| <0% | Declining | Bottom 10% |

Median YoY growth is ~6%. Anything above 10% is above-average; below 4% is below-average.

**Liquidity Zones (Turnover per 100 units)**
| Turnover | Zone | Interpretation |
|----------|------|----------------|
| <5 | Low Liquidity | Harder to exit, may need time or price concessions |
| 5-15 | Healthy | Balanced market, favorable exit conditions |
| >15 | Elevated | High activity, watch for exit clustering |

**Lease Decay Thresholds (99-year leasehold)**
| Remaining Lease | Impact | Financing |
|-----------------|--------|-----------|
| >60 years | Minimal decay | Full bank financing available |
| 40-60 years | Moderate decay (~15-25% below freehold) | Some banks may limit LTV |
| 30-40 years | Significant decay (~30-40% discount) | CPF restricted, limited financing |
| <30 years | Severe decay | Cash buyers only, very limited pool |

**Segment Spread Benchmarks (Data-Validated)**

CCR-RCR Premium (CCR trades above RCR by):
| Spread | Interpretation |
|--------|----------------|
| <19% | Compressed — CCR losing premium, possible value entry |
| 19-31% | Normal range (median ~25%) |
| >31% | Wide — CCR premium elevated, watch for reversion |

RCR-OCR Premium (RCR trades above OCR by):
| Spread | Interpretation |
|--------|----------------|
| <23% | Compressed — unusual, OCR catching up |
| 23-25% | Normal range (median ~24%, very stable) |
| >25% | Wide — RCR pulling ahead of OCR |

**Segment Liquidity Profiles**
| Segment | Typical Activity | Buyer Pool | Key Risk |
|---------|------------------|------------|----------|
| CCR | Lower (P50=6/yr) | Smaller, foreign-heavy | ABSD policy, longer holds |
| RCR | Moderate (P50=5/yr) | Balanced, upgraders | Squeezed by CCR/OCR |
| OCR | Higher (P50=13/yr) | Largest, HDB upgraders | Supply pipeline |

## Citation Rules (NON-NEGOTIABLE)

1. Policy claims MUST cite with effective date:
   ✓ "ABSD for foreigners is 60% (IRAS, effective 27 Apr 2023)"
   ✗ "ABSD is around 60%"

2. No policy snippet provided? Say: "Policy rates apply but specific rates not provided in context"

3. Reference data freshness: "Based on transactions through {date}"

## Confidence Calibration (Data-Validated)
Based on actual project transaction distributions:
- <8 comps: "Limited comparable data - interpret with caution" (below P25)
- 8-60 comps: "Moderate sample size" (P25-P75)
- >60 comps: State findings confidently (above P75)

## What NOT to Do
- Never predict future prices ("will go up")
- Never give buy/sell recommendations ("you should buy")
- Never ignore contradictory data
- Never pad with generic filler
- Never lecture about basic concepts

## Tone
You're a trusted analyst, not a salesperson. Be direct, be honest, be useful. If the data doesn't support a strong conclusion, say so.
"""


def _build_user_message(bundle: ContextBundle) -> str:
    """
    Build the user message from the context bundle.

    Structures the message with clear sections for the AI to parse.
    Handles both chart interpretation and Argus project analysis.
    """
    # Route to appropriate builder based on context type
    if bundle.chart_type == "argus":
        return _build_argus_message(bundle)
    return _build_chart_message(bundle)


def _build_chart_message(bundle: ContextBundle) -> str:
    """Build message for chart interpretation."""
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


def _build_argus_message(bundle: ContextBundle) -> str:
    """
    Build message for Argus project/unit analysis.

    Expected payload structure:
    {
        "subject": {
            "project": "Marina One Residences",
            "district": "D01",
            "region": "CCR",
            "bedroom": "3BR",
            "sqft": 1200,
            "floor": "High",
            "tenure": "99-year",
            "topYear": 2017,
            "askingPrice": 2500000,  # optional
            "askingPsf": 2083,       # optional
        },
        "evidence": {
            "fairValueRange": {"p25": 1950, "median": 2100, "p75": 2250},
            "recentComps": [...],
            "projectStats": {...},
            "districtStats": {...},
            "priceHistory": {...},
            "supplyPipeline": {...},
            "exitRisk": {...},
        },
        "filters": {...}
    }
    """
    parts = []
    payload = bundle.chart_payload

    # Extract subject (the property being analyzed)
    subject = payload.get("data", {}).get("subject", {})
    evidence = payload.get("data", {}).get("evidence", {})

    # Property being analyzed
    parts.append("## Property Under Analysis")
    if subject:
        project = subject.get("project", "Unknown Project")
        district = subject.get("district", "")
        region = subject.get("region", "")
        bedroom = subject.get("bedroom", "")
        sqft = subject.get("sqft", "")
        floor = subject.get("floor", "")
        tenure = subject.get("tenure", "")
        top_year = subject.get("topYear", "")

        parts.append(f"**Project:** {project}")
        if district:
            parts.append(f"**Location:** {district} ({region})")
        if bedroom:
            parts.append(f"**Unit Type:** {bedroom}" + (f", {sqft} sqft" if sqft else ""))
        if floor:
            parts.append(f"**Floor:** {floor}")
        if tenure:
            parts.append(f"**Tenure:** {tenure}")
        if top_year:
            parts.append(f"**TOP Year:** {top_year}")

        # User's price context (if they're evaluating a specific price)
        asking_price = subject.get("askingPrice")
        asking_psf = subject.get("askingPsf")
        if asking_price or asking_psf:
            parts.append("\n**Price Being Evaluated:**")
            if asking_price:
                parts.append(f"- Total: ${asking_price:,.0f}")
            if asking_psf:
                parts.append(f"- PSF: ${asking_psf:,.0f}")

    # Filters context
    if bundle.filters:
        filter_str = ", ".join(f"{k}={v}" for k, v in bundle.filters.items() if v)
        if filter_str:
            parts.append(f"\n**Analysis Context:** {filter_str}")

    # Version metadata
    if bundle.versions:
        parts.append(f"\n## Data Freshness")
        parts.append(f"- Data through: {bundle.versions.get('data_watermark', 'unknown')}")
        parts.append(f"- Market context as of: {bundle.versions.get('snapshot_version', 'unknown')}")
        parts.append(f"- Policy rates as of: {bundle.versions.get('policy_version', 'unknown')}")

    # Static context (definitions, district mapping, etc.)
    if bundle.static_snippets:
        parts.append("\n## Reference Context")
        for snippet in bundle.static_snippets:
            parts.append(snippet)

    # Snapshot context (market, policy, demographics, etc.)
    if bundle.snapshot_snippets:
        parts.append("\n## Current Market Context")
        for snippet in bundle.snapshot_snippets:
            parts.append(snippet)

    # Evidence data (aggregated from multiple sources)
    if evidence:
        parts.append("\n## Market Evidence")
        parts.append("```json")
        parts.append(json.dumps(evidence, indent=2, default=str))
        parts.append("```")

    # Task instruction
    parts.append("\n## Task")
    project_name = subject.get("project", "this property")
    parts.append(f"Analyze {project_name} for a potential buyer or seller.")
    parts.append("Follow the MANDATORY response structure: VERDICT, PRICE CONTEXT, TREND & MOMENTUM, LIQUIDITY & EXIT, RISKS TO WATCH.")
    parts.append("Be specific with numbers from the evidence. Reference the property's specific context (district, segment, age).")

    if subject.get("askingPrice") or subject.get("askingPsf"):
        parts.append("\n**Focus:** Evaluate whether the price being considered is fair, and what factors support or challenge that valuation.")
    else:
        parts.append("\n**Focus:** Provide a comprehensive view of this property's market position, trends, and risk factors.")

    return "\n".join(parts)


def _get_system_prompt(context_type: str) -> str:
    """Select appropriate system prompt based on context type."""
    if context_type == "argus":
        return ARGUS_SYSTEM_PROMPT
    return SYSTEM_PROMPT


class AIService:
    """
    Service for AI-powered analysis.

    Supports two modes:
    - Chart interpretation: Single chart analysis with focused insights
    - Argus analysis: Comprehensive project/unit evaluation

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
        Interpret a chart or analyze a project using Claude with streaming.

        For charts: Provides focused interpretation of a single visualization.
        For Argus (chart_type='argus'): Comprehensive project/unit analysis.

        Args:
            chart_type: Type of context ('absolute_psf', 'beads', 'argus', etc.)
            chart_title: Display title (or project name for Argus)
            chart_data: Data payload (chart data or Argus subject/evidence)
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

        # Build message and select system prompt
        user_message = _build_user_message(bundle)
        system_prompt = _get_system_prompt(chart_type)

        try:
            # Stream from Claude
            with self.client.messages.stream(
                model=Config.AI_MODEL,
                max_tokens=Config.AI_MAX_TOKENS,
                system=system_prompt,
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
        Works for both chart interpretation and Argus analysis.
        """
        bundle = self._context_service.assemble(
            chart_type=chart_type,
            chart_title=chart_title,
            chart_data=chart_data,
            filters=filters,
            kpis=kpis,
        )

        user_message = _build_user_message(bundle)
        system_prompt = _get_system_prompt(chart_type)

        try:
            response = self.client.messages.create(
                model=Config.AI_MODEL,
                max_tokens=Config.AI_MAX_TOKENS,
                system=system_prompt,
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
