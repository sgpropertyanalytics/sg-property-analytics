# 2-Week Refactor Execution Plan (2026-02-15 to 2026-02-28)

## Objective
Improve maintainability and performance in the most-used analytics paths without changing API contracts.

## Success Metrics
- P95 backend elapsed time improvement on:
  - `/api/district-growth`
  - `/api/new-vs-resale`
  - `/api/new-launch-timeline`
  - `/api/new-launch-absorption`
- Reduction of print-based runtime logs in analytics routes.
- No contract/schema regressions on touched endpoints.
- Lower file-level complexity in top "god modules" via extractions.

## Prioritized Problem Areas
1. Route observability and error handling inconsistency (print vs logger, mixed formats).
2. Oversized backend modules with mixed concerns:
   - `backend/services/data_processor.py`
   - `backend/services/dashboard_service.py`
   - `backend/services/new_launch_service.py`
3. Duplicate filter/date normalization logic across route and service layers.
4. Query-path inefficiencies in first-three-tab backend endpoints.

## Scope Guardrails
- Do not change frontend API response contracts.
- Keep query semantics stable unless explicitly validated against fixtures/tests.
- Prefer additive/refactor-safe changes over broad rewrites.

## Week 1 (Stabilize + Extract)

### Day 1-2: Observability Baseline (Started)
- Add shared analytics route utilities for timing and error logging.
- Migrate high-traffic endpoints first:
  - `trends.py` (`/api/new-vs-resale`)
  - `new_launch.py` (`/api/new-launch-*`)
  - `charts.py` (`/api/district-growth`)

### Day 3-4: Query Path Hardening
- Apply and validate migration `023_add_project_key_indexes.sql`.
- Run endpoint-level before/after timing checks (same filter combinations).
- Capture P50/P95 with elapsedMs and request dimensions.

### Day 5: Module Boundary Extraction
- Extract filter parsing helpers for analytics routes into one shared module.
- Remove duplicated district/segment/bedroom/date shaping from route handlers.

## Week 2 (Decompose + Verify)

### Day 6-8: Split "god modules"
- `data_processor.py`: move NewVsResale logic into `services/analytics/new_vs_resale_service.py`.
- `dashboard_service.py`: extract query builders and serializers into separate files.
- Keep backward-compatible wrappers in original files during transition.

### Day 9: Remove dead/duplicate logic
- Consolidate duplicate SQL snippets and duplicate transform logic.
- Remove redundant route-local parsing now covered by shared helpers.

### Day 10: Regression + perf verification
- Run contract smoke tests and focused endpoint tests.
- Re-run bottleneck diagnostic on first three tabs.
- Produce final perf delta summary and remaining debt list.

## Deliverables
1. Refactored route observability helpers and migrated high-traffic endpoints.
2. New module boundaries for at least 2 critical backend services.
3. Endpoint timing report before/after with bottleneck attribution.
4. Follow-up debt list with next 2-week slice.
