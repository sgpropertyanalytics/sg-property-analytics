# Property Market Definitions

## Price Metrics

### PSF (Price per Square Foot)
The standard unit for comparing property prices in Singapore. Calculated as:
```
PSF = Transaction Price / Area (sqft)
```

Higher PSF generally indicates premium location, newer development, or superior finishes. PSF normalizes price across different unit sizes, enabling apples-to-apples comparison.

### GFA (Gross Floor Area)
The total floor area of a unit including all internal spaces. In Singapore, area is reported in square feet (sqft) for private property transactions.

## Sale Types

### New Sale
Initial sale from developer to buyer. Occurs during or shortly after project launch. Price typically includes developer margin and marketing costs. Subject to different buyer dynamics than resale market.

### Resale
Secondary market transaction between private parties. Reflects market-driven pricing without developer involvement. Most liquid segment for established projects.

### Sub Sale
Sale of a unit before the project obtains Temporary Occupation Permit (TOP). The original buyer sells their purchase rights to another buyer. Often indicates speculative activity or change in buyer circumstances.

## Tenure Types

### Freehold
Perpetual ownership with no lease expiry. Generally commands premium pricing. No depreciation concerns from lease decay.

### 99-year Leasehold
Most common tenure for private condos. Government land sold with 99-year lease. Value declines as lease shortens, particularly after crossing key thresholds (60, 40, 30 years remaining).

### 999-year Leasehold
Near-perpetual lease, functionally similar to freehold. Rare in new developments. Typically found in older estates.

## Property Age

### Lease Age
Years since lease commencement (lease_start_year). This is the standard measure used in analysis.
```
Lease Age = Transaction Year - Lease Start Year
```

### TOP (Temporary Occupation Permit)
Official certificate allowing residents to move in. Marks when a development is considered "completed" for occupancy purposes.

### Property Age Buckets

Properties are classified into buckets based on age or market state:

| Bucket | Age Range | Description |
|--------|-----------|-------------|
| New Sale | N/A | Project with no resale transactions yet (market state, not age-based) |
| Recently TOP | 4-7 years | First resales becoming available |
| Young Resale | 8-14 years | Established resale track record |
| Resale | 15-24 years | Mature resale market |
| Mature Resale | 25+ years | Approaching lease decay concerns for 99-year |
| Freehold | N/A | Freehold properties (tenure-based, not age-based) |

## Floor Level Classification

Properties are classified by floor level based on the lower floor of the range:

| Floor Range | Classification |
|-------------|----------------|
| 01 - 05 | Low |
| 06 - 10 | Mid-Low |
| 11 - 20 | Mid |
| 21 - 30 | Mid-High |
| 31 - 40 | High |
| 41+ | Luxury |

Higher floors typically command premium pricing due to views and reduced noise. Basement levels are excluded from classification.

## Bedroom Classification

Unit size (sqft) determines bedroom classification. URA data doesn't include bedroom count directly, so we use area-based heuristics. Thresholds vary by sale type and transaction date:

### Tier 1: New Sale (Post-Harmonization, ≥ June 2023)
After AC ledge removal rules, developers build more compact units.

| Bedroom | Area Range |
|---------|------------|
| 1BR | < 580 sqft |
| 2BR | 580 - 779 sqft |
| 3BR | 780 - 1149 sqft |
| 4BR | 1150 - 1449 sqft |
| 5BR+ | ≥ 1450 sqft |

### Tier 2: New Sale (Pre-Harmonization, < June 2023)
Modern units but with AC ledges still counted in floor area.

| Bedroom | Area Range |
|---------|------------|
| 1BR | < 600 sqft |
| 2BR | 600 - 849 sqft |
| 3BR | 850 - 1199 sqft |
| 4BR | 1200 - 1499 sqft |
| 5BR+ | ≥ 1500 sqft |

### Tier 3: Resale (Any Date)
Older properties with larger typical unit sizes.

| Bedroom | Area Range |
|---------|------------|
| 1BR | < 600 sqft |
| 2BR | 600 - 949 sqft |
| 3BR | 950 - 1349 sqft |
| 4BR | 1350 - 1649 sqft |
| 5BR+ | ≥ 1650 sqft |

When discussing bedroom counts, note that classification is derived from area, not declared bedroom count.
