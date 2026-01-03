---
name: api-guardrails
description: API design, endpoint standardization, and URL routing guardrails. ALWAYS activate before creating new backend endpoints, debugging 404s, or modifying API client setup. Merged from api-endpoint-guardrails and api-url-guardrails.
---

# API Guardrails

Comprehensive API design, routing, and debugging guardrails.

**Trigger:** `/api-guardrails`, creating new endpoints, debugging 404s, API client changes

---

# PART 1: API DESIGN PRINCIPLES

## 1.1 What Should Be an API Endpoint

Create an API when the data is a **first-class concept** with independent meaning:

| Criterion | Example |
|-----------|---------|
| **Real domain resource** (CRUD-able) | projects, transactions, users |
| **Expensive/requires DB access** | aggregations, joins, filtered queries |
| **Access-controlled** | subscription tiers, user data |
| **Multiple screens need it** | shared contract, centralized caching |
| **Must be stable/versionable** | future clients (mobile, partner APIs) |

## 1.2 What Should NOT Be an Endpoint

| Anti-Pattern | Why | Solution |
|--------------|-----|----------|
| **Enum-like UI options** | Not resources, just metadata | Bundle into `/api/filter-options` |
| **Derived subset of another endpoint** | Creates drift | Pick ONE canonical source |
| **"Convenience" shortcuts** | Gets deleted during refactors | Use existing endpoint with params |

## 1.3 Decision Checklist

**Create separate endpoint only if >=2 answers are YES:**

```
[ ] Does it represent a real domain object?
[ ] Does it need auth/permissions?
[ ] Does it require DB joins/aggregations?
[ ] Is it reused across multiple pages/clients?
[ ] Does it need its own caching/TTL?
[ ] Will it evolve independently (schema changes)?

If NO to most -> bundle into existing endpoint
```

---

# PART 2: ENDPOINT STANDARDIZATION

## 2.1 The /aggregate Decision Tree

```
Need new data for a chart?
           |
Is it project-scoped?
(e.g., /projects/<name>/...)
           |
    YES    |    NO
     |          |
  OK: Dedicated    Can /aggregate handle it?
  project endpoint Check metrics list below
                         |
                   YES   |   NO
                    |         |
               USE /aggregate   EXTEND /aggregate
               with existing    Add new metric/group_by
```

## 2.2 What /aggregate Supports

### Group By Dimensions

```
month, quarter, year, district, bedroom, sale_type, project, region, floor_level
```

### Metrics

```
count, median_psf, avg_psf, total_value, median_price, avg_price,
min_psf, max_psf, price_25th, price_75th, psf_25th, psf_75th
```

### Filters

```
district, bedroom, segment, sale_type, date_from, date_to,
psf_min, psf_max, size_min, size_max, tenure, project
```

## 2.3 Extending /aggregate

### Pattern 1: New Metric

```python
# In /aggregate endpoint, add to METRICS dict:
METRICS = {
    # ... existing ...
    'p25_psf': func.percentile_cont(0.25).within_group(Transaction.psf),
    'p75_psf': func.percentile_cont(0.75).within_group(Transaction.psf),
}

# Usage:
# GET /aggregate?group_by=bedroom,region&metrics=p25_psf,p75_psf
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

## 2.4 Forbidden Patterns

```python
# FORBIDDEN: Dedicated endpoints that duplicate /aggregate
@analytics_bp.route("/psf_trends_by_bedroom", methods=["GET"])
def psf_trends_by_bedroom():
    # This is just /aggregate?group_by=bedroom,month&metrics=median_psf
    ...

# FORBIDDEN: Stats endpoint that duplicates /aggregate
@analytics_bp.route("/market_stats_by_region", methods=["GET"])
def market_stats_by_region():
    # This is just /aggregate?group_by=region&metrics=count,median_psf
    ...
```

## 2.5 When Dedicated Endpoints ARE Allowed

1. **Project-scoped analysis** with complex business logic
   - `/projects/<name>/price-bands`
   - `/projects/<name>/exit-queue`

2. **Admin/Debug endpoints**
   - `/admin/*`
   - `/debug/*`

3. **Special data sources** (not from transactions table)
   - `/projects/resale-projects`
   - `/filter-options`

4. **Deprecated endpoints** (410 responses only)

---

# PART 3: URL & ROUTING

## 3.1 Single Source of Truth

```javascript
// frontend/src/api/client.js - THE ONLY PLACE
const getApiBase = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (import.meta.env.PROD) {
    return '/api';  // Vercel rewrites to backend
  }
  return 'http://localhost:5000/api';
};

const API_BASE = getApiBase();
```

**FORBIDDEN:**

```javascript
// Hardcoded URLs in components
fetch('https://sg-property-analyzer.onrender.com/api/health')

// Inconsistent paths
fetch('/health')      // One place
fetch('/api/health')  // Another place

// Raw fetch bypassing apiClient
fetch('/api/aggregate?...')
```

**REQUIRED:**

```javascript
// Always use apiClient
import apiClient from '../api/client';
apiClient.get('/aggregate', { params });
```

## 3.2 Canonical Prefix

```
Backend serves:  /api/*
Frontend calls:  /api/* (via apiClient)
Vercel rewrites: /api/* -> backend
```

**Current Setup:**
- `vercel.json`: `/api/:path*` -> `https://sg-property-analyzer.onrender.com/api/:path*`
- Backend: Flask routes under `/api/` blueprint
- Frontend: `apiClient` with `baseURL: '/api'` in prod

## 3.3 Environment Parity

```javascript
// Production (Vercel)
baseURL: '/api'  // Vercel proxy handles CORS

// Development (localhost)
baseURL: 'http://localhost:5000/api'  // Direct to Flask
```

## 3.4 No Import-Time Side Effects

```
RULE: Never do I/O, heavy compute, or data loading at import time.

ALLOWED at module top-level:
  - Constants
  - Type definitions
  - Function definitions

FORBIDDEN at module top-level:
  - fetch() / axios calls
  - Database queries
  - File reads
  - Heavy computation

PUT SIDE EFFECTS INSIDE:
  - Request handlers
  - Service functions
  - useEffect / lifecycle hooks
```

---

# PART 4: DEBUGGING 404s

## 4.1 Step-by-Step Checklist

```
1. CHECK VERCEL REWRITES
   - frontend/vercel.json has correct rewrite rule?
   - Source: /api/:path* -> Destination: backend URL

2. CHECK BACKEND URL
   - Is Render service awake? (free tier sleeps)
   - curl https://sg-property-analyzer.onrender.com/api/health

3. CHECK FRONTEND CONFIG
   - Browser DevTools -> Network tab
   - Console: apiClient.defaults.baseURL

4. CHECK ENVIRONMENT VARIABLES
   - Vercel Dashboard -> Environment Variables
   - Rebuild after changing env vars

5. CHECK CORS
   - If CORS error -> backend CORS config missing origin
```

## 4.2 Common Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| 404 on `/api/*` in prod | Missing vercel.json rewrite | Add rewrite rule |
| Works locally, 404 in prod | Different URL patterns | Ensure parity |
| Intermittent 404s | Render cold start | Add health check ping |
| CORS errors | Backend missing origin | Add frontend URL to allowed |

## 4.3 Smoke Test Before Deploy

```bash
#!/bin/bash
ENDPOINTS=("/api/health" "/api/filter-options" "/api/aggregate?group_by=region&metrics=count")
BASE_URL=${1:-"https://sg-property-analyzer.onrender.com"}

for endpoint in "${ENDPOINTS[@]}"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$endpoint")
  if [ "$status" != "200" ]; then
    echo "FAIL: $endpoint returned $status"
    exit 1
  fi
  echo "OK: $endpoint"
done
```

---

# PART 5: QUICK AUDIT COMMANDS

```bash
# Find potential endpoint proliferation
grep -rn "@.*_bp.route\|@app.route" backend/routes/ | wc -l

# Find endpoints that could be /aggregate
grep -rn "group_by\|GROUP BY" backend/routes/

# Find endpoints missing v2 support
grep -rn "def .*():" backend/routes/analytics.py -A10 | grep -v "schema=v2"

# Find hardcoded API URLs
grep -rn "fetch.*http" frontend/src/
grep -rn "onrender.com" frontend/src/

# Find fetch calls bypassing apiClient
grep -rn "fetch('/api" frontend/src/components/

# Find import-time side effects
grep -rn "^fetch\|^axios\|^await " frontend/src/
```

---

# PART 6: PRE-COMMIT CHECKLIST

```
ENDPOINT DESIGN:
[ ] Checked /aggregate docs - can existing params handle this?
[ ] If not, identified which metric/group_by to ADD to /aggregate
[ ] NOT creating a dedicated endpoint for something /aggregate can do
[ ] If project-scoped: justified why it needs dedicated endpoint
[ ] Response follows contract_schema.py patterns

URL & ROUTING:
[ ] All API calls use apiClient (not raw fetch)
[ ] No hardcoded backend URLs in components
[ ] vercel.json rewrite rule matches backend route prefix
[ ] Dev and prod use same /api/* pattern
[ ] No I/O or data loading at module top-level
[ ] smoke-test.sh passes against prod
```

---

# QUICK REFERENCE CARD

```
API GUARDRAILS

ENDPOINT DESIGN:
[ ] Can /aggregate handle it? -> USE IT
[ ] Missing metric? -> ADD TO /aggregate
[ ] Missing group_by? -> ADD TO /aggregate
[ ] Project-scoped with complex logic? -> OK to create
[ ] Otherwise? -> STOP - extend /aggregate

URL ROUTING:
SOURCE OF TRUTH: frontend/src/api/client.js
CANONICAL PATTERN: /api/*
DEV: http://localhost:5000/api
PROD: /api (Vercel proxy)

DEBUG 404:
1. curl backend directly
2. Check vercel.json rewrite
3. Check Network tab URL
4. Check VITE_API_URL env var
```
