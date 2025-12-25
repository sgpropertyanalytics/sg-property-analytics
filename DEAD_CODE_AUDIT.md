# Dead-Code & Dependency Audit Report

**Date:** 2025-12-25
**Codebase:** sg-property-analyzer (React/Vite Frontend + Python/Flask Backend)
**Auditor:** Claude (Senior Engineer Audit)

---

## Executive Summary

| Category | Count | Action |
|----------|-------|--------|
| **High Confidence Dead Code** | 12 items | Safe to delete |
| **Unused Dependencies** | 3 packages | Safe to remove |
| **Unused API Functions** | 32 exports | Safe to delete |
| **Low Confidence (Human Check)** | 6 items | Review before deleting |
| **Redundant/Duplicate Code** | 8 patterns | Consolidate |
| **Orphaned Feature Code** | 1 system | Business decision required |

---

## App Architecture Summary

### Entry Points
- **Frontend:** `frontend/src/main.jsx` → `App.jsx` (React Router v6)
- **Backend:** `backend/app.py` → Flask with 10 route blueprints

### Routes (React Router)
| Path | Component | Protected |
|------|-----------|-----------|
| `/` | LandingPage | No |
| `/login` | Login | No |
| `/pricing` | Pricing | No |
| `/market-pulse` | MacroOverviewContent | Yes |
| `/value-parity` | ValueParityPanel | Yes |
| `/floor-dispersion` | FloorDispersionContent | Yes |
| `/district-deep-dive` | DistrictDeepDiveContent | Yes |
| `/project-deep-dive` | ProjectDeepDiveContent | Yes |

### Dynamic Import Locations
Only one file uses lazy loading:
- `frontend/src/components/insights/index.jsx` - Lazy loads 3D map components

### Registry/Plugin Patterns
None detected. All imports are static ES modules.

---

## 1. Dead Code Candidates (HIGH CONFIDENCE)

### 1.1 Unused Frontend Components

| File | Component | Why Dead | Verification |
|------|-----------|----------|--------------|
| `frontend/src/components/ui/BlurredDashboard.jsx` | `BlurredDashboard` | Exported in ui/index.ts but never imported elsewhere | `grep -r "BlurredDashboard" frontend/src --include="*.jsx" --include="*.tsx" \| grep -v "^frontend/src/components/ui/"` |
| `frontend/src/components/ui/ChartFrame.jsx` | `ChartFrame` | Exported in ui/index.ts but never imported elsewhere | `grep -r "ChartFrame" frontend/src --include="*.jsx" --include="*.tsx" \| grep -v "^frontend/src/components/ui/"` |
| `frontend/src/components/ui/PreviewModeBar.jsx` | `PreviewModeBar` | Exported in ui/index.ts but never imported elsewhere | `grep -r "PreviewModeBar" frontend/src --include="*.jsx" --include="*.tsx" \| grep -v "^frontend/src/components/ui/"` |
| `frontend/src/components/unlock/ResearchStackPreview.jsx` | `ResearchStackPreview` | Not exported from any index, not imported anywhere | `grep -r "ResearchStackPreview" frontend/src` |
| `frontend/src/pages/ProjectAnalysis.jsx` | `ProjectAnalysisContent` | Route `/project-analysis` redirects to `/value-parity` (App.jsx:70) | `grep -r "ProjectAnalysisContent" frontend/src --include="*.jsx"` |

### 1.2 Unused Backend System (ENTIRE MODULE)

| File | What | Why Dead | Verification |
|------|------|----------|--------------|
| `backend/routes/ads.py` | Complete Ad System (4 endpoints) | No frontend calls to `/api/ads/*` | `grep -r "api/ads" frontend/` |
| `backend/models/ad_placement.py` | `AdPlacement` model | Only used by ads.py routes | Model imported only in ads.py |

**Endpoints in ads.py:**
- `GET /api/ads/serve`
- `POST /api/ads/click/<ad_id>`
- `POST /api/ads/impression/<ad_id>`
- `GET /api/ads/stats/<ad_id>`

### 1.3 Unused API Client Functions (32 total)

**Location:** `frontend/src/api/client.js`

#### Legacy Analytics (Lines 144-194)
```
getPriceTrends (line 144) - Superseded by getDashboard/getAggregate
getTotalVolume (line 147) - Superseded by getDashboard/getAggregate
getAvgPsf (line 150) - Superseded by getDashboard/getAggregate
getSaleTypeTrends (line 155) - Superseded by getDashboard/getAggregate
getPriceTrendsBySaleType (line 158) - Superseded by getDashboard/getAggregate
getPriceTrendsByRegion (line 161) - Superseded by getDashboard/getAggregate
getPsfTrendsByRegion (line 164) - Superseded by getDashboard/getAggregate
getMarketStats (line 181) - Superseded by getDashboard/getAggregate
getMarketStatsByDistrict (line 184) - Superseded by getDashboard/getAggregate
getProjectsByDistrict (line 187) - Superseded by getDashboard/getAggregate
getPriceProjectsByDistrict (line 190) - Superseded by getDashboard/getAggregate
getComparableValueAnalysis (line 193) - Superseded by getDashboard/getAggregate
```

#### Cache Functions (Never Called)
```
clearApiCache (line 128)
getCacheStats (line 135)
getDashboardCacheStats (line 266)
clearDashboardCache (line 272)
```

#### GLS Variants (Only getGLSAll is used)
```
getGLSUpcoming (line 377)
getGLSAwarded (line 386)
getGLSSupplyPipeline (line 406)
getGLSPriceFloor (line 414)
getGLSStats (line 420)
```

#### Upcoming Launches Variants (Only getUpcomingLaunchesAll is used)
```
getNewLaunchesAll (line 443) - Alias, never imported
getUpcomingLaunchesBySegment (line 450)
getUpcomingLaunchesSupplyPipeline (line 459)
getUpcomingLaunchesStats (line 465)
```

#### Filter & Inventory Functions
```
getFilterCount (line 338) - Calls non-existent endpoint!
syncInventory (line 507)
addManualInventory (line 519)
```

#### Deal Checker Variant
```
getDealCheckerNearbyTransactions (line 548) - Only getDealCheckerMultiScope is used
```

#### Unused Auth Functions (App uses Firebase OAuth, not email/password)
```
register (line 579)
login (line 583)
getCurrentUser (line 587)
```

**Verification command:**
```bash
grep -n "getFilterCount\|syncInventory\|register\|login\|getCurrentUser" frontend/src --include="*.jsx" --include="*.tsx" | grep -v "client.js" | grep -v "ChartJS.register"
```

---

## 2. Low Confidence Candidates (HUMAN REVIEW NEEDED)

### 2.1 Backend School System (Feature Not Exposed in UI)

**Status:** Complete backend implementation exists but NO frontend UI

| Endpoint | Route | Status |
|----------|-------|--------|
| `GET /projects/<project>/school-flag` | projects.py | No frontend call |
| `GET /projects/with-school` | projects.py | No frontend call |
| `GET /projects/locations` | projects.py | No frontend call |
| `GET /projects/school-flags` | projects.py | No frontend call |
| `GET /schools` | projects.py | No frontend call |
| `GET /schools/<school_id>` | projects.py | No frontend call |

**Model:** `PopularSchool` is used, and `school_distance.py` service is active

**Recommendation:** Business decision required - either:
- Build UI for school proximity feature, OR
- Mark for deprecation in next major version

### 2.2 Deprecated Backend Endpoints

| Endpoint | File | Why Deprecated |
|----------|------|----------------|
| `POST /upcoming-launches/scrape` | upcoming_launches.py | Returns 400 with deprecation message |
| `POST /upcoming-launches/validate` | upcoming_launches.py | Returns 400 with deprecation message |
| `DELETE /projects/cleanup-upcoming-launches` | projects.py | Migration cleanup endpoint |
| `POST /projects/populate-upcoming-launches` | projects.py | Migration population endpoint |

**Verification:** These endpoints return error responses when called.

### 2.3 Admin/Internal Endpoints (Keep - Not Dead)

These are NOT dead code - they're internal tools:
- `GET /debug/data-status`
- `POST /admin/update-metadata`
- `GET/POST /admin/filter-outliers`
- `GET /gls/needs-review`
- `POST /gls/scrape`
- `POST /gls/cron-refresh`
- `GET /gls/refresh-status`

---

## 3. Outdated/Redundant Code

### 3.1 Duplicate `formatPrice` Function (6 locations)

**Canonical location:** `frontend/src/constants/index.js:141`

**Duplicates to remove:**
| File | Line | Notes |
|------|------|-------|
| `frontend/src/components/powerbi/DealCheckerContent.jsx` | 18-24 | Identical |
| `frontend/src/components/powerbi/ScopeSummaryCards.jsx` | 12 | Identical |
| `frontend/src/components/powerbi/DistrictMicroChart.jsx` | 94 | Slightly different |
| `frontend/src/components/powerbi/ProjectDetailPanel.jsx` | 296 | Simplified |
| `frontend/src/components/powerbi/PriceDistributionChart.jsx` | 109 | Similar |
| `frontend/src/components/powerbi/GrowthDumbbellChart.jsx` | 260 | Similar |

### 3.2 Duplicate `ALL_DISTRICTS` Constant (3 locations)

**Canonical location:** `frontend/src/data/singaporeDistricts.js:124`

**Duplicates:**
- `frontend/src/components/powerbi/GrowthDumbbellChart.jsx:7`
- `frontend/src/components/powerbi/MarketMomentumGrid.jsx:8`

### 3.3 Duplicate `getRegionForDistrict` Function

**Canonical location:** `frontend/src/constants/index.js:26`

**Duplicate:** `frontend/src/components/insights/MarketStrategyMap.jsx:127`

### 3.4 Unused Exports in constants/index.js

```
getBedroomLabelFull (line 130) - Never imported
getSaleTypeLabel (line 281) - Never imported
isValidSaleType (line 342) - Never imported
isValidTenure (line ~345) - Never imported
```

### 3.5 Unused Imports in MarketHeatmap.jsx

File: `frontend/src/components/insights/MarketHeatmap.jsx:16-22`
```javascript
import {
  DISTRICT_SHORT_NAMES,    // NOT USED
  DISTRICT_REGIONS,         // NOT USED
} from '../../data/singaporeDistricts';
```

---

## 4. Unused Dependencies

### 4.1 Frontend (package.json)

| Package | Version | Why Unused | Verification |
|---------|---------|------------|--------------|
| `clsx` | ^2.1.1 | Not imported in any source file | `grep -r "clsx" frontend/src` |
| `tailwind-merge` | ^3.4.0 | Not imported in any source file | `grep -r "tailwind-merge" frontend/src` |

### 4.2 Backend (requirements.txt)

| Package | Why Unused | Verification |
|---------|------------|--------------|
| `playwright` | GLS scraper uses BeautifulSoup+requests instead | `grep -r "playwright" backend/ --include="*.py"` |

---

## 5. Safe Deletion Plan

### PR1: Remove Unused Frontend Components & UI Exports

**Files to DELETE:**
```
frontend/src/components/ui/BlurredDashboard.jsx
frontend/src/components/ui/ChartFrame.jsx
frontend/src/components/ui/PreviewModeBar.jsx
frontend/src/components/unlock/ResearchStackPreview.jsx
frontend/src/pages/ProjectAnalysis.jsx
```

**Files to EDIT:**
- `frontend/src/components/ui/index.ts` - Remove exports for deleted components

**Verification steps:**
```bash
cd frontend
npm run build
# Should complete without errors
```

**Risk:** Low - Components are not imported anywhere

---

### PR2: Remove Unused API Client Functions

**File:** `frontend/src/api/client.js`

**Functions to DELETE (32 total):**
```javascript
// Lines 128-138: Cache functions
clearApiCache, getCacheStats

// Lines 144-194: Legacy analytics
getPriceTrends, getTotalVolume, getAvgPsf, getSaleTypeTrends,
getPriceTrendsBySaleType, getPriceTrendsByRegion, getPsfTrendsByRegion,
getMarketStats, getMarketStatsByDistrict, getProjectsByDistrict,
getPriceProjectsByDistrict, getComparableValueAnalysis

// Lines 266-272: Dashboard cache
getDashboardCacheStats, clearDashboardCache

// Lines 338-339: Broken endpoint
getFilterCount

// Lines 377-420: GLS variants
getGLSUpcoming, getGLSAwarded, getGLSSupplyPipeline, getGLSPriceFloor, getGLSStats

// Lines 443-465: Upcoming launches variants
getNewLaunchesAll, getUpcomingLaunchesBySegment,
getUpcomingLaunchesSupplyPipeline, getUpcomingLaunchesStats

// Lines 507-519: Inventory functions
syncInventory, addManualInventory

// Line 548: Deal checker variant
getDealCheckerNearbyTransactions

// Lines 579-587: Auth functions (app uses Firebase)
register, login, getCurrentUser
```

**Verification steps:**
```bash
cd frontend
npm run build
# Should complete without errors
```

**Risk:** Low - Functions not imported anywhere

---

### PR3: Remove Unused Backend Ad System

**Files to DELETE:**
```
backend/routes/ads.py
backend/models/ad_placement.py
```

**Files to EDIT:**
- `backend/app.py` - Remove `ads_bp` import and registration (lines ~265, ~290)
- `backend/models/__init__.py` - Remove AdPlacement import if present

**Database migration:**
```bash
# If table exists in production:
flask db revision --autogenerate -m "Remove ad_placements table"
flask db upgrade
```

**Verification steps:**
```bash
cd backend
python -c "from app import create_app; app = create_app(); print('OK')"
pytest tests/
```

**Risk:** Low - No frontend calls this system

---

### PR4: Remove Deprecated Backend Endpoints

**Files to EDIT:**

`backend/routes/upcoming_launches.py` - Remove:
- `POST /upcoming-launches/scrape` endpoint
- `POST /upcoming-launches/validate` endpoint

`backend/routes/projects.py` - Remove:
- `DELETE /projects/cleanup-upcoming-launches` endpoint
- `POST /projects/populate-upcoming-launches` endpoint

**Verification steps:**
```bash
cd backend
python -c "from app import create_app; app = create_app(); print('OK')"
pytest tests/
```

**Risk:** Low - Endpoints already return 400 errors

---

### PR5: Remove Unused Dependencies

**Frontend (package.json):**
```bash
cd frontend
npm uninstall clsx tailwind-merge
npm run build
```

**Backend (requirements.txt):**
Remove line: `playwright`

```bash
cd backend
pip install -r requirements.txt
python -c "from app import create_app; app = create_app(); print('OK')"
```

**Risk:** Low - Packages not imported

---

### PR6 (Optional): Consolidate Duplicate Code

**Lower priority - refactoring, not dead code removal**

1. Update components to import `formatPrice` from `constants/index.js`
2. Update components to import `ALL_DISTRICTS` from `data/singaporeDistricts.js`
3. Remove duplicate function definitions
4. Remove unused imports in MarketHeatmap.jsx
5. Remove unused exports from constants/index.js

---

## Verification Checklist

Before each PR merge, run:

```bash
# Frontend
cd frontend
npm run build          # Must pass
npm run dev            # Smoke test

# Backend
cd backend
python -c "from app import create_app; app = create_app(); print('OK')"
pytest tests/          # Must pass

# Full integration
# Start backend: cd backend && flask run
# Start frontend: cd frontend && npm run dev
# Navigate all routes manually
```

---

## Items NOT Recommended for Deletion

### Backend Services
All 18 services are actively used with valid import chains.

### Backend Models
All 9 models are actively queried.

### Admin Endpoints
Internal tools for data management - keep for operations.

### School System (Needs Business Decision)
Complete backend exists - decide whether to build UI or deprecate.

---

## Appendix: Verification Commands

```bash
# Check for any imports of a component/function
grep -rn "FUNCTION_NAME" frontend/src --include="*.jsx" --include="*.tsx" --include="*.js"

# Check for API endpoint calls
grep -rn "api/ENDPOINT" frontend/src

# Check package usage
grep -rn "PACKAGE_NAME" frontend/src --include="*.jsx" --include="*.tsx" --include="*.js"

# Check Python imports
grep -rn "import PACKAGE" backend/ --include="*.py"
grep -rn "from PACKAGE" backend/ --include="*.py"
```
