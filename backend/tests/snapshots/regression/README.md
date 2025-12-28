# Regression Snapshots

Golden snapshots for regression testing. These capture expected API responses
for specific data slices to detect silent correctness drift.

## Files

- `segment_metrics.json` - CCR/RCR/OCR metrics for last 3 complete months
- `district_metrics.json` - D09/D10/D15 metrics for last quarter

## Tolerances

| Metric | Tolerance | Notes |
|--------|-----------|-------|
| count | Exact (±0) | Transaction counts should never drift |
| median_psf | ±0.5% or ±$15 | Floating point and rounding tolerance |
| avg_psf | ±0.5% or ±$15 | Floating point and rounding tolerance |

## Running Tests

```bash
cd backend && pytest tests/test_regression_snapshots.py -v
```

## Updating Snapshots

Run with `--update-snapshots` flag:

```bash
cd backend && pytest tests/test_regression_snapshots.py --update-snapshots
```

**Warning:** Only update when:
1. New data was intentionally ingested
2. Algorithm was intentionally changed
3. Bug fix affects numbers (document in commit)

## Schema

```json
{
  "_metadata": {
    "generated_at": "ISO timestamp",
    "git_sha": "short commit hash",
    "api_version": "v3",
    "slice_count": 9
  },
  "slices": {
    "segment_CCR_2025-10": {
      "params": {
        "segment": "CCR",
        "district": null,
        "date_from": "2025-10-01",
        "date_to": "2025-11-01"
      },
      "metrics": {
        "count": 342,
        "median_psf": 2841.50,
        "avg_psf": 2956.23
      }
    }
  }
}
```

## Root Cause Categories

When tests fail, the report identifies likely causes:

| Category | Detection Pattern |
|----------|-------------------|
| BOUNDARY_CHANGE | Count dropped/increased, PSF unchanged |
| FILTER_DRIFT | Segment counts changed, district unchanged |
| METRIC_DRIFT | median_psf ≈ avg_psf (PERCENTILE→AVG bug) |
| OUTLIER_CHANGE | PSF drifted, count stable |

## CI Integration

Add to your CI workflow:

```yaml
- name: Run regression tests
  run: |
    cd backend
    pytest tests/test_regression_snapshots.py -v --tb=short
```
