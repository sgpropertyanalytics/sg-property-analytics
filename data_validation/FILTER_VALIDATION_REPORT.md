# Market Pulse Filter Validation Report

**Date:** 2025-12-22
**API Tested:** https://sg-property-analyzer.onrender.com
**Total Records:** 102,590

---

## Summary

| Category | Tests | Passed | Failed | Notes |
|----------|-------|--------|--------|-------|
| Filter Options | 5 | 3 | 2 | Missing D24, 5+ bedroom |
| District Filters | 28 | 27 | 1 | D24 has no data |
| Bedroom Filters | 5 | 4 | 1 | 5+ bedroom has no data |
| Region Filters | 3 | 3 | 0 | |
| Sale Type Filters | 2 | 2 | 0 | |
| Date Range Filters | 5 | 5 | 0 | |
| Combinations | 21 | 21 | 0 | |
| Cross-Filter Consistency | 4 | 4 | 0 | |
| Dashboard Endpoint | 6 | 6 | 0 | |
| Data Accuracy | 4 | 4 | 0 | |

**Overall: 93.8% Pass Rate (76/81 tests)**

---

## Issues Found

### 1. DATA GAPS

#### 1.1 District D24 - No Data
- **Location:** Lim Chu Kang / Tengah
- **Impact:** D24 filter returns 0 records
- **Root Cause:** D24 is largely undeveloped land (Tengah new town under construction, Lim Chu Kang is military/agricultural)
- **Severity:** Low - Expected data gap
- **Action:** Consider removing D24 from filter options OR adding a note in UI

#### 1.2 5+ Bedroom - No Data
- **Impact:** Bedroom filter "5" returns 0 records
- **Root Cause:** Either no 5+ bedroom condos in the dataset, or bedroom_count caps at 4
- **Severity:** Medium - Should verify if this is intentional
- **Action:** Check database for bedroom_count > 4 records; if none exist, remove 5+ from UI filter options

### 2. CODE BUGS

#### 2.1 VolumeByLocationChart.jsx - Incorrect District-to-Region Mapping
- **File:** `frontend/src/components/powerbi/VolumeByLocationChart.jsx`
- **Lines:** 183-195
- **Issue:** Hardcoded district-to-region color mapping is incorrect

**Current Code (BUGGY):**
```javascript
if (districtNum >= 1 && districtNum <= 11) {
  // Treats D01-D11 as CCR - WRONG!
  // D03, D04, D05, D08 are actually RCR
} else if ([12, 13, 14, 15, 20, 21].includes(districtNum)) {
  // Treats D21 as RCR - WRONG!
  // D21 is actually OCR
}
```

**Correct Mapping (from constants/index.js):**
- **CCR:** D01, D02, D06, D07, D09, D10, D11
- **RCR:** D03, D04, D05, D08, D12, D13, D14, D15, D20
- **OCR:** D16-D19, D21-D28

**Fix:** Import `getRegionForDistrict` from constants and use it:
```javascript
import { getRegionForDistrict } from '../../constants';

// In getRegionColor function:
const region = getRegionForDistrict(location);
const colors = {
  CCR: `rgba(33, 52, 72, ${alpha})`,
  RCR: `rgba(84, 119, 146, ${alpha})`,
  OCR: `rgba(148, 180, 193, ${alpha})`
};
return colors[region] || colors.OCR;
```

- **Severity:** Medium - Causes visual misrepresentation
- **Impact:** District bars show wrong region colors when drilled to district level

---

## Tests Passed

### Filter Consistency
- Region sum equals total: CCR (20,331) + RCR (38,557) + OCR (43,702) = 102,590 ✓
- Sale type sum equals total: New Sale (39,695) + Resale (62,895) = 102,590 ✓
- Bedroom sum equals total: 1BR + 2BR + 3BR + 4BR = 102,590 ✓
- Time granularity consistent: Year totals match monthly sums ✓

### Cross-Filter Behavior
- District filters properly subset data
- Region filters properly subset data
- Combined filters (region + bedroom) work correctly
- Date range filters work correctly
- Price range filters work correctly
- PSF range filters work correctly

### Dashboard Endpoint
- Unified dashboard endpoint works with all filter combinations
- New vs Resale endpoint respects global filters
- Response times acceptable (< 6 seconds for complex queries)

---

## Recommendations

### Immediate Fixes
1. Fix `VolumeByLocationChart.jsx` district-to-region mapping bug

### Data Cleanup
1. Investigate why 5+ bedroom returns no data
2. Consider adding disclaimer for D24 (no transactions expected)

### Future Enhancements
1. Add automated regression tests for filter validation
2. Add data freshness monitoring
3. Add response time monitoring for API endpoints

---

## Test Scripts Created

1. **`data_validation/market_pulse_filter_tester.py`**
   - Comprehensive filter testing script
   - Tests all filter combinations
   - Validates data consistency
   - Run: `python data_validation/market_pulse_filter_tester.py`

---

## Appendix: District Data Counts

| District | Region | Count |
|----------|--------|-------|
| D01 | CCR | 1,625 |
| D02 | CCR | 1,265 |
| D06 | CCR | 608 |
| D07 | CCR | 1,305 |
| D09 | CCR | 5,656 |
| D10 | CCR | 7,291 |
| D11 | CCR | 2,581 |
| D03 | RCR | 5,430 |
| D04 | RCR | 2,049 |
| D05 | RCR | 7,893 |
| D08 | RCR | 1,484 |
| D12 | RCR | 3,189 |
| D13 | RCR | 1,861 |
| D14 | RCR | 4,345 |
| D15 | RCR | 9,607 |
| D20 | RCR | 2,699 |
| D16 | OCR | 4,016 |
| D17 | OCR | 2,291 |
| D18 | OCR | 5,882 |
| D19 | OCR | 9,441 |
| D21 | OCR | 5,130 |
| D22 | OCR | 2,295 |
| D23 | OCR | 5,734 |
| D24 | OCR | **0** |
| D25 | OCR | 906 |
| D26 | OCR | 3,969 |
| D27 | OCR | 2,557 |
| D28 | OCR | 1,481 |
