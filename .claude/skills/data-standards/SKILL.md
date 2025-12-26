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
import { CCR_DISTRICTS, getRegionForDistrict, REGION_BADGE_CLASSES } from '../constants';

const region = getRegionForDistrict(district);
const badgeClass = REGION_BADGE_CLASSES[region];

// FORBIDDEN - Hardcoded
const regions = ['CCR', 'RCR', 'OCR'];  // Hardcoded array
if (district === 'D01') region = 'CCR';  // Hardcoded mapping
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

### Usage

```javascript
// CORRECT
import { BEDROOM_LABELS_SHORT, getBedroomLabelShort } from '../constants';

const label = getBedroomLabelShort(bedroomCount);  // "2BR"

// FORBIDDEN
const BEDROOM_ORDER = ['1BR', '2BR', '3BR', '4BR', '5BR+'];  // Hardcoded
```

### Add to Constants if Missing

If you need bedroom order for sorting, add to `constants/index.js`:
```javascript
export const BEDROOM_ORDER = [1, 2, 3, 4, 5];
export const BEDROOM_LABELS_ORDER = BEDROOM_ORDER.map(b => getBedroomLabelShort(b));
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

### API Parameter Naming Convention

| Concept | API Param | NOT |
|---------|-----------|-----|
| District | `district` | ~~districts~~ |
| Bedroom | `bedroom` | ~~bedrooms~~, ~~bedroom_type~~ |
| Region/Segment | `segment` | ~~region~~ (region is output field name) |
| Sale Type | `sale_type` | ~~saleType~~ (API uses snake_case) |
| Date Range | `date_from`, `date_to` | ~~start_date~~, ~~dateFrom~~ |

### Usage

```javascript
// CORRECT
const params = {
  district: 'D01,D02',      // Comma-separated, singular key
  bedroom: '2,3',           // Comma-separated, singular key
  segment: 'CCR',           // Filter param
  sale_type: 'Resale',      // snake_case for API
};

// FORBIDDEN
const params = {
  districts: ['D01', 'D02'],  // Wrong: plural, array
  bedrooms: '2,3',            // Wrong: plural
  region: 'CCR',              // Wrong: region is output field
};
```

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
[ ] No hardcoded region strings ('CCR', 'RCR', 'OCR')
[ ] No hardcoded bedroom labels ('1BR', '2BR', etc.)
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
[ ] Filter params: singular, snake_case (district, bedroom)
[ ] Response fields: use adapters for v1/v2 normalization

ADDING NEW CLASSIFICATION:
1. Add to backend/constants.py
2. Add to frontend/src/constants/index.js
3. Add to api_contract.py if enum
4. Update this skill document
```
