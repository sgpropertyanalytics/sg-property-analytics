# Unsold Inventory Feature - Design Document

## Overview

**Goal:** Calculate estimated unsold units per project using:
```
Unsold = Total Units - Cumulative New Sales
```

**Key Requirement:** Automatically fetch total units for new projects as they appear in the database.

## Phase 1: Cumulative Sales Count (COMPLETED)

**Status:** Implemented in `ProjectDetailPanel.jsx`

Shows:
- Cumulative New Sales (units sold by developer)
- Cumulative Resales (secondary market)
- Total Transactions (all time)
- Note explaining data limitations

---

## Phase 2: Automatic Total Units Integration

### Core Design: URA Developer Sales API (Primary Source)

The URA Developer Sales API is the **only reliable automated source** for total units data.

**API Details:**
- Endpoint: `https://www.ura.gov.sg/uraDataService/invokeUraDS?service=PMI_Resi_Developer_Sales`
- Requires: API registration at URA website → receive AccessKey → generate Token
- Data includes: `launchedToDate`, `soldToDate`, `unitsAvail` per project

### Automatic Sync Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  AUTOMATIC TOTAL UNITS SYNC                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. On Upload/New Data                                          │
│     └── Detect new project_names in transactions               │
│                                                                 │
│  2. For Each New Project                                        │
│     └── Query URA Developer Sales API                           │
│         └── Match by project_name (fuzzy match if needed)       │
│         └── Extract: launchedToDate (= total units)             │
│                                                                 │
│  3. Store in project_inventory table                            │
│     └── Cache results to avoid repeated API calls              │
│     └── Set refresh_after date for periodic re-sync            │
│                                                                 │
│  4. Fallback: Mark as "pending_lookup" if not found             │
│     └── Flag for manual verification                            │
│     └── Show "Data not available" in frontend                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Database Schema

```sql
CREATE TABLE project_inventory (
    id SERIAL PRIMARY KEY,
    project_name VARCHAR(255) NOT NULL UNIQUE,

    -- Core inventory data
    total_units INTEGER,              -- NULL if not yet fetched
    units_launched INTEGER,           -- From URA: launchedToDate
    units_sold_ura INTEGER,           -- From URA: soldToDate (may differ from our count)
    units_available INTEGER,          -- From URA: unitsAvail

    -- Data source tracking
    data_source VARCHAR(50),          -- 'URA_API', 'MANUAL', 'PENDING'
    ura_project_id VARCHAR(100),      -- URA's internal project identifier
    last_synced TIMESTAMP,            -- When we last fetched from URA
    refresh_after TIMESTAMP,          -- When to re-sync (e.g., +30 days)

    -- For manual fallback
    manual_source_url TEXT,           -- PropertyGuru/EdgeProp link if manual
    manual_verified_by VARCHAR(100),  -- Who verified the manual entry

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_project_inventory_name ON project_inventory(project_name);
CREATE INDEX idx_project_inventory_refresh ON project_inventory(refresh_after);
```

### Sync Service

```python
# backend/services/inventory_sync.py

class InventorySync:
    """Auto-sync total units from URA Developer Sales API"""

    URA_API_URL = "https://www.ura.gov.sg/uraDataService/invokeUraDS"

    def __init__(self, access_key: str):
        self.access_key = access_key
        self.token = self._get_token()

    def sync_new_projects(self):
        """Find projects in transactions without inventory data and fetch from URA"""

        # 1. Get project names from transactions that aren't in project_inventory
        new_projects = db.session.query(Transaction.project_name).distinct().filter(
            ~Transaction.project_name.in_(
                db.session.query(ProjectInventory.project_name)
            )
        ).all()

        # 2. Fetch URA Developer Sales data
        ura_data = self._fetch_ura_developer_sales()

        # 3. Match and store
        for project_name in new_projects:
            match = self._find_ura_match(project_name, ura_data)
            if match:
                self._store_inventory(project_name, match, source='URA_API')
            else:
                self._store_pending(project_name)

    def refresh_stale_data(self):
        """Re-sync projects where refresh_after has passed"""
        stale = ProjectInventory.query.filter(
            ProjectInventory.refresh_after < datetime.now()
        ).all()
        # ... re-fetch from URA
```

### Integration Points

**1. Upload Script (`scripts/upload.py`):**
```python
# After successful upload
if new_project_names:
    inventory_sync.sync_new_projects()
```

**2. Scheduled Job (cron/Render cron):**
```bash
# Daily sync for stale data
0 2 * * * python scripts/sync_inventory.py
```

**3. API Endpoint:**
```
GET /api/projects/{project_name}/inventory

Response:
{
  "project_name": "SPRINGLEAF RESIDENCE",
  "total_units": 941,
  "cumulative_new_sales": 881,    // From our transaction data
  "cumulative_resales": 45,
  "estimated_unsold": 60,         // total_units - new_sales
  "data_source": "URA_API",
  "last_synced": "2025-12-15",
  "confidence": "high",           // high if URA, medium if manual
  "disclaimer": "Estimated based on transaction data; not official URA figures"
}

// If data not available:
{
  "project_name": "OLDER PROJECT",
  "total_units": null,
  "cumulative_new_sales": 150,
  "data_source": "PENDING",
  "message": "Total units data not available for this project"
}
```

### Fallback Strategy

| Scenario | Action |
|----------|--------|
| Project in URA API | Auto-sync, high confidence |
| Project NOT in URA API | Mark as PENDING, show "N/A" in UI |
| PENDING for >7 days | Flag for manual lookup from PropertyGuru/EdgeProp |
| Manual entry exists | Use manual data, medium confidence |

### URA API Registration

To enable automatic sync:

1. Register at https://www.ura.gov.sg/maps/api/
2. Receive AccessKey via email
3. Generate Token using AccessKey
4. Store in environment: `URA_API_ACCESS_KEY`, `URA_API_TOKEN`

---

## Frontend Display

```jsx
{/* In ProjectDetailPanel - when inventory data available */}
{inventoryData?.total_units ? (
  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
    <div className="grid grid-cols-3 gap-4">
      <div>
        <p className="text-sm text-green-700">Total Units</p>
        <p className="text-xl font-bold">{inventoryData.total_units}</p>
      </div>
      <div>
        <p className="text-sm text-green-700">Sold (New Sale)</p>
        <p className="text-xl font-bold">{salesByType.newSale}</p>
      </div>
      <div>
        <p className="text-sm text-green-700">Est. Unsold</p>
        <p className="text-xl font-bold text-green-600">
          {inventoryData.total_units - salesByType.newSale}
        </p>
      </div>
    </div>
    <p className="text-xs text-green-600 mt-2">
      Source: {inventoryData.data_source} |
      Last synced: {inventoryData.last_synced}
    </p>
  </div>
) : (
  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
    <p className="text-sm text-gray-600">
      Total units data not available for this project.
      Unsold inventory cannot be calculated.
    </p>
  </div>
)}
```

---

## Disclaimer Requirements

All unsold inventory estimates MUST display:

> "Estimated based on transaction data; not official URA figures"

Additional context:
- Data source (URA_API / MANUAL)
- Last sync date
- Confidence indicator (high/medium)
