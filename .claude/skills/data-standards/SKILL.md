---
name: data-standards
description: Data classification and naming standards guardrail. ALWAYS activate before creating ANY new chart, filter, or data display. Enforces consistent use of centralized constants for regions, bedrooms, floor levels, sale types, tenures, and age bands. Prevents hardcoded strings.
---

# Data Standards Guardrail

## Purpose

Ensure all data classifications, labels, and naming conventions are consistent across backend and frontend. All new features MUST use centralized constants.

---

## Part 1: Single Source of Truth Files

| Domain | Backend | Frontend |
|--------|---------|----------|
| **All Classifications** | `backend/constants.py` | `frontend/src/constants/index.js` |
| **Enums (Sale Type, Tenure)** | `backend/schemas/api_contract.py` | `frontend/src/schemas/apiContract.js` |

**RULE**: If a constant doesn't exist in these files, ADD IT THERE FIRST.

---

## Part 2: Region/Segment Standards

### Canonical Values

| Code | Full Name | Districts |
|------|-----------|-----------|
| `CCR` | Core Central Region | D01, D02, D06, D07, D09, D10, D11 |
| `RCR` | Rest of Central Region | D03, D04, D05, D08, D12, D13, D14, D15, D20 |
| `OCR` | Outside Central Region | D16-D19, D21-D28 |

### Usage

```javascript
// CORRECT - Use constants
import { REGIONS, CCR_DISTRICTS, getRegionForDistrict, REGION_BADGE_CLASSES } from '../constants';

REGIONS.forEach(region => { ... });  // ['CCR', 'RCR', 'OCR']
const region = getRegionForDistrict(district);
const badgeClass = REGION_BADGE_CLASSES[region];

// FORBIDDEN - Hardcoded
const regions = ['CCR', 'RCR', 'OCR'];  // Use REGIONS constant instead
if (district === 'D01') region = 'CCR';  // Use getRegionForDistrict()
```

### Backend

```python
# CORRECT
from constants import get_region_for_district, CCR_DISTRICTS

# FORBIDDEN
if district in ['D01', 'D02', 'D06', ...]:  # Hardcoded list
```

---

## Part 3: Bedroom Standards

### Canonical Values

| Count | Short Label | Full Label | API Value |
|-------|-------------|------------|-----------|
| 1 | `1BR` | `1-Bedroom` | `1` |
| 2 | `2BR` | `2-Bedroom` | `2` |
| 3 | `3BR` | `3-Bedroom` | `3` |
| 4 | `4BR` | `4-Bedroom` | `4` |
| 5+ | `5BR+` | `5-Bedroom+` | `5` |

### Bedroom Classification (Three-Tier System)

**SINGLE SOURCE OF TRUTH:**
- **Frontend**: `frontend/src/constants/index.js`
- **Backend**: `backend/services/classifier.py`

URA data doesn't include bedroom count. We estimate based on unit area (sqft) with **three tiers**:

| Tier | Context | 1BR | 2BR | 3BR | 4BR | 5BR+ |
|------|---------|-----|-----|-----|-----|------|
| **Tier 1** | New Sale ≥ Jun 2023 (Post-Harmonization) | <580 | <780 | <1150 | <1450 | ≥1450 |
| **Tier 2** | New Sale < Jun 2023 (Pre-Harmonization) | <600 | <850 | <1200 | <1500 | ≥1500 |
| **Tier 3** | Resale (any date) | <600 | <950 | <1350 | <1650 | ≥1650 |

**Why three tiers?**
- **Tier 1 (Ultra Compact)**: After June 2023 AC ledge removal rules, developers build smaller units
- **Tier 2 (Modern Compact)**: Pre-2023 new sales still had AC ledges counted in GFA
- **Tier 3 (Legacy)**: Resale units are typically larger (older developments)

### Usage

```javascript
// CORRECT - Use constants
import {
  BEDROOM_ORDER,           // ['1BR', '2BR', '3BR', '4BR', '5BR+']
  BEDROOM_ORDER_NUMERIC,   // [1, 2, 3, 4, 5]
  BEDROOM_THRESHOLDS_TIER1,
  BEDROOM_THRESHOLDS_TIER2,
  BEDROOM_THRESHOLDS_TIER3,
  classifyBedroom,         // Simple fallback
  classifyBedroomThreeTier, // Full 3-tier logic
  getBedroomLabelShort,
} from '../constants';

// Classify a unit
const bedroom = classifyBedroomThreeTier(750, 'New Sale', '2024-01-15');
// Returns: 2 (Tier 1: 750 < 780)

// For display/sorting
BEDROOM_ORDER.forEach(br => { ... });
const label = getBedroomLabelShort(2);  // "2BR"

// FORBIDDEN - Hardcoded
const BEDROOM_ORDER = ['1BR', '2BR', '3BR', '4BR', '5BR+'];  // Use constant
if (area < 580) bedroom = 1;  // Use classifyBedroomThreeTier()
```

### Backend Usage

```python
# CORRECT - Use services/classifier.py
from services.classifier import classify_bedroom_three_tier, classify_bedroom

bedroom = classify_bedroom_three_tier(750, 'New Sale', date(2024, 1, 15))

# FORBIDDEN
if area < 580:
    bedroom = 1  # Hardcoded threshold
```

---

## Part 4: Floor Level Standards

### Canonical Values

| Level | Floor Range | Sort Order |
|-------|-------------|------------|
| `Low` | 01-05 | 0 |
| `Mid-Low` | 06-10 | 1 |
| `Mid` | 11-20 | 2 |
| `Mid-High` | 21-30 | 3 |
| `High` | 31-40 | 4 |
| `Luxury` | 41+ | 5 |

### Usage

```javascript
// CORRECT
import { FLOOR_LEVELS, FLOOR_LEVEL_LABELS, getFloorLevelColor } from '../constants';

FLOOR_LEVELS.forEach(level => {
  const label = FLOOR_LEVEL_LABELS[level];
  const color = getFloorLevelColor(level);
});

// FORBIDDEN
const levels = ['Low', 'Mid-Low', 'Mid', 'Mid-High', 'High', 'Luxury'];  // Hardcoded
```

---

## Part 5: Sale Type Standards

### Canonical Values

| Enum Key | DB Value | Display Label |
|----------|----------|---------------|
| `NEW_SALE` | `New Sale` | `New Sale` |
| `RESALE` | `Resale` | `Resale` |
| `SUB_SALE` | `Sub Sale` | `Sub Sale` |

### Usage

```javascript
// CORRECT - Use enum helpers
import { isSaleType, SaleType, SaleTypeLabels } from '../schemas/apiContract';

if (isSaleType.newSale(row.saleType)) { ... }
const label = SaleTypeLabels[SaleType.RESALE];

// FORBIDDEN - Hardcoded strings
if (row.sale_type === 'New Sale') { ... }
const label = 'Resale';
```

### Backend

```python
# CORRECT
from constants import SALE_TYPE_NEW, SALE_TYPE_RESALE
from schemas.api_contract import SaleType

# FORBIDDEN
if sale_type == 'New Sale':
```

---

## Part 6: Tenure Standards

### Canonical Values

| Enum Key | DB Value | Full Label | Short Label |
|----------|----------|------------|-------------|
| `FREEHOLD` | `Freehold` | `Freehold` | `FH` |
| `LEASEHOLD_99` | `99-year` | `99-year Leasehold` | `99yr` |
| `LEASEHOLD_999` | `999-year` | `999-year Leasehold` | `999yr` |

### Usage

```javascript
// CORRECT
import { isTenure, TenureLabelsShort } from '../schemas/apiContract';

const shortLabel = TenureLabelsShort[row.tenure];

// FORBIDDEN
const label = row.tenure === 'Freehold' ? 'FH' : '99yr';
```

---

## Part 7: Property Age Band Standards

### Canonical Values

| Key | Label | Age Range | Source |
|-----|-------|-----------|--------|
| `new_sale` | `New Sale` | N/A | sale_type |
| `recently_top` | `Recently TOP` | 4-8 yrs | age |
| `young_resale` | `Young Resale` | 8-15 yrs | age |
| `resale` | `Resale` | 15-25 yrs | age |
| `mature_resale` | `Mature Resale` | 25+ yrs | age |
| `freehold` | `Freehold` | N/A | tenure |

### Usage

```javascript
// CORRECT
import { getAgeBandKey, AGE_BAND_LABELS_SHORT } from '../constants';

const band = getAgeBandKey(age, isFreehold, isNewSale);
const label = AGE_BAND_LABELS_SHORT[band];

// FORBIDDEN
if (age < 5) band = 'new';  // Wrong classification
```

---

## Part 8: Filter Parameter Standards

### Two-Layer Naming Convention

Filter parameters use **different naming at different layers**:

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND                                                        │
│  buildApiParams() → { district: 'D01,D02', bedroom: '2,3' }     │
│                           ↓ SINGULAR                             │
├─────────────────────────────────────────────────────────────────┤
│  API BOUNDARY (HTTP Request)                                     │
│  ?district=D01,D02&bedroom=2,3&segment=CCR                      │
│                           ↓ SINGULAR                             │
├─────────────────────────────────────────────────────────────────┤
│  ROUTE HANDLER (routes/*.py)                                     │
│  Parses & normalizes → { districts: [...], bedrooms: [...] }    │
│                           ↓ PLURAL                               │
├─────────────────────────────────────────────────────────────────┤
│  SERVICE LAYER (services/*.py)                                   │
│  filters.get('districts'), filters.get('bedrooms')              │
│                           = PLURAL                               │
└─────────────────────────────────────────────────────────────────┘
```

### API Parameters (Singular) — Frontend & HTTP

| Concept | API Param | Format | Example |
|---------|-----------|--------|---------|
| District | `district` | Comma-separated | `district=D01,D02` |
| Bedroom | `bedroom` | Comma-separated | `bedroom=2,3` |
| Segment | `segment` | Comma-separated | `segment=CCR,RCR` |
| Sale Type | `sale_type` | Single value | `sale_type=Resale` |
| Date Range | `date_from`, `date_to` | ISO date | `date_from=2024-01-01` |
| PSF Range | `psf_min`, `psf_max` | Number | `psf_min=1500` |
| Size Range | `size_min`, `size_max` | Number | `size_min=800` |
| Tenure | `tenure` | Single value | `tenure=Freehold` |
| Project | `project` | String | `project=Parc` |

### Service Filters (Plural) — Backend Services

| Concept | Service Key | Type | Example |
|---------|-------------|------|---------|
| Districts | `districts` | `List[str]` | `['D01', 'D02']` |
| Bedrooms | `bedrooms` | `List[int]` | `[2, 3]` |
| Segments | `segments` | `List[str]` | `['CCR', 'RCR']` |
| Sale Type | `sale_type` | `str` | `'Resale'` |
| Date Range | `date_from`, `date_to` | `date` | Python date objects |

### Frontend Usage

```javascript
// CORRECT - API params are SINGULAR, comma-separated strings
const params = {
  district: 'D01,D02',      // Singular key, comma-separated
  bedroom: '2,3',           // Singular key, comma-separated
  segment: 'CCR',           // Singular key
  sale_type: 'Resale',      // snake_case
};

// FORBIDDEN - Never use plural or arrays in API params
const params = {
  districts: ['D01', 'D02'],  // Wrong: plural, array
  bedrooms: '2,3',            // Wrong: plural
  region: 'CCR',              // Wrong: use 'segment'
};
```

### Backend Route Handler

```python
# Route handler normalizes singular → plural for services
@app.route('/api/data')
def get_data():
    # Parse singular API params
    district_param = request.args.get('district', '')
    bedroom_param = request.args.get('bedroom', '')

    # Normalize to plural for service layer
    filters = {
        'districts': [d.strip() for d in district_param.split(',') if d.strip()],
        'bedrooms': [int(b) for b in bedroom_param.split(',') if b.strip()],
    }

    return service.get_data(filters)
```

### Backend Service

```python
# Services expect PLURAL keys with list values
def get_data(filters: dict):
    districts = filters.get('districts', [])  # List[str]
    bedrooms = filters.get('bedrooms', [])    # List[int]
    segments = filters.get('segments', [])    # List[str]
    sale_type = filters.get('sale_type')      # str (singular - not a list)
```

### Why This Convention?

1. **API params are singular** — Matches HTTP convention (`?id=1,2` not `?ids=1,2`)
2. **Service filters are plural** — Semantically correct for lists (`districts` contains multiple districts)
3. **Route handlers bridge the gap** — Single place for normalization/validation

---

## Part 9: Response Field Naming

### API Response Conventions

| v1 (snake_case) | v2 (camelCase) | Description |
|-----------------|----------------|-------------|
| `median_psf` | `medianPsf` | Median price per sqft |
| `sale_type` | `saleType` | Transaction type |
| `bedroom_count` | `bedroomCount` | Number of bedrooms |
| `floor_level` | `floorLevel` | Floor classification |

### Adapter Pattern

```javascript
// Adapters normalize v1/v2 responses - components use camelCase
const transformedData = transformTimeSeries(response.data);
// Now: data.medianPsf (never data.median_psf)
```

---

## Part 10: Color Standards

### Chart Colors (from palette)

| Element | Color | Hex |
|---------|-------|-----|
| CCR | Deep Navy | `#213448` |
| RCR | Ocean Blue | `#547792` |
| OCR | Sky Blue | `#94B4C1` |
| Background | Sand/Cream | `#EAE0CF` |

### Bedroom Colors

```javascript
// Defined in constants - DO NOT hardcode
import { getBedroomColor } from '../constants'; // Add if missing
```

---

## Part 11: Pre-Commit Checklist

Before any chart/filter/data change:

```
[ ] No hardcoded region strings - use REGIONS constant
[ ] No hardcoded bedroom labels - use BEDROOM_ORDER constant
[ ] No hardcoded bedroom thresholds - use classifyBedroomThreeTier()
[ ] No hardcoded floor levels ('Low', 'Mid', etc.)
[ ] No hardcoded sale types ('New Sale', 'Resale')
[ ] No hardcoded tenure strings ('Freehold', '99-year')
[ ] All filter params use singular form (district, bedroom, segment)
[ ] Colors from constants/palette, not hardcoded hex
[ ] New constants added to both backend AND frontend files
```

---

## Part 12: Adding New Classifications

When you need a new classification (e.g., new age band, new floor tier):

### Step 1: Add to Backend Constants

```python
# backend/constants.py
NEW_CLASSIFICATION = 'value'
NEW_CLASSIFICATION_LABELS = { ... }
```

### Step 2: Add to Frontend Constants

```javascript
// frontend/src/constants/index.js
export const NEW_CLASSIFICATION = 'value';
export const NEW_CLASSIFICATION_LABELS = { ... };
```

### Step 3: Add to API Contract (if enum)

```python
# backend/schemas/api_contract.py
class NewEnum(str, Enum):
    VALUE = 'value'
```

```javascript
// frontend/src/schemas/apiContract.js
export const NewEnum = { VALUE: 'value' };
```

### Step 4: Update This Document

Add the new classification to the appropriate section above.

---

## Quick Reference Card

```
DATA STANDARDS CHECKLIST

BEFORE WRITING ANY DATA CODE:
[ ] Check constants/index.js for existing values
[ ] Check apiContract.js for enum helpers
[ ] Use helper functions (getRegionForDistrict, isSaleType, etc.)
[ ] Never hardcode classification strings
[ ] Response fields: use adapters for v1/v2 normalization

FILTER NAMING (Two-Layer Convention):
┌──────────────────────────────────────────────────────┐
│ API PARAMS (singular)  →  SERVICE FILTERS (plural)   │
│ district               →  districts                  │
│ bedroom                →  bedrooms                   │
│ segment                →  segments                   │
│ sale_type              →  sale_type (stays singular) │
└──────────────────────────────────────────────────────┘

Frontend: params.district = 'D01,D02'     // SINGULAR
Route:    filters['districts'] = [...]    // PLURAL
Service:  filters.get('districts', [])    // PLURAL

ADDING NEW CLASSIFICATION:
1. Add to backend/constants.py
2. Add to frontend/src/constants/index.js
3. Add to api_contract.py if enum
4. Update this skill document
```
