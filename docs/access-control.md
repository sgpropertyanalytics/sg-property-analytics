# Access Control & Compliance

## Core Principle

> **"We sell insights, not data."**

All features must follow this rule. If it looks like data, don't ship it. If it explains the data, you're safe.

---

## Subscription Tiers

### Free Tier

| Feature | Access |
|---------|--------|
| Market overview charts | Full |
| Summary KPIs | Full |
| District aggregates | Full |
| Project details | Masked |
| Transaction lists | Masked |
| Export/download | No |

### Premium Tier

| Feature | Access |
|---------|--------|
| All Free features | Full |
| Project deep-dive | Full |
| Transaction details | Full |
| Historical data | Extended |
| Export/download | No |

### Professional Tier

| Feature | Access |
|---------|--------|
| All Premium features | Full |
| API access | Full |
| Priority support | Yes |

---

## Data Masking

### Masked Fields (Free Tier)

| Field | Masking |
|-------|---------|
| `projectName` | → `"D09 Condo"` |
| `streetName` | Hidden |
| `price` | → `"$2M - $3M"` (range) |
| `psf` | → `"$1,500 - $2,000"` (range) |
| `floorRange` | Hidden |

### Always Visible

| Field | Reason |
|-------|--------|
| `district` | Aggregation key |
| `saleType` | Aggregation key |
| `bedroomCount` | Aggregation key |
| `transactionDate` | Period display |

### Serialization Functions

```python
# Premium users
serialize_transaction(txn)  # Full data

# Free users
serialize_transaction_teaser(txn)  # Masked data
```

---

## K-Anonymity

### Threshold

Minimum records required before showing data:

```python
K_ANONYMITY_THRESHOLD = 10  # Current
# Recommended: 50 for stricter compliance
```

### Application

- Transaction lists require K records in result set
- Project detail requires K transactions in project
- Drill-down blocked if below threshold

---

## Legal Compliance

### Data Sources

All data originates from publicly available and licensed sources (URA REALIS). IP rights remain with original owners.

### Transformative Use

Platform displays **derived analytics**, **aggregated insights**, and **proprietary calculations** - not raw transaction records.

### Non-Reproduction

Platform does NOT display, reproduce, or provide access to:
- Raw transaction-level data
- Unit-level records
- Downloadable datasets

### Non-Substitution

Platform is for analytical/informational purposes only. Does not replace official URA publications.

---

## What You CAN Show

| Element | Status |
|---------|--------|
| Aggregated metrics (median, avg, index) | Allowed |
| Percentile bands | Allowed |
| Z-scores / normalized values | Allowed |
| Trend lines / charts | Allowed |
| Rankings (non-transactional) | Allowed |
| Heatmaps | Allowed |
| Project names | Allowed |
| Price bands | Allowed |
| Liquidity scores | Allowed |

## What You CANNOT Show

| Element | Status |
|---------|--------|
| Transaction tables (individual rows) | Prohibited |
| Unit-level detail | Prohibited |
| Exact price + date pairs | Prohibited |
| Download/export buttons | Prohibited |
| Copyable raw data | Prohibited |
| Unit numbers | Prohibited |
| Drill-down to individual deals | Prohibited |

---

## UI Compliance Rules

### Design Rules

**Always:**
- Aggregate data before display
- Normalize values (Z-scores, percentiles)
- Abstract individual records
- Add analytical interpretation

**Never:**
- Store raw URA tables in user-accessible format
- Expose transaction rows directly
- Allow data exporting
- Show unit-level detail
- Mirror URA data structure

### Chart Requirements

**Allowed:**
- Line charts, bar charts, area charts
- Heatmaps, index charts, trend indicators
- Scatter plots (aggregated only)

**Prohibited:**
- Tables of individual deals
- Drilldown to transaction level
- Tooltips with raw prices
- Exportable chart data
- Unit-level scatter points

---

## Terminology

### Use These Terms

| Approved | Instead Of |
|----------|------------|
| Market benchmark | Transaction record |
| Observed trend | Sales history |
| Derived metric | URA data |
| Liquidity indicator | Exact price |
| Performance index | Transaction list |
| Relative ranking | Raw data |

### Avoid These Terms

| Avoid | Why |
|-------|-----|
| "Transaction record" | Implies raw data |
| "Sales history" | Suggests transaction detail |
| "URA data" | Claims direct reproduction |
| "Exact price" | Implies raw values |
| "Download data" | Implies redistribution |

---

## Feature Compliance Checklist

Before launching any feature:

### Data Source Check

- [ ] Data is aggregated or derived
- [ ] No raw URA tables stored
- [ ] No transaction-level records exposed
- [ ] Data cannot be reconstructed into URA format
- [ ] Data is not downloadable

### Display Check

- [ ] No individual transaction rows
- [ ] No exact price + date combinations
- [ ] No unit numbers or floor details
- [ ] No copy/export functionality

### Litmus Test

```
Does it look like DATA?     → Don't ship it
Does it EXPLAIN the data?   → Safe to ship
```

---

## Disclaimers

### Short (Tooltip/Footer)

> All figures shown are derived market indicators based on aggregated historical transaction data. Individual transaction records are not displayed.

### Full (User-Facing)

> This platform provides analytical insights derived from aggregated real estate transaction data obtained from publicly available and licensed sources.
>
> The platform does not reproduce or distribute original transaction records, unit-level data, or official datasets.
>
> All charts, metrics, and indicators represent proprietary analytical interpretations and should not be construed as official records or financial advice.

---

## Data Retention

### Processing Stage

| Stage | Retention | Security |
|-------|-----------|----------|
| Raw CSV imports | Deleted within 7 days | Encrypted at rest |
| Processing logs | 30 days rolling | Audit logged |

### Stored Data

| Data Type | Retention |
|-----------|-----------|
| Aggregated tables | Indefinite (compliant by design) |
| Raw transaction backups | **Not retained** |
| User account data | Until deletion + 30 days |

### Pipeline

```
URA Source → Staging → Aggregation → Delete Raw → Store Aggregates
                                         ↓
                                   Secure wipe
```

---

## API Security

### Authentication

- Firebase Auth (Google OAuth)
- JWT tokens for premium features
- Tier validation on protected endpoints

### Rate Limiting (Recommended)

```python
@limiter.limit("10 per minute")
def transactions_list():
    ...
```

### Audit Logging

Log all data access:
```python
logger.info(f"Data access: user={user_id}, endpoint={endpoint}, params={params}")
```

---

## Compliance Violations to Watch

### Backend Violations

1. **Transaction list endpoint** returning individual records
2. **Full serializer** exposing all fields to premium users
3. **Teaser serializer** retaining identifiable field combinations
4. **No rate limiting** on data endpoints

### Frontend Violations

1. Displaying transaction tables
2. Showing exact price + date + district combinations
3. Allowing copy/paste of data
4. Export buttons on any view

---

*Last updated: December 2024*
