---
name: sg-property-analyst
description: Singapore property market domain expertise. Use when making decisions about data interpretation, market terminology, URA data handling, property classifications, or bedroom sizing.
---

# Singapore Property Market Expert

Domain knowledge for interpreting Singapore property market data correctly.

**Trigger:** Market terminology, bedroom classification, district/region decisions, URA data quirks, deal ratings

---

## Market Segmentation

### Core Central Region (CCR) - Prime Districts
```
D01: Boat Quay / Raffles Place / Marina
D02: Shenton Way / Tanjong Pagar
D06: City Hall / Fort Canning
D07: Bugis / Rochor
D09: Orchard / Somerset / River Valley
D10: Tanglin / Bukit Timah / Holland
D11: Newton / Novena
```

**Characteristics:** Highest PSF, luxury market, more freehold/999-year, lower volume

### Rest of Central Region (RCR) - City Fringe
```
D03: Queenstown / Alexandra / Tiong Bahru
D04: Harbourfront / Keppel / Telok Blangah
D05: Buona Vista / Dover / Pasir Panjang
D08: Little India / Farrer Park
D12: Balestier / Toa Payoh
D13: Potong Pasir / MacPherson
D14: Geylang / Paya Lebar / Eunos
D15: East Coast / Marine Parade / Katong
D20: Bishan / Ang Mo Kio
```

**Characteristics:** Mid-range, good connectivity, mix of tenure types

### Outside Central Region (OCR) - Suburban
```
D16-D19: East (Bedok, Changi, Tampines, Pasir Ris, Serangoon, Hougang, Punggol)
D21-D28: West/North (Bukit Timah, Jurong, Bukit Batok, Woodlands, Yishun, Seletar)
```

**Characteristics:** Most affordable, highest volume, predominantly 99-year

---

## Bedroom Classification (Three-Tier System)

**Why three tiers?** AC ledge harmonization in June 2023 changed how floor area is measured. Post-harmonization units appear smaller for the same bedroom count.

### Tier 1: New Sale >= June 2023 (Post-Harmonization)
```
1-Bedroom: < 580 sqft
2-Bedroom: 580 - 780 sqft
3-Bedroom: 780 - 1150 sqft
4-Bedroom: 1150 - 1450 sqft
5-Bedroom+: >= 1450 sqft
```
Ultra-compact sizing after AC ledge rules changed.

### Tier 2: New Sale < June 2023 (Pre-Harmonization)
```
1-Bedroom: < 600 sqft
2-Bedroom: 600 - 850 sqft
3-Bedroom: 850 - 1200 sqft
4-Bedroom: 1200 - 1500 sqft
5-Bedroom+: >= 1500 sqft
```
Modern compact sizing with AC ledges counted.

### Tier 3: Resale (Any Date)
```
1-Bedroom: < 600 sqft
2-Bedroom: 600 - 950 sqft
3-Bedroom: 950 - 1350 sqft
4-Bedroom: 1350 - 1650 sqft
5-Bedroom+: >= 1650 sqft
```
Legacy larger sizes from older developments.

**Code:** `backend/services/classifier.py` - `classify_bedroom_three_tier()`

---

## URA Data Quirks

### Month-Level Transactions
All URA transaction dates are **1st of month**. There is no day-level granularity.

```python
# WRONG: "Last 90 days"
date_from = today - timedelta(days=90)

# CORRECT: "Last 3 calendar months"
date_from = date(max_date.year, max_date.month - 2, 1)
```

### Exclusive Date Bounds
Date ranges use exclusive upper bound to avoid double-counting at month boundaries.

```sql
WHERE transaction_date >= :date_from
  AND transaction_date < :date_to_exclusive  -- NOT <=
```

### Sale Types
| Sale Type | Meaning |
|-----------|---------|
| New Sale | Initial purchase from developer |
| Resale | Secondary market (owner-to-owner) |
| Sub Sale | Sale before TOP (Temporary Occupation Permit) |

### Tenure Types
| Tenure | Meaning |
|--------|---------|
| Freehold | Perpetual ownership |
| 999-year | Effectively freehold |
| 99-year | Leasehold (most common) |

---

## Timeframe Resolution

Canonical timeframe IDs (backend resolves to dates):

| ID | Period | Label |
|----|--------|-------|
| M3 | 3 months | 3M |
| M6 | 6 months | 6M |
| Y1 | 12 months | 1Y (default) |
| Y3 | 36 months | 3Y |
| Y5 | 60 months | 5Y |

**Rule:** Frontend sends ID, backend resolves to `date_from` and `date_to_exclusive`.

---

## Deal Rating Framework

### Percentile-Based Rating
Compares unit PSF against distribution:

| Rating | Percentile | Meaning |
|--------|------------|---------|
| Good | < 25th | Below market average |
| Fair | 25th - 75th | At market |
| High | > 75th | Above market average |

### Comparison Levels
1. **Project-level:** vs other units in same project
2. **District-level:** vs all transactions in district
3. **City-wide:** vs all Singapore transactions

---

## Exit Risk & Liquidity

### Transaction Velocity
Measures market health based on transactions per 100 units:

| Velocity | Level | Meaning |
|----------|-------|---------|
| < 5 txn/100 units | Low | Illiquid, harder to sell |
| 5 - 15 txn/100 units | Healthy | Normal market |
| > 15 txn/100 units | Elevated | High turnover (investigate why) |

---

## Price Metrics

### PSF (Price per Square Foot)
Primary comparison metric. Normalizes for unit size.

```
PSF = Transaction Price / Floor Area (sqft)
```

### Median vs Average
- **Median:** Resistant to outliers, preferred for market summaries
- **Average:** Useful for total volume calculations

### Outlier Handling
Transactions are flagged as outliers using IQR method at data ingestion.
Every query MUST exclude outliers:

```sql
WHERE COALESCE(is_outlier, false) = false
```

---

## Common Data Questions

### "Why do bedrooms seem wrong?"
Check sale type and date. A 750 sqft "2-bedroom" is correct for:
- Tier 1 (post-Jun 2023 new sale): 580-780 sqft = 2BR
- Tier 3 (resale): 600-950 sqft = 2BR

### "Why are there gaps in monthly data?"
URA updates semi-annually (H1/H2). Recent months may have incomplete data until next release.

### "Why does filter show no transactions?"
Check:
1. Date range - URA data starts from specific year
2. Combination rarity - some district+bedroom combos have few transactions
3. Outlier exclusion - transactions may be filtered as outliers

### "Why is median different from what I calculated?"
Ensure:
1. Same date range (exclusive upper bound)
2. Same outlier exclusion
3. Same bedroom classification tier
4. Same sale type filter
