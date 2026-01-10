# Supabase + URA API Streaming Migration Plan

**Created:** 2026-01-10
**Status:** Phase 0 Complete, Phases 1-7 Pending
**Author:** Planning session with Claude

---

## Executive Summary

This document captures the complete migration plan from a 1-hour planning session to:
1. **Migrate database** from Render PostgreSQL to Supabase (managed PostgreSQL)
2. **Replace CSV ingestion** with automated URA API streaming for transaction data

### Current Status

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 0** | Supabase Migration | ✅ COMPLETED (2026-01-10) |
| Phase 1 | URA API Client | Pending |
| Phase 2 | Canonical Mapper | Pending |
| Phase 3 | Shadow Mode Infrastructure | Pending |
| Phase 4 | Sync Engine Core | Pending |
| Phase 5 | Cron Job Setup | Pending |
| Phase 6 | Shadow Mode Validation | Pending (7-14 days) |
| Phase 7 | Production Switch | Pending |

---

## Architecture Principles (Non-Negotiable)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE CONSTRAINTS                         │
├─────────────────────────────────────────────────────────────────────┤
│ SUPABASE = Managed PostgreSQL + pgvector ONLY                       │
│ RENDER = ALL compute (API, cron, ingestion, workers)                │
│                                                                     │
│ FORBIDDEN on Supabase:                                              │
│   - Edge Functions                                                  │
│   - Supabase Auth                                                   │
│   - Row Level Security (RLS)                                        │
│   - Direct frontend access                                          │
│   - Business logic                                                  │
│   - Realtime subscriptions                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### Responsibility Split

| Layer | Supabase (Data) | Render (Compute) |
|-------|-----------------|------------------|
| Database | ✅ Host PostgreSQL | ❌ |
| API | ❌ | ✅ Flask/Gunicorn |
| Cron Jobs | ❌ | ✅ URA API ingestion |
| Data Transform | ❌ | ✅ ETL pipeline |
| Auth | ❌ | ✅ JWT handling |
| AI/Embeddings | ✅ pgvector storage | ✅ Generation logic |

---

## Interview Summary (Requirements Gathering)

### URA API Details
| Question | Answer |
|----------|--------|
| Which endpoints? | Full suite (Transactions, Projects, Planning) |
| Sync frequency? | Daily cron (Tue/Fri/Sat - matches URA update schedule) |
| Have credentials? | Yes, AccessKey + API credentials |
| Revision handling? | Re-sync 90-day sliding window |
| Backfill depth? | Full history (but API only provides 5 years) |

### Migration Approach
| Question | Answer |
|----------|--------|
| Migration mode? | Shadow mode 7-14 days, then production |
| Diff tolerance? | Exact match required |
| Runtime environment? | Render Cron Job |
| Alerting? | Email notification on failure |
| Schema drift? | Preserve unknown fields in `raw_extras` JSONB |

### History Gap Resolution
- **Problem:** URA API only provides 5 years of history
- **Solution:** Hybrid approach - CSV for pre-5yr, API for recent 5yr
- **Cutoff:** Rolling 5-year window from current date

### Schema Decision
- **Decision:** Keep current column names (already clean snake_case)
- **No schema changes required** for Supabase migration

---

## Phase 0: Supabase Migration ✅ COMPLETED

### Completion Details
- **Date:** 2026-01-10
- **Supabase Project:** `tjotitbnloyofxhwpumh`
- **Region:** ap-south-1 (Mumbai) - Transaction pooler is IPv4 compatible
- **pgvector:** Deferred (future feature, not priority)

### Connection Strings

```bash
# Direct (for migrations, pg_dump) - Port 5432
postgresql://postgres:[PASSWORD]@db.tjotitbnloyofxhwpumh.supabase.co:5432/postgres

# Session Pooler (for long operations) - Port 5432
postgresql://postgres.tjotitbnloyofxhwpumh:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:5432/postgres

# Transaction Pooler (for app runtime) - Port 6543 ← USED BY RENDER
postgresql://postgres.tjotitbnloyofxhwpumh:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres
```

### Data Migrated

| Table | Row Count |
|-------|-----------|
| transactions | 119,269 |
| project_locations | 2,149 |
| gls_tenders | 81 |
| etl_batches | 24 |
| (+ 16 other tables) | various |

### Migration Steps Executed

1. **Export from Render:**
   ```bash
   /opt/homebrew/opt/postgresql@18/bin/pg_dump "RENDER_URL" \
     --no-owner --no-acl --clean --if-exists > render_backup.sql
   ```

2. **Import to Supabase (Session Pooler):**
   ```bash
   /opt/homebrew/opt/postgresql@18/bin/psql "SUPABASE_SESSION_POOLER_URL" < render_backup.sql
   ```

3. **Update Render DATABASE_URL** to Transaction Pooler URL

4. **Verification:**
   - App logs show: `Database: postgres @ [IPv6]` (Supabase)
   - Record count: 119,269 (matches)
   - All tables present with indexes

### Rollback Procedure (If Needed)
```bash
# Change Render DATABASE_URL back to:
postgresql://condo_db_tclw_user:z5pqizNf6qGcKCSU6QquoFc7xsXSpeds@dpg-d50ijkf5r7bs739fi360-a.singapore-postgres.render.com/condo_db_tclw

# Keep Render PostgreSQL for 7 days before deleting
```

---

## Phase 1: URA API Client (Pending)

### Files to Create
- `backend/services/ura_api_client.py`

### URA API Endpoints

| Endpoint | URL | Purpose |
|----------|-----|---------|
| Token | `GET /uraDataService/insertNewToken/v1` | Daily token (AccessKey header) |
| Transactions | `GET /uraDataService/invokeUraDS/v1?service=PMI_Resi_Transaction&batch={1-4}` | Transaction data |

### Implementation Requirements
```python
class URAAPIClient:
    TOKEN_URL = "https://eservice.ura.gov.sg/uraDataService/insertNewToken/v1"
    DATA_URL = "https://eservice.ura.gov.sg/uraDataService/invokeUraDS/v1"

    # Features:
    # - Token caching (23h TTL, refresh before expiry)
    # - Retry with exponential backoff (1s, 2s, 4s, max 3 attempts)
    # - Rate limiting (6 req/min via existing ScraperRateLimiter)
    # - Batch fetching (1-4 for all districts)
```

### Test Plan
- Unit test: Token refresh flow (mock API)
- Unit test: Batch fetching with retry
- Integration test: Rate limiter respects config

---

## Phase 2: Canonical Mapper (Pending)

### Files to Create
- `backend/services/ura_canonical_mapper.py`

### Field Mapping Specification

| URA API Field | DB Column | Transform |
|--------------|-----------|-----------|
| `project` | `project_name` | strip() |
| `street` | `street_name` | strip() |
| `marketSegment` | `market_segment` | CCR/RCR/OCR |
| `transaction.contractDate` | `transaction_date` | mmyy → date(20yy, mm, 1) |
| `transaction.contractDate` | `contract_date` | store original mmyy |
| `transaction.district` | `district` | "01" → "D01" |
| `transaction.propertyType` | `property_type` | strip() |
| `transaction.tenure` | `tenure` | strip() |
| `transaction.price` | `price` | float() |
| `transaction.area` | `area_sqft` | float() |
| `transaction.floorRange` | `floor_range` | strip() |
| `transaction.typeOfSale` | `sale_type` | 1→"New Sale", 2→"Sub Sale", 3→"Resale" |
| `transaction.noOfUnits` | `num_units` | int(), default 1 |

### Computed Fields

| Field | Computation |
|-------|-------------|
| `psf` | price / area_sqft |
| `bedroom_count` | 3-tier classifier from area_sqft |
| `floor_level` | classify from floor_range |
| `lease_start_year` | parse from tenure string |
| `remaining_lease` | calculate from lease_start_year |
| `row_hash` | SHA256(project_name\|txn_month\|price\|area\|floor_range) |
| `source` | 'ura_api' (new field) |

### Type of Sale Mapping
```python
TYPE_OF_SALE_MAP = {
    "1": "New Sale",
    "2": "Sub Sale",
    "3": "Resale",
}
```

### Contract Date Parsing
```python
def parse_contract_date(mmyy: str) -> date:
    """Parse URA's mmyy format: "0125" → date(2025, 1, 1)"""
    mm = int(mmyy[:2])
    yy = int(mmyy[2:])
    year = 2000 + yy  # URA data is recent, 20xx is safe
    return date(year, mm, 1)
```

### Schema Drift Protection
```python
def map_transaction(raw: dict) -> dict:
    # Map known fields...

    # Preserve unknown fields for future compatibility
    unknown = {k: v for k, v in raw.items() if k not in KNOWN_FIELDS}
    if unknown:
        result['raw_extras'] = json.dumps(unknown)

    return result
```

---

## Phase 3: Shadow Mode Infrastructure (Pending)

### Files to Create
- `backend/services/ura_shadow_comparator.py`
- `backend/migrations/018_add_ura_api_support.sql`

### Migration SQL
```sql
-- Track data source (csv vs ura_api)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'csv';

-- Index for source-based queries
CREATE INDEX IF NOT EXISTS idx_transactions_source
ON transactions(source);

-- Shadow table for comparison (same schema as transactions)
CREATE TABLE IF NOT EXISTS transactions_shadow (
    LIKE transactions INCLUDING ALL
);

-- ETL source tracking
ALTER TABLE etl_batches
ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'csv';
```

### Comparison Logic
```python
def compare_shadow_to_production(date_range: tuple[date, date]) -> DiffReport:
    return DiffReport(
        row_count_diff=...,      # Absolute difference
        row_count_pct=...,       # Percentage difference
        psf_median_diff=...,     # PSF median difference
        missing_districts=...,   # Districts in prod but not shadow
    )
```

---

## Phase 4: Sync Engine Core (Pending)

### Files to Create
- `backend/services/ura_sync_engine.py`

### Orchestration Flow
```
1. Acquire pg_advisory_lock (prevent concurrent runs)
2. Refresh URA API token
3. For batch in [1, 2, 3, 4]:
   a. Fetch transactions from URA API
   b. Filter: transaction_date >= cutoff_date (5 years back)
   c. Map to canonical schema
   d. Compute row_hash
   e. Insert to staging (1000-row chunks for memory efficiency)
4. Deduplicate staging (existing logic from upload.py)
5. Filter outliers (IQR 5.0x, existing logic)
6. Validate staging
7. Sliding window: DELETE recent API data (90 days)
8. Promote: INSERT ... ON CONFLICT (row_hash) DO NOTHING
9. Update etl_batches
10. Release lock, send email notification
```

### Cutoff Date Logic
```python
CUTOFF_DATE = date.today() - timedelta(days=5*365)  # Rolling 5 years

# API data: transaction_date >= CUTOFF_DATE
# CSV data: transaction_date < CUTOFF_DATE (preserved, never touched)
```

### Memory Efficiency (512MB Render Limit)
```python
def process_batch(raw_transactions: list) -> None:
    CHUNK_SIZE = 1000
    for i in range(0, len(raw_transactions), CHUNK_SIZE):
        chunk = raw_transactions[i:i+CHUNK_SIZE]
        mapped = [canonical_mapper.map(t) for t in chunk]
        upsert_to_staging(mapped)
        del chunk, mapped
        gc.collect()  # Force garbage collection
```

---

## Phase 5: Cron Job Setup (Pending)

### Files to Create/Modify
- `backend/routes/admin.py` (add endpoint)
- `render.yaml` (cron config)
- `scripts/ura_sync.py` (CLI entrypoint)

### Render Cron Configuration
```yaml
# render.yaml
cron:
  - name: ura-sync
    schedule: "0 17 * * 2,5,6"  # 01:00 SGT (Tue/Fri/Sat)
    command: python -m scripts.ura_sync
    envVars:
      - key: URA_SYNC_MODE
        value: shadow  # Start in shadow mode
```

### Schedule Rationale
- URA updates data on **Tuesday and Friday EOD**
- Cron runs **Tue/Fri/Sat** to catch updates
- 01:00 SGT (17:00 UTC) = low traffic, after URA update

### Admin Endpoint (Alternative Trigger)
```python
@admin_bp.route('/ura-sync', methods=['POST'])
@require_cron_secret
def trigger_ura_sync():
    from services.ura_sync_engine import run_sync
    result = run_sync(mode=os.getenv('URA_SYNC_MODE', 'disabled'))

    if result.error:
        send_alert_email(result)
        return jsonify(result.to_dict()), 500
    return jsonify(result.to_dict()), 200
```

---

## Phase 6: Shadow Mode Validation (Pending - 7-14 Days)

### Deployment Steps
1. Deploy all code from Phases 1-5
2. Set `URA_SYNC_MODE=shadow` in Render environment
3. Trigger first sync manually via admin endpoint
4. Monitor for 7-14 days

### Daily Monitoring Checklist
- [ ] Check email alerts (any failures?)
- [ ] Review diff reports in logs
- [ ] Verify row count within 0.1%
- [ ] Verify median PSF within 1%
- [ ] Verify all 28 districts present

### Success Criteria for Production Switch

| Metric | Threshold |
|--------|-----------|
| Row count difference | < 0.1% |
| PSF median difference | < 1% |
| District coverage | 28/28 |
| Consecutive clean days | >= 5 |

---

## Phase 7: Production Switch (Pending)

### Pre-Switch Checklist
- [ ] 5+ consecutive clean shadow runs
- [ ] Manual review of diff reports
- [ ] Backup of production transactions table
- [ ] Rollback plan documented and tested
- [ ] Team notified of switch

### Switch Steps
1. Set `URA_SYNC_MODE=production` in Render
2. Set `URA_CUTOFF_DATE` to 5 years back from today
3. Deploy
4. First production run will:
   - Preserve all CSV data (source='csv')
   - Insert API data (source='ura_api') for dates >= cutoff
5. Verify hybrid data integrity
6. Disable CSV upload route for dates >= cutoff (optional)

### Rollback Plan
```bash
# If something goes wrong:
1. Set URA_SYNC_MODE=disabled in Render
2. Run: DELETE FROM transactions WHERE source = 'ura_api'
3. Re-enable CSV upload
4. Investigate and fix
5. Re-attempt Phase 6 (shadow mode)
```

---

## Environment Variables

### Current (After Phase 0)
```bash
# Supabase Database (Transaction Pooler)
DATABASE_URL=postgresql://postgres.tjotitbnloyofxhwpumh:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres
```

### Required for Phases 1-7
```bash
# URA API
URA_ACCESS_KEY=<your-ura-access-key>
URA_SYNC_MODE=disabled|shadow|production
URA_CUTOFF_DATE=2021-01-01  # Adjust based on current date

# Alerting
ALERT_EMAIL=ops@example.com
SENDGRID_API_KEY=<key>

# Cron Authentication
CRON_SECRET=<random-32-char-string>
```

---

## Critical Files Reference

| Purpose | File Path |
|---------|-----------|
| Current schema | `backend/models/transaction.py` |
| Migrations | `backend/migrations/*.sql` |
| ETL batch tracking | `backend/services/etl/run_context.py` |
| Row hashing | `backend/services/etl/fingerprint.py` |
| Rate limiting | `backend/scrapers/rate_limiter.py` |
| Constants (enums) | `backend/constants.py` |
| CSV upload reference | `scripts/upload.py` |
| Data loader | `backend/services/data_loader.py` |
| Data validation | `backend/services/data_validation.py` |

---

## Verification Commands

### Phase 0 Verification (Supabase)
```sql
-- Row counts
SELECT 'transactions' as tbl, COUNT(*) FROM transactions
UNION ALL SELECT 'project_locations', COUNT(*) FROM project_locations
UNION ALL SELECT 'gls_tenders', COUNT(*) FROM gls_tenders;

-- Verify indexes exist
SELECT indexname FROM pg_indexes WHERE tablename = 'transactions';

-- Test outlier filter
SELECT COUNT(*) FROM transactions WHERE COALESCE(is_outlier, false) = false;
```

### Phases 1-7 Verification (URA API)
```sql
-- Verify hybrid data
SELECT source, COUNT(*), MIN(transaction_date), MAX(transaction_date)
FROM transactions
WHERE COALESCE(is_outlier, false) = false
GROUP BY source;

-- Check for duplicates (should return 0 rows)
SELECT row_hash, COUNT(*) FROM transactions
GROUP BY row_hash HAVING COUNT(*) > 1;

-- Compare shadow vs production aggregates
SELECT
    district,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
FROM transactions_shadow
WHERE transaction_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY district;
```

---

## Risk Mitigation Matrix

| Risk | Phase | Likelihood | Impact | Mitigation |
|------|-------|------------|--------|------------|
| Supabase connection issues | 0 | Low | High | Use connection pooler, keep Render DB 7 days |
| Data loss during migration | 0 | Low | Critical | pg_dump backup, verify row counts |
| URA API rate limiting | 1 | Medium | Medium | 6 req/min limit, exponential backoff |
| Token expiration mid-sync | 1 | Low | Low | Refresh before each batch, 23h TTL |
| API schema drift | 2 | Low | Medium | Unknown fields → raw_extras JSONB |
| Memory exhaustion (512MB) | 4 | Medium | High | 1000-row chunks, gc.collect() |
| Data inconsistency | 6 | Medium | High | 7-14 day shadow mode, exact match validation |
| Duplicate rows | 4 | Low | Medium | row_hash + ON CONFLICT DO NOTHING |
| Revised transactions missed | 4 | Medium | Medium | 90-day sliding window re-sync |

---

## Testing Verification Checklist

### Phase 0 (Supabase) ✅
- [x] Supabase project created
- [x] Connection strings obtained (Direct, Session Pooler, Transaction Pooler)
- [x] pg_dump from Render successful
- [x] psql import to Supabase successful
- [x] Row counts verified (119,269 transactions)
- [x] Render DATABASE_URL updated
- [x] App deployed and connected (IPv6 confirmed)
- [x] Frontend loads data correctly
- [ ] Keep Render PostgreSQL for 7 days (rollback safety)

### Phase 1 (URA API Client)
- [ ] Token refresh works
- [ ] Token caching works (23h TTL)
- [ ] Batch fetching works (1-4)
- [ ] Retry with backoff works
- [ ] Rate limiting respected
- [ ] Unit tests pass

### Phase 2 (Canonical Mapper)
- [ ] All field mappings correct
- [ ] Type conversions work (mmyy → date, typeOfSale → enum)
- [ ] Computed fields calculated correctly (psf, bedroom_count, floor_level)
- [ ] Unknown fields preserved in raw_extras
- [ ] Row hash matches CSV pipeline behavior
- [ ] Unit tests pass with URA sample data

### Phase 3 (Shadow Infrastructure)
- [ ] Migration applies cleanly
- [ ] source column added to transactions
- [ ] transactions_shadow table created
- [ ] Comparison logic works
- [ ] Diff report generated correctly

### Phase 4 (Sync Engine)
- [ ] Full sync flow works end-to-end
- [ ] Cutoff date filtering works
- [ ] Sliding window delete works
- [ ] Memory stays under 512MB
- [ ] Idempotent (re-run = no new rows)
- [ ] pg_advisory_lock prevents concurrent runs
- [ ] Integration tests pass

### Phase 5 (Cron Job)
- [ ] Render cron config valid
- [ ] Admin endpoint works
- [ ] CRON_SECRET authentication works
- [ ] Email alerts on failure work

### Phase 6 (Shadow Validation)
- [ ] Shadow sync runs successfully
- [ ] Daily diff reports generated
- [ ] Row count diff < 0.1%
- [ ] PSF diff < 1%
- [ ] All 28 districts present
- [ ] 5+ consecutive clean days

### Phase 7 (Production Switch)
- [ ] Production mode enabled
- [ ] First production sync successful
- [ ] Hybrid data verified (csv + ura_api sources)
- [ ] No duplicates introduced
- [ ] Aggregates match expected values
- [ ] Monitoring in place

---

## Execution Timeline

```
Week 1:   Phase 0 - Supabase migration ✅ DONE
Week 2:   Phases 1-2 - API client + mapper
Week 3:   Phases 3-4 - Shadow infra + sync engine
Week 4:   Phase 5 - Cron setup
Week 5-6: Phase 6 - Shadow validation (7-14 days)
Week 7:   Phase 7 - Production switch
```

**Each phase is a separate PR. No phase depends on uncommitted code from another.**

---

## Appendix: URA API Response Structure

### Token Response
```json
{
  "Status": "Success",
  "Result": "eyJhbGciOiJIUzI1NiJ9..."
}
```

### Transaction Response
```json
{
  "Result": [
    {
      "project": "THE SAIL @ MARINA BAY",
      "street": "MARINA BOULEVARD",
      "marketSegment": "CCR",
      "x": "29584.9",
      "y": "29432.2",
      "transaction": [
        {
          "contractDate": "0125",
          "propertyType": "Condominium",
          "district": "01",
          "tenure": "99 yrs lease commencing from 2005",
          "price": "1580000",
          "area": "764",
          "floorRange": "21 to 25",
          "typeOfSale": "3",
          "noOfUnits": "1"
        }
      ]
    }
  ]
}
```

---

## Document History

| Date | Change |
|------|--------|
| 2026-01-10 | Initial planning session completed |
| 2026-01-10 | Phase 0 (Supabase Migration) completed |
