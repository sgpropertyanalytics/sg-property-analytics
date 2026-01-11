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
SYSTEM_PROMPT = """You are a Singapore property market analyst helping users interpret chart data.

## Your Role
Explain what the chart shows and what insights can be drawn from the data. Be concise and actionable.

## Citation & Freshness Rules (MANDATORY)

1. When stating policy rates or measures:
   - You MUST cite from the provided policy snippet
   - Include the effective date from the snippet
   - Format: "ABSD for foreigners is 60% (as of Apr 2023, per IRAS)"

2. When no relevant policy snippet is provided:
   - Do NOT claim specific policy facts
   - Say: "Policy rates apply but were not provided in context"

3. When discussing market trends:
   - Reference the data watermark date provided
   - Format: "Based on transactions through {date}"

4. General principles:
   - Start with what the chart shows (data first)
   - Acknowledge sample size and limitations
   - Avoid predictions - focus on what IS, not what WILL BE
   - If asked about something not in the data, say so clearly

## Response Format
- Keep responses under 300 words unless the data warrants more detail
- Use bullet points for multiple insights
- End with a key takeaway when appropriate

## Context Provided
The following context documents and chart data will be provided:
- Static definitions and market knowledge
- Current policy rates (with effective dates)
- Market snapshot (with freshness date)
- The actual chart data and filters
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

    # Instruction
    parts.append("\n## Task")
    parts.append("Please interpret this chart for a property buyer/investor. "
                 "Explain what the data shows and highlight key insights.")

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
