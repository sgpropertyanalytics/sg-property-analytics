# Design Decisions & Roadmap

## Architecture Decisions

### ADR-001: SQL-Only Aggregation

**Decision:** All production queries use SQL aggregation. No pandas DataFrames in memory.

**Context:** Render's 512MB memory limit requires efficient memory usage.

**Consequences:**
- Faster query execution
- Lower memory footprint
- More complex SQL queries
- Cannot use pandas convenience functions

### ADR-002: Sequential Queries for Remote DB

**Decision:** Run dashboard panel queries sequentially, not in parallel.

**Context:** Parallel execution with remote PostgreSQL caused:
- Connection pool contention (5 connections max)
- Compounded network latency
- 5964ms parallel vs 1694ms sequential

**Consequences:**
- Slower theoretical maximum but faster real-world performance
- Simpler connection management
- Predictable resource usage

### ADR-003: Partial Indexes for Outlier Filtering

**Decision:** Create partial indexes with `WHERE is_outlier = false OR is_outlier IS NULL`.

**Context:** Every query includes outlier filtering. Without partial indexes, this filter scans the entire table.

**Consequences:**
- 7 additional indexes
- Faster query execution
- Increased storage

### ADR-004: Adapter Pattern for API Responses

**Decision:** All API responses pass through adapter functions before reaching components.

**Context:** API field names changed between v1/v2/v3. Components directly accessing fields broke on updates.

**Consequences:**
- Components decoupled from API shape
- Single location for field normalization
- Adapters must be maintained alongside API changes

### ADR-005: Single Outlier Filtering Location

**Decision:** Outliers are removed ONLY during upload (staging). App startup is read-only.

**Context:** IQR-based filtering at runtime caused:
- Non-deterministic datasets (recalculating bounds created new outliers)
- Debugging difficulty
- Reproducibility issues

**Consequences:**
- Same row count after every restart
- Upload is the single source of truth
- Cannot dynamically adjust outlier thresholds

### ADR-006: API Contract Versioning

**Decision:** Emit `apiContractVersion` in all responses. Frontend validates known versions.

**Context:** Breaking API changes caused silent failures in frontend.

**Consequences:**
- Frontend can handle multiple versions
- Graceful degradation for unknown versions
- Deprecation warnings in dev mode
- Clear migration path for version updates

### ADR-007: Pydantic Param Validation

**Decision:** Use Pydantic models for API parameter validation instead of custom `normalize_params()`.

**Context:** Custom validation in `normalize_params()` was:
- Error-prone with type coercion bugs
- Difficult to maintain aliases and defaults
- No IDE autocompletion or type hints
- Cache key bugs when param identity drifted through transformations

**Migration Status (Jan 2026):**
- Phase 1: Created Pydantic models for all 10 endpoints ✓
- Phase 2: 136 cache key parity tests pass ✓
- Phase 3: `USE_PYDANTIC_VALIDATION=true` as default ✓
- Phase 4: Parallel mode logging for edge case detection (ongoing)
- Phase 5: Remove old `normalize_params()` (after stable)

**Consequences:**
- IDE autocompletion and type hints
- Frozen models prevent param mutation
- Built-in validation error messages
- Easy alias handling with `validation_alias`
- Parallel mode catches any edge cases

**Files:**
- `backend/api/contracts/pydantic_models/` - All Pydantic models
- `backend/api/contracts/feature_flags.py` - Feature flags
- `backend/tests/test_cache_key_parity.py` - 136 parity tests

---

## Technical Debt

### Known Issues

| Issue | Severity | Description |
|-------|----------|-------------|
| K-Anonymity too low | Medium | Current threshold is 10, should be 50 |
| No rate limiting | Medium | Data endpoints can be scraped |
| Duplicate formatPrice | Low | 6 locations with similar functions |
| Unused API functions | Low | 32 unused exports in client.js |

### Deferred Work

| Item | Reason |
|------|--------|
| Redis cache | In-memory cache sufficient for current load |
| Response compression | Not yet bottleneck |
| School proximity UI | Backend complete, UI not built |

---

## Future Roadmap

### Planned Features

#### Inventory Tracking

**Status:** Design complete, implementation pending

Calculate unsold units per project:
```
Unsold = Total Units - Cumulative New Sales
```

Requires:
- URA Developer Sales API integration
- `project_inventory` table
- Auto-sync for new projects

#### School Proximity

**Status:** Backend complete, frontend pending

Backend endpoints exist:
- `GET /projects/<project>/school-flag`
- `GET /schools`

Frontend UI not yet built.

### Infrastructure Improvements

| Priority | Improvement | Expected Impact |
|----------|-------------|-----------------|
| 1 | Redis cache | Eliminate cold-start lag |
| 2 | Response compression | 70% payload reduction |
| 3 | Connection pooling tuning | Handle traffic spikes |

---

## API Evolution

### Version Timeline

| Version | Introduced | Status | Sunset |
|---------|------------|--------|--------|
| v1 | 2024-Q1 | Deprecated | 2026-04-01 |
| v2 | 2024-Q3 | Supported | - |
| v3 | 2024-Q4 | Current | - |

### v4 Planning

When v4 is needed:

1. Add version constant to `contract_schema.py`
2. Add to `SUPPORTED_API_CONTRACT_VERSIONS`
3. Update adapters
4. Add tests
5. Deprecate old version

### Breaking Change Policy

- New versions required for breaking schema changes
- 6-month support period for previous version
- 3-month deprecation warning period
- Console warnings in dev mode before sunset

---

## Compliance Roadmap

### Current Status

- [x] Data masking for free tier
- [x] Aggregation-only for public endpoints
- [ ] K-Anonymity threshold increase (10 → 50)
- [ ] Rate limiting on data endpoints
- [ ] Audit logging

### Compliance Fixes Needed

1. **Transaction list endpoint** - Returns individual records
2. **Teaser serializer** - Still contains identifiable fields
3. **Rate limiting** - No protection against bulk extraction

---

## Performance Roadmap

### Current Targets

| Metric | Target | Current |
|--------|--------|---------|
| Dashboard (cached) | <50ms | <5ms |
| Dashboard (uncached) | <300ms | ~1.5s |
| Memory usage | <400MB | ~350MB |

### Optimization Backlog

1. **Redis cache** - Persist cache across restarts
2. **Query parallelization** - For local/low-latency DBs only
3. **Materialized views** - For complex aggregations

---

## Deprecated Features

### Removed

| Feature | Removed | Reason |
|---------|---------|--------|
| Ad system | Dec 2024 | Never used (dead code) |
| Pandas aggregation | Dec 2024 | Memory constraints |

### Deprecated (Still Working)

| Feature | Sunset | Migration Path |
|---------|--------|----------------|
| v1 API | 2026-04-01 | Use v2/v3 field names |
| snake_case fields | 2026-04-01 | Use camelCase |

---

## Decision Log

### 2024-12

- Deprecated v1 API (sunset 2026-04-01)
- Added partial indexes for outlier filtering
- Reverted parallel query execution
- Consolidated chart migration to adapter pattern

### 2024-Q4

- Introduced v3 API contract
- Implemented cache warming on startup
- Added histogram query optimization

### 2024-Q3

- Migrated to SQL-only aggregation
- Added API contract versioning

### 2025-Q4

- Migrated to TanStack Query (useAppQuery pattern)
- Migrated filter state to Zustand (filterStore.js)
- Removed PowerBIFilterProvider (~600 lines)
- Deleted legacy custom hooks (useAbortableQuery, useStaleRequestGuard, etc.)

### 2026-Q1

- Completed Pydantic validation migration (Phase 5)
- Disabled parallel validation mode
- 136 cache key parity tests ensure correctness

---

*Last updated: January 2026*
