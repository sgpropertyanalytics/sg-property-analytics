# Analytics Routes Filter Support Audit

## Summary

This audit checks all analytics routes for consistent filter handling (bedroom, district, segment, months/timeframe).

## Filter Support Status

| Route | bedroom | district | segment | months | Status | Notes |
|-------|---------|----------|---------|--------|--------|-------|
| `/health` | N/A | N/A | N/A | N/A | ✅ OK | Health check only |
| `/resale_stats` | ❌ | ⚠️ | ⚠️ | ❌ | 🔴 NEEDS FIX | Accepts districts/segment but reader ignores them |
| `/transactions` | ✅ | ✅ | ✅ | ✅ | ✅ OK | Fully supports all filters |
| `/price_trends` | ❌ | ❌ | ❌ | ❌ | 🔴 NEEDS FIX | Uses pre-computed, no filtering |
| `/total_volume` | ❌ | ❌ | ❌ | ❌ | 🔴 NEEDS FIX | Uses pre-computed, no filtering |
| `/avg_psf` | ❌ | ❌ | ❌ | ❌ | 🔴 NEEDS FIX | Uses pre-computed, no filtering |
| `/market_stats` | ❌ | ❌ | ⚠️ | ⚠️ | 🔴 NEEDS FIX | Accepts segment but reader ignores it; data_processor supports segment |
| `/market_stats_by_district` | ✅ | ✅ | ✅ | ✅ | ✅ FIXED | Now uses data_processor with all filters |
| `/price_trends_by_district` | ❌ | ❌ | ❌ | ❌ | 🔴 NEEDS FIX | Uses pre-computed; data_processor supports bedroom, segment |
| `/projects_by_district` | ✅ | ✅ | ✅ | ❌ | ✅ OK | Supports bedroom, district, segment |
| `/price_projects_by_district` | ✅ | ✅ | ❌ | ✅ | ✅ OK | Supports bedroom, district, months |
| `/comparable_value_analysis` | ✅ | ✅ | ❌ | ❌ | ✅ OK | Supports bedroom, districts, min_lease, sale_type |
| `/districts` | N/A | N/A | N/A | N/A | ✅ OK | List endpoint |
| `/sale_type_trends` | ❌ | ⚠️ | ⚠️ | ❌ | 🔴 NEEDS FIX | Uses pre-computed; data_processor supports districts, segment |
| `/price_trends_by_sale_type` | ❌ | ❌ | ❌ | ❌ | 🔴 NEEDS FIX | Uses pre-computed; data_processor supports bedroom, districts, segment |
| `/price_trends_by_region` | ❌ | ❌ | ❌ | ❌ | 🔴 NEEDS FIX | Uses pre-computed; data_processor supports bedroom, districts |
| `/psf_trends_by_region` | ❌ | ❌ | ❌ | ❌ | 🔴 NEEDS FIX | Uses pre-computed; data_processor supports bedroom, districts |

**Legend:**
- ✅ = Fully supported
- ⚠️ = Parameter accepted but not used (ignored)
- ❌ = Not supported
- 🔴 = Needs fix
- ✅ OK = Route is correct
- ✅ FIXED = Recently fixed

## Detailed Analysis

### Routes Using Pre-computed Stats (No Filtering)

These routes use `reader.get_*()` which reads from `PreComputedStats` table. Pre-computed stats only have one variant (all 2-4BR combined), so filtering is not possible without switching to live computation.

1. **`/resale_stats`** - Accepts `districts`, `segment` but reader ignores them
2. **`/price_trends`** - No parameters accepted
3. **`/total_volume`** - No parameters accepted
4. **`/avg_psf`** - No parameters accepted
5. **`/market_stats`** - No parameters accepted (but data_processor supports segment)
6. **`/price_trends_by_district`** - No parameters accepted
7. **`/sale_type_trends`** - No parameters accepted
8. **`/price_trends_by_sale_type`** - No parameters accepted
9. **`/price_trends_by_region`** - No parameters accepted
10. **`/psf_trends_by_region`** - No parameters accepted

### Data Processor Functions Available

These functions in `data_processor.py` support filtering and can be used instead of pre-computed stats:

- `get_market_stats(segment, short_months, long_months)` - Supports segment, months
- `get_market_stats_by_district(bedroom_types, districts, segment, short_months, long_months)` - ✅ Full support
- `get_price_trends_by_district(bedroom_types, top_n_districts, segment)` - Supports bedroom, segment
- `get_total_volume_by_district(bedroom_types, districts, segment)` - Supports all
- `get_avg_psf_by_district(bedroom_types, districts, segment)` - Supports all
- `get_sale_type_trends(districts, segment)` - Supports districts, segment
- `get_price_trends_by_sale_type(bedroom_types, districts, segment)` - Supports all
- `get_price_trends_by_region(bedroom_types, districts)` - Supports bedroom, districts
- `get_psf_trends_by_region(bedroom_types, districts)` - Supports bedroom, districts

## Fix Strategy

### Option 1: Switch to Live Computation (Recommended)
- Replace `reader.get_*()` calls with `data_processor.get_*()` calls
- Accept and parse filter parameters
- Pass parameters to data_processor functions
- **Pros:** Full filtering support, consistent behavior
- **Cons:** Slightly slower (but still fast with GLOBAL_DF)

### Option 2: Add Pre-computed Variants
- Create multiple pre-computed stat variants (e.g., `market_stats_2br`, `market_stats_3br`, etc.)
- Store in PreComputedStats with different keys
- **Pros:** Fastest performance
- **Cons:** Requires recomputing stats, more storage, complex key management

**Recommendation:** Use Option 1 (live computation) for consistency and flexibility.

## Priority Fixes

### High Priority (Used in Frontend with Filters)
1. `/market_stats_by_district` - ✅ ALREADY FIXED
2. `/price_trends_by_sale_type` - Used in Dashboard with bedroom filter
3. `/price_trends_by_region` - May be used with filters
4. `/psf_trends_by_region` - May be used with filters

### Medium Priority (May Accept Filters)
5. `/resale_stats` - Accepts districts/segment but ignores them
6. `/market_stats` - Should support segment
7. `/sale_type_trends` - Should support districts/segment

### Low Priority (Less Critical)
8. `/price_trends` - May not need filtering
9. `/total_volume` - May not need filtering
10. `/avg_psf` - May not need filtering
11. `/price_trends_by_district` - May not need filtering

