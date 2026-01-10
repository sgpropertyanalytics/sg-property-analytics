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
- **New Sale**: Project with no resale transactions yet (market state, not age-based)
- **Recently TOP (4-7 years)**: First resales becoming available
- **Young Resale (8-14 years)**: Established resale track record
- **Resale (15-24 years)**: Mature resale market
- **Mature Resale (25+ years)**: Approaching lease decay concerns for 99-year

## Floor Level Classification

Properties are classified by floor level:
- **Low**: Ground floor to ~5th floor
- **Mid-Low**: ~6th to 10th floor
- **Mid**: ~11th to 15th floor
- **Mid-High**: ~16th to 20th floor
- **High**: ~21st to 30th floor
- **Luxury**: 31st floor and above

Higher floors typically command premium pricing due to views and reduced noise.

## Bedroom Classification

Unit size (sqft) determines bedroom classification. Thresholds vary by:
1. Sale type (New Sale vs Resale)
2. Transaction date (pre/post June 2023 harmonization)

This accounts for:
- New launches having smaller unit sizes than older projects
- Recent regulations standardizing minimum unit sizes

When discussing bedroom counts, note that classification is derived from area, not declared bedroom count.
