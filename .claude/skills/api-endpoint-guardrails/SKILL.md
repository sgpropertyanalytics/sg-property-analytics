---
name: api-endpoint-guardrails
description: API endpoint standardization guardrails. ALWAYS activate before creating ANY new backend endpoint. Forces use of /api/aggregate with metric extensions instead of dedicated endpoints. Prevents endpoint proliferation and duplicate SQL logic.
---

# API Endpoint Standardization Guardrails

## Purpose

Prevent endpoint proliferation by enforcing use of the generic `/api/aggregate` endpoint. New chart/visualization features MUST extend `/aggregate` rather than create dedicated endpoints.

---

## Part 1: The Decision Tree

### Before Creating ANY New Endpoint, Ask:

```
                    ┌─────────────────────────────────┐
                    │  Need new data for a chart?     │
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │  Is it project-scoped?          │
                    │  e.g., /projects/<name>/...     │
                    └────────────────┬────────────────┘
                                     │
                    ┌────── YES ─────┴───── NO ───────┐
                    │                                  │
        ┌───────────▼───────────┐     ┌───────────────▼───────────────┐
        │  OK: Dedicated        │     │  Can /aggregate handle it?    │
        │  project endpoint     │     │  Check metrics list below     │
        └───────────────────────┘     └───────────────┬───────────────┘
                                                      │
                                      ┌────── YES ────┴───── NO ──────┐
                                      │                                │
                          ┌───────────▼───────────┐   ┌───────────────▼───────────────┐
                          │  USE /aggregate       │   │  EXTEND /aggregate            │
                          │  with existing params │   │  Add new metric/group_by      │
                          └───────────────────────┘   └───────────────────────────────┘
```

---

## Part 2: What /aggregate Already Supports

### Group By Dimensions
```
month, quarter, year, district, bedroom, sale_type, project, region, floor_level
```

### Metrics
```
count, median_psf, avg_psf, total_value, median_price, avg_price,
min_psf, max_psf, price_25th, price_75th, psf_25th, psf_75th, median_psf_actual
```

### Filters
```
district, bedroom, segment, sale_type, date_from, date_to,
psf_min, psf_max, size_min, size_max, tenure, project
```

---

## Part 3: When to EXTEND /aggregate

If your feature needs something not in the lists above:

### Pattern 1: New Metric

```python
# In /aggregate endpoint, add to METRICS dict:
METRICS = {
    # ... existing ...
    'p25_psf': func.percentile_cont(0.25).within_group(Transaction.psf),
    'p50_psf': func.percentile_cont(0.50).within_group(Transaction.psf),
    'p75_psf': func.percentile_cont(0.75).within_group(Transaction.psf),
}

# Usage:
# GET /aggregate?group_by=bedroom,region&metrics=p25_psf,p50_psf,p75_psf
```

### Pattern 2: New Group By Dimension

```python
# In /aggregate endpoint, add to GROUP_BY_COLUMNS dict:
GROUP_BY_COLUMNS = {
    # ... existing ...
    'age_bucket': func.case(
        (Transaction.property_age < 5, 'new'),
        (Transaction.property_age < 10, 'young'),
        else_='mature'
    ),
}

# Usage:
# GET /aggregate?group_by=age_bucket,bedroom&metrics=count,median_psf
```

### Pattern 3: K-Anonymity Option

```python
# Add optional parameter:
k_threshold = request.args.get('k_threshold', type=int)

# Apply suppression to results:
if k_threshold:
    data = [row for row in data if row['count'] >= k_threshold]

# Usage:
# GET /aggregate?group_by=bedroom,district&metrics=count,median_psf&k_threshold=15
```

---

## Part 4: Forbidden Patterns

### NEVER Create Dedicated Endpoints For:

```python
# FORBIDDEN: Trend endpoint that duplicates /aggregate
@analytics_bp.route("/psf_trends_by_bedroom", methods=["GET"])
def psf_trends_by_bedroom():
    # This is just /aggregate?group_by=bedroom,month&metrics=median_psf
    ...

# FORBIDDEN: Stats endpoint that duplicates /aggregate
@analytics_bp.route("/market_stats_by_region", methods=["GET"])
def market_stats_by_region():
    # This is just /aggregate?group_by=region&metrics=count,median_psf,avg_psf
    ...

# FORBIDDEN: Percentage distribution (add percentage metric instead)
@analytics_bp.route("/distribution_by_type", methods=["GET"])
def distribution_by_type():
    # Instead: /aggregate?group_by=sale_type&metrics=count,pct
    ...
```

---

## Part 5: When Dedicated Endpoints ARE Allowed

### Allowed Cases:

1. **Project-scoped analysis** with complex business logic
   - `/projects/<name>/price-bands` - Fallback hierarchy, trend analysis
   - `/projects/<name>/exit-queue` - Complex risk calculation

2. **Admin/Debug endpoints**
   - `/admin/*` - Internal operations
   - `/debug/*` - Diagnostics

3. **Special data sources** (not from transactions table)
   - `/projects/resale-projects` - Project metadata
   - `/filter-options` - Dropdown options

4. **Deprecated endpoints** (410 responses only)
   - Keep as tombstones to prevent re-creation

---

## Part 6: Pre-Commit Checklist

Before adding ANY backend endpoint:

```
[ ] Checked /aggregate docs - can existing params handle this?
[ ] If not, identified which metric/group_by to ADD to /aggregate
[ ] NOT creating a dedicated endpoint for something /aggregate can do
[ ] If project-scoped: justified why it needs dedicated endpoint
[ ] SQL follows sql-guardrails (see that skill)
[ ] Response follows api_contract.py patterns
[ ] Tests cover v1 and v2 schema modes
```

---

## Part 7: Endpoint Consolidation Roadmap

### Phase 1: Deprecate Redundant Endpoints (Add 410s)

```python
@analytics_bp.route("/sale_type_trends", methods=["GET"])
def sale_type_trends_deprecated():
    return jsonify({
        "error": "Endpoint deprecated",
        "use_instead": "/aggregate?group_by=sale_type,month&metrics=count,median_psf"
    }), 410
```

### Phase 2: Extend /aggregate with Missing Features

| Feature | Add to /aggregate |
|---------|-------------------|
| Percentiles | `metrics=p25,p50,p75` |
| K-anonymity | `k_threshold=15` |
| Percentage | `metrics=count,pct` |
| Age buckets | `group_by=age_bucket` |

### Phase 3: Remove Deprecated Code

After frontend migrates to `/aggregate`:
1. Delete deprecated route handlers
2. Delete orphaned service functions
3. Delete orphaned api_contract code

---

## Quick Reference Card

```
API ENDPOINT GUARDRAILS

BEFORE CREATING NEW ENDPOINT:
[ ] Can /aggregate handle it? → USE IT
[ ] Missing metric? → ADD TO /aggregate
[ ] Missing group_by? → ADD TO /aggregate
[ ] Project-scoped with complex logic? → OK to create
[ ] Admin/debug? → OK to create
[ ] Otherwise? → STOP - extend /aggregate

GOLDEN RULE:
One generic endpoint (/aggregate) > many specific endpoints
```
