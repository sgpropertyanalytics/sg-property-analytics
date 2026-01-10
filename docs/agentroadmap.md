# Agent Feature Roadmap

> De-prioritized feature for future implementation

## Overview
AI-powered chart interpretation using Anthropic Claude. When premium users click "Run_Agent" on a chart, the backend streams an interpretation explaining how to read the chart and what insights it reveals.

**Decisions Made:**
- AI Provider: Anthropic Claude
- Architecture: Backend API (SSE streaming)
- Access: Premium users only

---

## TODO

### Backend
- [ ] Add `anthropic>=0.49.0` to `requirements.txt`
- [ ] Add `ANTHROPIC_API_KEY` to config and `.env`
- [ ] Create `backend/services/ai_service.py` - Claude streaming with property market prompts
- [ ] Create `backend/routes/ai.py` - SSE endpoint `POST /api/ai/interpret-chart`
- [ ] Register AI blueprint in `app.py`
- [ ] Add rate limiting (10/minute per user)
- [ ] Add response caching (1 hour TTL)

### Frontend
- [ ] Create `frontend/src/hooks/useChartInterpret.js` - SSE consumer hook
- [ ] Enhance `AgentFooter` in `DataCard.tsx` with `isStreaming` and `error` props
- [ ] Integrate with `AbsolutePsfChart.jsx` (reference implementation)
- [ ] Rollout to other charts: `PriceDistributionChart`, `BeadsChart`, `PriceCompressionChart`

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
data: {"type": "token", "content": "The chart shows..."}
data: {"type": "token", "content": " CCR outperforming..."}
data: {"type": "done", "cached": false}
```

### Cache Key
```
ai:interpret:{chartType}:{md5(data)}:{md5(filters)}
```

### Property Market Prompt Context
- CCR/RCR/OCR regions
- PSF (Price per Square Foot)
- New Sale vs Resale
- Bedroom classifications
- District mappings

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
