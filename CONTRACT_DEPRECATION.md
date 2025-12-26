# API Contract Deprecation Plan

This document outlines the version lifecycle and deprecation process for the SG Property Analyzer API contract.

## Current Version Status

| Version | Status | Description | Deprecation Date | Sunset Date |
|---------|--------|-------------|-----------------|-------------|
| v1 | Deprecated | Legacy snake_case fields | 2025-12-25 | 2026-04-01 |
| v2 | Supported | camelCase fields + enum normalization | - | - |
| v3 | Current | Stabilization release with version tracking | - | - |

### v1 Sunset Timeline

**v1 is deprecated as of 2025-12-25 and will be removed on 2026-04-01.**

| Milestone | Date | Action |
|-----------|------|--------|
| Deprecated | 2025-12-25 | Console warnings in dev mode |
| Warning Phase | 2026-02-01 | Response includes deprecation warning header |
| Block New Clients | 2026-03-01 | New API clients get 400 if requesting v1 |
| Sunset | 2026-04-01 | v1 removed entirely, requests return 410 Gone |

**Migration Notes:**
- v1 uses `snake_case` fields (e.g., `sale_type`, `median_psf`)
- v2+ uses `camelCase` fields (e.g., `saleType`, `medianPsf`)
- Frontend adapters handle v1/v2 transparently via `getAggField()`
- After sunset, adapters will no longer need v1 fallbacks

## Version Lifecycle

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Preview   │ => │   Current   │ => │  Supported  │ => │  Deprecated │
│  (N months) │    │             │    │  (6 months) │    │  (3 months) │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                                ↓
                                                         ┌─────────────┐
                                                         │   Sunset    │
                                                         └─────────────┘
```

### Lifecycle Phases

1. **Preview**: New version being tested, not in production
2. **Current**: Active version emitted by API (`CURRENT_API_CONTRACT_VERSION`)
3. **Supported**: Previous version, still works, but not recommended
4. **Deprecated**: Version scheduled for removal, console warnings in dev
5. **Sunset**: Version removed, responses return error

## v4 Planning (Future)

When v4 is needed (e.g., for breaking schema changes):

### Phase 1: Introduce v4 (Preview)

```python
# backend/schemas/api_contract.py
API_CONTRACT_VERSION_V4 = "v4"
SUPPORTED_API_CONTRACT_VERSIONS = {
    API_CONTRACT_VERSION_V1,  # Deprecated
    API_CONTRACT_VERSION_V2,  # Supported
    API_CONTRACT_VERSION_V3,  # Current
    API_CONTRACT_VERSION_V4,  # Preview
}

# Keep v3 as current during preview
CURRENT_API_CONTRACT_VERSION = API_CONTRACT_VERSION_V3
```

```javascript
// frontend/src/schemas/apiContract.js
export const API_CONTRACT_VERSIONS = {
  V1: 'v1',
  V2: 'v2',
  V3: 'v3',
  V4: 'v4',  // Preview
};

export const SUPPORTED_API_CONTRACT_VERSIONS = new Set([
  API_CONTRACT_VERSIONS.V1,
  API_CONTRACT_VERSIONS.V2,
  API_CONTRACT_VERSIONS.V3,
  API_CONTRACT_VERSIONS.V4,
]);
```

### Phase 2: Promote v4 to Current

```python
# After adapters are updated and tested
CURRENT_API_CONTRACT_VERSION = API_CONTRACT_VERSION_V4
```

### Phase 3: Deprecate v1

```python
DEPRECATED_API_CONTRACT_VERSIONS = {
    API_CONTRACT_VERSION_V1,
}

def is_version_deprecated(version):
    return version in DEPRECATED_API_CONTRACT_VERSIONS
```

Add console warnings in frontend:

```javascript
export function assertKnownVersion(meta) {
  const version = meta?.apiContractVersion;

  if (DEPRECATED_VERSIONS.has(version)) {
    console.warn(
      `[API CONTRACT] Version ${version} is deprecated. ` +
      `Please migrate to ${CURRENT_API_CONTRACT_VERSION}.`
    );
  }
  // ... rest of function
}
```

### Phase 4: Sunset v1

```python
# Remove from supported versions
SUPPORTED_API_CONTRACT_VERSIONS = {
    API_CONTRACT_VERSION_V2,
    API_CONTRACT_VERSION_V3,
    API_CONTRACT_VERSION_V4,
}
```

## Rollback Safety

If a version needs emergency rollback:

```bash
# Set environment variable to override version
export API_CONTRACT_VERSION_OVERRIDE=v3
```

This forces the API to emit the older version without code changes.

## Contract Schema Hashes

Each version has a schema hash for debugging:

```
agg:v3:period|periodGrain|saleType|count|totalValue|medianPsf
txn:v3:projectName|district|bedroomCount|price|psf|saleType
```

Check the `contractHash` in response meta to verify schema shape.

## HTTP Header Debugging

All API responses include the `X-API-Contract-Version` header:

```
X-API-Contract-Version: v3
```

Check this in browser Network tab to verify active version.

## Testing Considerations

### CI Strictness

In test mode (`NODE_ENV=test`), unknown versions throw:

```javascript
// This fails CI if version is unknown
assertKnownVersion({ apiContractVersion: 'v999' }); // Throws!
```

This prevents deploying code that doesn't handle a new version.

### Golden Tests

Adapter output shapes are frozen in golden tests. If an adapter's output changes, the golden test fails:

```javascript
describe('transformTimeSeries output shape', () => {
  test('has required contract fields', () => {
    // This test fails if output shape changes
    expect(result[0]).toHaveProperty('period');
    expect(result[0]).toHaveProperty('periodGrain');
    // ...
  });
});
```

## Migration Checklist

When introducing a new version:

- [ ] Add version constant to `backend/schemas/api_contract.py`
- [ ] Add version to `SUPPORTED_API_CONTRACT_VERSIONS`
- [ ] Update schema hash in `CONTRACT_SCHEMA_HASHES`
- [ ] Add version constant to `frontend/src/schemas/apiContract.js`
- [ ] Add version to frontend `SUPPORTED_API_CONTRACT_VERSIONS`
- [ ] Update adapter `KNOWN_VERSIONS` (derived from central source)
- [ ] Run all tests (`npm run test:ci`)
- [ ] Verify build passes (`npm run build`)
- [ ] Update this document

## Contact

For questions about API contract versioning, see `CLAUDE.md` section on "API Contract & Architecture Rules".
