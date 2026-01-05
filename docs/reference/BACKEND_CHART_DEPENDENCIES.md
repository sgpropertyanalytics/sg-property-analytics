# Backend Chart Dependencies Registry

> **IMPORTANT**: This file must be kept in sync with the codebase.
> Update this file whenever adding/modifying charts or endpoints.
> CI tests in `test_chart_dependencies.py` will fail if this drifts.

---

## Quick Reference

### Data Flow Overview

```
Data Sources → Services → Routes → Endpoints → Adapters → Charts → Pages
```

### Critical Paths (Most Common Impact)

| If You Change... | These Break... |
|------------------|----------------|
| `transactions` table | ALL analytics charts |
| `dashboard_service.py` | MacroOverview, DistrictOverview |
| `/api/aggregate` | 10+ charts across 5 pages |
| `/api/kpi-summary-v2` | All KPI cards on MacroOverview |
| `upcoming_launches.csv` | SupplyWaterfallChart |

---

## Section 1: Endpoint-to-Chart Mapping

### `/api/aggregate` (v2)

**Contract:** v2 with `assertKnownVersion` validation
**Service:** `dashboard_service.get_aggregated_data()`

| Chart | Page | Route | Group By | Metrics | Contract Validated |
|-------|------|-------|----------|---------|-------------------|
| TimeTrendChart | /market-overview | MacroOverview.jsx | month | median_psf, count | Yes |
| PriceDistributionChart | /market-overview | MacroOverview.jsx | bedroom | count | Yes |
| BeadsChart | /market-overview | MacroOverview.jsx | month,district | count | Yes |
| PriceCompressionChart | /market-overview | MacroOverview.jsx | quarter,region | median_psf, count | Yes |
| AbsolutePsfChart | /market-overview | MacroOverview.jsx | quarter,region | median_psf, count | Yes |
| MarketValueOscillator | /market-overview | MacroOverview.jsx | quarter | psf_percentiles | Yes |
| MarketMomentumGrid | /district-overview | DistrictDeepDive.jsx | quarter,district | median_psf, count | Yes |
| GrowthDumbbellChart | /district-overview | DistrictDeepDive.jsx | quarter,district | median_psf | Yes |
| NewVsResaleChart | /new-launch-market | NewLaunchMarket.jsx | month | count by sale_type | Yes |
| DistrictComparisonChart | Multiple | Various | district | median_psf, count | Yes |

### `/api/kpi-summary-v2`

**Contract:** v2
**Service:** `kpi_service.get_summary()`

| KPI ID | Card Location | Page | Dependencies | Update Frequency |
|--------|---------------|------|--------------|------------------|
| market_momentum | KPI Row | /market-overview | transactions (all) | Live |
| median_psf | KPI Row | /market-overview | transactions | Live |
| transaction_volume | KPI Row | /market-overview | transactions | Live |
| resale_velocity | KPI Row | /market-overview | transactions (resale) | Live |
| deal_detection | KPI Row | /market-overview | transactions + baseline | Live |

### `/insights/district-psf` (v1 - LEGACY)

**Contract:** v1 (NO validation - HIGH RISK)
**Service:** Inline in `routes/insights.py`

| Chart | Page | Filters | Notes |
|-------|------|---------|-------|
| MarketStrategyMap | /district-overview | period, bed, saleType | No contract validation |
| MarketHeatmap | /explore | period, bed | Legacy component |

### `/insights/district-liquidity` (v1 - LEGACY)

**Contract:** v1 (NO validation - HIGH RISK)
**Service:** Inline in `routes/insights.py`

| Chart | Page | Filters | Notes |
|-------|------|---------|-------|
| DistrictLiquidityMap | /district-overview | period, bed, saleType | Resale-only velocity metrics |

### `/api/supply-metrics`

**Contract:** Custom
**Service:** `supply_service.py`

| Chart | Page | Data Source | Notes |
|-------|------|-------------|-------|
| SupplyWaterfallChart | /supply-inventory | upcoming_launches.csv | Supply pipeline |
| InventoryBreakdownChart | /supply-inventory | upcoming_launches.csv | Inventory by status |

### `/api/transactions`

**Contract:** v2
**Service:** `transaction_service.py`

| Chart | Page | Params | Notes |
|-------|------|--------|-------|
| TransactionDataTable | /explore | Paginated list | Full transaction details |
| ProjectTransactions | Project modals | project_id filter | Project-specific |

### `/api/new-launch-timeline`

**Contract:** v2
**Service:** `new_launch_service.py`

| Chart | Page | Data Source | Notes |
|-------|------|-------------|-------|
| NewLaunchTimelineChart | /new-launch-market | new_launch_units.csv | Absorption rates |

---

## Section 2: Data Source-to-Endpoint Mapping

### Transaction Data (PostgreSQL `transactions` table)

**Source:** URA transaction data (monthly ingestion via ETL)
**Ingestion:** `etl-pipeline` agent, `scripts/ingest_transactions.py`

**Dependent Endpoints:**
| Endpoint | Usage |
|----------|-------|
| `/api/aggregate` | All transaction aggregations |
| `/api/kpi-summary-v2` | KPI calculations |
| `/insights/district-psf` | District PSF metrics |
| `/insights/district-liquidity` | Liquidity/velocity metrics |
| `/api/transactions` | Raw transaction list |

**Critical Fields:**
| Field | Used By | Impact if Changed |
|-------|---------|-------------------|
| `transaction_date` | Time series, date filters | All time-based charts |
| `psf` | PSF metrics, median calculations | All PSF charts |
| `sale_type` | New Sale vs Resale segmentation | Market mode toggle |
| `district` | Geographic grouping | All geographic charts |
| `bedroom_count` | Bedroom filters | Bedroom-filtered views |
| `is_outlier` | Data quality filter | Always excluded in queries |
| `region` | CCR/RCR/OCR grouping | Region breakdown charts |

### `upcoming_launches.csv`

**Location:** `backend/data/upcoming_launches.csv`
**Update Frequency:** Manual (project launches)

**Dependent Endpoints:**
| Endpoint | Usage |
|----------|-------|
| `/api/supply-metrics` | Supply pipeline data |

**Dependent Charts:**
- SupplyWaterfallChart
- InventoryBreakdownChart

### `new_launch_units.csv`

**Location:** `backend/data/new_launch_units.csv`
**Update Frequency:** Weekly (absorption data)

**Dependent Endpoints:**
| Endpoint | Usage |
|----------|-------|
| `/api/new-launch-absorption` | Unit-level absorption |
| `/api/new-launch-timeline` | Timeline visualization |

**Dependent Charts:**
- NewLaunchTimelineChart
- AbsorptionRateChart

### Projects Metadata (PostgreSQL `projects` table)

**Source:** Derived from transaction data + manual enrichment

**Dependent Endpoints:**
| Endpoint | Usage |
|----------|-------|
| `/api/projects/*` | Project details |
| `/api/filter-options` | Project dropdown |

---

## Section 3: Service-to-Route Mapping

### `dashboard_service.py`

**Location:** `backend/services/dashboard_service.py`

**Key Functions:**
| Function | Used By Route | Endpoint |
|----------|---------------|----------|
| `get_aggregated_data()` | `routes/analytics/__init__.py` | `/api/aggregate` |
| `build_time_series()` | Same | Time grouping logic |
| `apply_filters()` | Same | Filter application |

### `kpi_service.py`

**Location:** `backend/services/kpi_service.py`

**Key Functions:**
| Function | Used By Route | Endpoint |
|----------|---------------|----------|
| `get_kpi_summary()` | `routes/analytics/__init__.py` | `/api/kpi-summary-v2` |
| `calculate_momentum()` | Same | market_momentum KPI |
| `calculate_velocity()` | Same | resale_velocity KPI |

### `insights_service.py` (inline in routes)

**Location:** `backend/routes/insights.py`

**Inline Functions:**
| Function | Endpoint |
|----------|----------|
| `district_psf()` | `/insights/district-psf` |
| `district_liquidity()` | `/insights/district-liquidity` |

### `supply_service.py`

**Location:** `backend/services/supply_service.py`

**Key Functions:**
| Function | Used By Route | Endpoint |
|----------|---------------|----------|
| `get_supply_pipeline()` | `routes/supply.py` | `/api/supply-metrics` |
| `get_inventory_breakdown()` | Same | Inventory data |

---

## Section 4: Page-to-Chart Mapping

### `/market-overview` (MacroOverview.jsx)

**Data Scope:** Resale transactions only (hardcoded)

| Chart Component | Location | Endpoint | Lazy Loaded |
|-----------------|----------|----------|-------------|
| KPI Cards | `components/powerbi/KPICardRow.jsx` | `/api/kpi-summary-v2` | No |
| TimeTrendChart | `components/powerbi/TimeTrendChart.jsx` | `/api/aggregate` | No |
| PriceDistributionChart | `components/powerbi/PriceDistributionChart.jsx` | `/api/aggregate` | No |
| BeadsChart | `components/powerbi/BeadsChart.jsx` | `/api/aggregate` | No |
| PriceCompressionChart | `components/powerbi/PriceCompressionChart.jsx` | `/api/aggregate` | Yes |
| AbsolutePsfChart | `components/powerbi/AbsolutePsfChart.jsx` | `/api/aggregate` | Yes |
| MarketValueOscillator | `components/powerbi/MarketValueOscillator.jsx` | `/api/aggregate` | Yes |

### `/district-overview` (DistrictDeepDive.jsx)

**Data Scope:** Configurable (default: resale)

| Chart Component | Location | Endpoint | Mode |
|-----------------|----------|----------|------|
| DistrictLiquidityMap | `components/insights/DistrictLiquidityMap/` | `/insights/district-liquidity` | Volume |
| MarketStrategyMap | `components/insights/MarketStrategyMap.jsx` | `/insights/district-psf` | Price |
| MarketMomentumGrid | `components/powerbi/MarketMomentumGrid.jsx` | `/api/aggregate` | Price |
| GrowthDumbbellChart | `components/powerbi/GrowthDumbbellChart.jsx` | `/api/aggregate` | Price |

### `/new-launch-market` (NewLaunchMarket.jsx)

**Data Scope:** New Sale + Resale comparison

| Chart Component | Location | Endpoint |
|-----------------|----------|----------|
| NewVsResaleChart | `components/powerbi/NewVsResaleChart.jsx` | `/api/aggregate` |
| NewLaunchTimelineChart | `components/newlaunch/Timeline.jsx` | `/api/new-launch-timeline` |

### `/supply-inventory` (SupplyInsights.jsx)

| Chart Component | Location | Endpoint |
|-----------------|----------|----------|
| SupplyWaterfallChart | `components/supply/WaterfallChart.jsx` | `/api/supply-metrics` |
| InventoryBreakdownChart | `components/supply/InventoryChart.jsx` | `/api/supply-metrics` |

### `/explore` (Explore.jsx)

| Chart Component | Location | Endpoint |
|-----------------|----------|----------|
| MarketHeatmap | `components/insights/MarketHeatmap.jsx` | `/insights/district-psf` |
| TransactionDataTable | `components/powerbi/TransactionDataTable.jsx` | `/api/transactions` |

---

## Section 5: Impact Analysis Cheat Sheet

### "What breaks if I change `/api/aggregate`?"

**Risk Level:** CRITICAL (10+ charts)

**Affected Pages:**
- /market-overview (7 charts)
- /district-overview (2 charts)
- /new-launch-market (1 chart)

**High-Risk Charts:**
| Chart | Why High Risk |
|-------|---------------|
| TimeTrendChart | Core time series, highly visible |
| GrowthDumbbellChart | Complex growth calculations |
| MarketMomentumGrid | Grid rendering with momentum scoring |
| KPI dependency | Several KPIs derive from aggregate |

### "What breaks if I remove resale transaction data?"

**Risk Level:** CRITICAL (Entire MacroOverview)

**Affected Endpoints:**
- `/api/aggregate` (resale-only pages)
- `/insights/district-liquidity` (resale velocity)
- `/api/kpi-summary-v2` (resale KPIs)

**Affected Charts:**
- ALL charts on MacroOverview (resale-only page)
- DistrictLiquidityMap (resale velocity)
- GrowthDumbbellChart (median PSF growth)
- resale_velocity KPI card

### "What breaks if I change district classification?"

**Risk Level:** HIGH

**Affected Endpoints:**
- `/api/aggregate` (region grouping)
- `/insights/district-psf` (region assignment)
- `/insights/district-liquidity` (CCR/RCR/OCR breakdowns)

**Affected Charts:**
- All geographic visualizations
- Region breakdown charts (PriceCompressionChart)
- District comparison charts

### "What breaks if I remove `upcoming_launches.csv`?"

**Risk Level:** MEDIUM (Supply page only)

**Affected Endpoints:**
- `/api/supply-metrics`

**Affected Charts:**
- SupplyWaterfallChart
- InventoryBreakdownChart

**Affected Pages:**
- /supply-inventory (entire page)

---

## Section 6: How to Update This Registry

### When Adding a New Chart

1. Identify the endpoint(s) the chart calls
2. Add entry to Section 1 under appropriate endpoint
3. Add entry to Section 4 under appropriate page
4. Note any new data dependencies in Section 2

### When Adding a New Endpoint

1. Add new subsection in Section 1
2. Document all parameters and response fields
3. Map to data sources in Section 2
4. Add service mapping in Section 3

### When Modifying an Endpoint

1. Check all charts listed under that endpoint (Section 1)
2. Assess if response shape changes affect consumers
3. Update chart mappings if necessary
4. Document breaking changes in commit message

### When Removing Data

1. Find endpoint dependencies in Section 2
2. Cross-reference to charts in Section 1
3. Cross-reference to pages in Section 4
4. **DO NOT PROCEED** if charts still depend on the data
5. Update registry after safe removal

---

## Section 7: Validation Commands

```bash
# === VERIFY ENDPOINTS EXIST ===
# Check that all endpoints in this registry actually exist
grep -rn "@.*_bp.route\|@app.route" backend/routes/ | grep -v "__pycache__"

# === VERIFY CHARTS EXIST ===
# Check that all charts mentioned exist
ls frontend/src/components/powerbi/
ls frontend/src/components/insights/

# === VERIFY PAGES EXIST ===
# Check that all pages mentioned exist
ls frontend/src/pages/

# === FIND UNDOCUMENTED ENDPOINTS ===
# Find endpoints not in this registry
grep -rn "@analytics_bp.route" backend/routes/ | grep -v "__pycache__"

# === FIND UNDOCUMENTED CHARTS ===
# Find charts using endpoints not in registry
grep -rn "apiClient.get\|getAggregate" frontend/src/components/ | head -30
```

---

## Section 8: Last Updated

**Date:** 2025-12-30
**Updated By:** Claude Code
**Reason:** Initial creation of backend impact guardrails system
