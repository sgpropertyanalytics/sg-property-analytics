# Agent Feature Roadmap

> De-prioritized feature for future implementation

## Overview

AI-powered chart interpretation using Anthropic Claude. When premium users click "Run Agent" on a chart, the backend streams an interpretation explaining how to read the chart and what insights it reveals.

**Decisions Made:**
- AI Provider: Anthropic Claude
- Architecture: Backend API (SSE streaming)
- Access: Premium users only

---

## Context Architecture (v1: Static + Snapshot)

### Design Principles

1. **Conceptual knowledge ≠ Volatile data**
   - Static docs: definitions, reasoning frameworks, how things work
   - Snapshot docs: actual numbers, rates, dates (with source + timestamp)

2. **Citation & Freshness Rules (Non-negotiable)**
   - If mentioning policy/rates → must cite the provided snippet
   - If no policy snippet provided → do not claim policy facts
   - If user asks "latest" with no recent source → say "No recent sources provided"

3. **Chunked Retrieval, Not Full Injection**
   - Select relevant sections per chart type
   - Avoid token bloat from concatenating everything

4. **Versioning for Trust & Caching**
   - `snapshot_version` (timestamp of last market update)
   - `policy_version` (timestamp of last policy change)
   - `data_watermark` (latest transaction date in DB)

### Context Document Structure

```
docs/ai-context/
├── static/                    # Conceptual (rarely changes)
│   ├── definitions.md         # PSF, GFA, regions, sale types
│   ├── district-mapping.md    # Districts → Regions logic
│   ├── market-cycles.md       # Historical context (without prices)
│   └── reasoning-guide.md     # How to interpret charts
│
├── snapshot/                  # Volatile (refresh weekly+)
│   ├── market-snapshot.md     # Current market state + source + date
│   └── policy-rates.md        # ABSD/LTV/SSD rates + effective date + source
│
└── manifest.json              # Version timestamps for all docs
```

### Example: Static vs Snapshot

**BAD (hardcoded in static):**
```markdown
ABSD for foreigners is 60%.
```

**GOOD (static - conceptual):**
```markdown
## ABSD (Additional Buyer's Stamp Duty)
A tax on property purchases varying by buyer residency status and number
of properties owned. Rates change based on government policy.

When discussing ABSD: always cite the policy snippet provided, including
the effective date.
```

**GOOD (snapshot - volatile):**
```markdown
# Policy Rates
Last updated: 2026-01-10
Source: IRAS website

## ABSD Rates (Effective 27 Apr 2023)
| Buyer Type | 1st Property | 2nd Property | 3rd+ |
|------------|--------------|--------------|------|
| SC         | 0%           | 20%          | 30%  |
| PR         | 5%           | 30%          | 35%  |
| Foreigner  | 60%          | 60%          | 60%  |
```

### Context Assembly

```python
# backend/services/ai_context.py

@dataclass
class ContextBundle:
    """Structured inputs for the agent - not a giant concatenated string"""
    chart_payload: dict           # Numbers from the chart
    static_snippets: list[str]    # Relevant conceptual docs
    snapshot_snippets: list[str]  # Relevant volatile docs with dates
    versions: dict                # snapshot_version, policy_version, data_watermark

class PropertyContext:

    def get_relevant_static(self, chart_type: str) -> list[str]:
        """Return only relevant static sections for this chart type"""
        mapping = {
            'absolute_psf': ['definitions.md#psf', 'district-mapping.md'],
            'price_distribution': ['definitions.md#psf', 'reasoning-guide.md#distribution'],
            'beads': ['definitions.md#bedroom', 'reasoning-guide.md#beads'],
        }
        return [load_section(s) for s in mapping.get(chart_type, [])]

    def get_relevant_snapshot(self, chart_type: str) -> list[str]:
        """Return relevant snapshot sections with freshness metadata"""
        # Always include market snapshot header with date
        # Include policy rates only if chart involves pricing
        ...

    def get_versions(self) -> dict:
        """Load manifest.json for versioning"""
        manifest = load_json('docs/ai-context/manifest.json')
        return {
            'snapshot_version': manifest['snapshot_updated'],
            'policy_version': manifest['policy_updated'],
            'data_watermark': get_latest_transaction_date(),
        }

    def assemble(self, chart_type: str, chart_data: dict) -> ContextBundle:
        return ContextBundle(
            chart_payload=chart_data,
            static_snippets=self.get_relevant_static(chart_type),
            snapshot_snippets=self.get_relevant_snapshot(chart_type),
            versions=self.get_versions(),
        )
```

### System Prompt Rules

```markdown
## Citation & Freshness Rules

1. When stating policy rates or measures:
   - You MUST cite from the provided policy snippet
   - Include the effective date from the snippet
   - Format: "ABSD for foreigners is 60% (as of Apr 2023, per IRAS)"

2. When no relevant policy snippet is provided:
   - Do NOT claim specific policy facts
   - Say: "Policy rates apply but were not provided in context"

3. When user asks about "latest news" or "recent developments":
   - If snapshot contains relevant info → cite with date
   - If no recent source → say "No recent market updates were provided"

4. Always acknowledge data freshness:
   - "Based on transactions through {data_watermark}"
   - "Market context as of {snapshot_version}"
```

### Cache Key (with versioning)

```
ai:interpret:{chartType}:{snapshot_version}:{md5(chart_data)}:{md5(filters)}
```

---

## Web Search: Opt-In Only

Live web search is **not default**. Only triggered when:
- User explicitly asks for "latest news" or "recent developments"
- Clearly labeled in response as "External sources (retrieved {date})"

Rationale: Less controllable, higher variance, harder to cache, latency.

---

## TODO

### Phase 1: Backend Core
- [x] Add `anthropic>=0.49.0` to `requirements.txt`
- [x] Add `ANTHROPIC_API_KEY` to config and `.env`
- [x] Create `docs/ai-context/` directory structure
- [x] Create `docs/ai-context/manifest.json` with per-file versions, injection rules
- [x] Create `docs/ai-context/sources.md` - allowed sources + citation rules
- [x] Create static docs: `definitions.md`, `district-mapping.md`, `market-cycles.md`, `reasoning-guide.md`
- [x] Create snapshot docs: `market-snapshot.md`, `policy-measures.md`
- [x] Create `backend/services/ai_context.py` - context assembly with chunked retrieval
- [x] Create `backend/services/ai_service.py` - Claude streaming with citation rules
- [x] Create `backend/routes/ai.py` - SSE endpoint `POST /api/ai/interpret-chart`
- [x] Register AI blueprint in `app.py`
- [x] Add rate limiting (10/minute per user)
- [x] Add response caching with version-aware keys (1 hour TTL)

### Phase 2: Frontend Integration
- [x] Create `frontend/src/hooks/useChartInterpret.js` - SSE consumer hook
- [x] Enhance `AgentFooter` in `DataCard.tsx` with `isStreaming` and `error` props
- [x] Display context freshness: "Market context as of {date}"
- [x] Integrate with `AbsolutePsfChart.jsx` (reference implementation)
- [ ] Rollout to other charts

### Phase 3: Future Upgrades (Not v1)
- [ ] Automated snapshot refresh (scrape URA flash estimates)
- [ ] RAG with vector search for larger document corpus
- [ ] Opt-in web search for "latest news" queries

---

## Technical Details

### Endpoint

```
POST /api/ai/interpret-chart
Content-Type: application/json
Authorization: Bearer <token>

{
  "chartType": "absolute_psf",
  "chartTitle": "Absolute PSF by Region",
  "data": { ... },
  "filters": { ... },
  "kpis": { ... }
}
```

Returns SSE stream:
```
data: {"type": "meta", "versions": {"snapshot": "2026-01-10", "data_watermark": "2026-01-08"}}
data: {"type": "token", "content": "The chart shows..."}
data: {"type": "token", "content": " CCR outperforming..."}
data: {"type": "done", "cached": false}
```

---

## Existing Infrastructure

- `AgentButton` component exists in `DataCard.tsx`
- `AgentFooter` component exists in `DataCard.tsx`
- `AbsolutePsfChart.jsx` has static hardcoded agent logic (lines 310-318) - replace with AI
- Premium subscription context exists (`useSubscription`)
- `FrostOverlay` exists for loading states

---

## Priority: Low

This feature enhances user experience but is not critical path. Implement after core analytics features are stable.
