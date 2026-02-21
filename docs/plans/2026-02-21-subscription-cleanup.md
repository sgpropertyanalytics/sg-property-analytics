# Plan: Remove Subscription/Premium/Payment Remnants

**Goal:** Simplify the codebase to reflect the actual access model: Google sign-in = full access. No tiers, no payments, no subscriptions.

**Guiding Principle:** Delete dead code, simplify active code, rename misleading identifiers. Do NOT change any business logic or break any working feature.

**Estimated scope:** ~35 files touched, ~1800 lines removed, 5 files deleted.

---

## Phase 1: Delete Dead Files (3 files)

### Step 1.1: Delete `backend/models/processed_webhook.py`
- **Why:** Stripe webhook idempotency model. Zero callers anywhere.
- **File:** `backend/models/processed_webhook.py` (47 lines)
- **Also update:** `backend/models/__init__.py` — remove line 12 (`from models.processed_webhook import ProcessedWebhook`) and line 24 (`'ProcessedWebhook'` from `__all__`).
- **Risk:** `db.create_all()` will stop auto-creating the `processed_webhooks` table. This is desired — nothing reads/writes it.

### Step 1.2: Delete `frontend/src/context/authCoordinator.js`
- **Why:** 200-line state machine reducer. Not instantiated by `AccessProvider` (which uses a no-op `dispatch: () => {}`). Only imported by `authRaceConditions.test.js:719`.
- **File:** `frontend/src/context/authCoordinator.js` (200+ lines)
- **Also update:** `frontend/eslint.config.js` — remove any `authCoordinator` references from eslint overrides (lines 153, 170, 184, 188, 192, 196, 201, 205). Check if these are special-case rules that can be cleaned.
- **Test impact:** `authRaceConditions.test.js` imports `authCoordinatorReducer` at line 719. That section of the test must be updated (see Phase 4).

### Step 1.3: Delete `frontend/src/context/accessDerivations.js`
- **Why:** 4 derivation functions never called in production. Only consumer is `accessDerivations.test.js`.
- **File:** `frontend/src/context/accessDerivations.js` (24 lines)
- **Also delete:** `frontend/src/context/__tests__/accessDerivations.test.js` (36 lines) — tests dead code.
- **Also delete:** `frontend/src/context/AccessContext.test.js` (60 lines) — tests `unwrapAccessResponse()` which has zero production callers.

---

## Phase 2: Remove Dead Code from Active Files

### Step 2.1: Remove `PreviewChartOverlay` passthrough wrapper

**Delete the file:**
- `frontend/src/components/ui/PreviewChartOverlay.jsx` (10 lines)

**Remove import + JSX wrapper from 8 chart components** (in each: delete import line, replace `<PreviewChartOverlay>X</PreviewChartOverlay>` with just `X`):

| File | Import line | JSX open line | JSX close line |
|------|------------|---------------|----------------|
| `frontend/src/components/powerbi/NewVsResaleChart.jsx` | 11 | 540 | 542 |
| `frontend/src/components/powerbi/HdbMillionDollarChart.jsx` | 6 | 344 | 346 |
| `frontend/src/components/powerbi/AbsolutePsfChart.jsx` | 17 | 378 | 380 |
| `frontend/src/components/powerbi/NewLaunchTimelineChart.jsx` | 23 | 413 | 415 |
| `frontend/src/components/powerbi/MarketValueOscillator.jsx` | 13 | 411 | 413 |
| `frontend/src/components/powerbi/PriceCompressionChart.jsx` | 14 | 327 | 329 |
| `frontend/src/components/powerbi/PriceDistributionChart.jsx` | 12 | 324 | 326 |
| `frontend/src/components/powerbi/TimeTrendChart.jsx` | 11 | 302 | 304 |

**Update barrel export:**
- `frontend/src/components/ui/index.ts` line 28 — remove `export { PreviewChartOverlay } from './PreviewChartOverlay';`
- Also remove the `// Premium gating` comment at line 26.

**Update test mock:**
- `frontend/src/components/powerbi/__tests__/TimeTrendChart.test.jsx` line 131 — remove the `PreviewChartOverlay` mock.

### Step 2.2: Remove `ChartWatermark` passthrough wrapper

**Delete the file:**
- `frontend/src/components/ui/ChartWatermark.jsx` (9 lines)

**Remove import + JSX wrapper from 3 page files** (in each: delete import, replace `<ChartWatermark>X</ChartWatermark>` with just `X`):

| File | Import line | JSX lines (open/close pairs) |
|------|------------|------------------------------|
| `frontend/src/pages/PrimaryMarket.jsx` | 7 | 33/35, 40/42 |
| `frontend/src/pages/DistrictDeepDive.jsx` | 2 | 49/67, 72/76, 78/83 |
| `frontend/src/pages/MacroOverview.jsx` | 18 | 326/337, 347/358, 365/376, 386/396, 403/411 |

**Update barrel export:**
- `frontend/src/components/ui/index.ts` line 27 — remove `export { ChartWatermark } from './ChartWatermark';`
- Also update line 10 comment: remove `ChartWatermark: Visual safeguard for preview mode` from the active components list.

### Step 2.3: Remove `isAccessRestricted = false` and dead blur conditionals

In each of these 9 files, remove the `const isAccessRestricted = false;` declaration AND simplify the JSX that references it (replace ternary with the always-true branch, i.e., remove the blur class):

| File | Declaration line | Usage lines |
|------|-----------------|-------------|
| `frontend/src/components/powerbi/HotProjectsTable.jsx` | 42 | 326 |
| `frontend/src/components/powerbi/UpcomingLaunchesTable.jsx` | 36 | 263 |
| `frontend/src/components/powerbi/GLSDataTable.jsx` | 29 | 271, 358 |
| `frontend/src/components/powerbi/BeadsChart.jsx` | 80 | 340 |
| `frontend/src/components/powerbi/AbsolutePsfChart.jsx` | 92 | 355 |
| `frontend/src/components/powerbi/PriceCompressionChart.jsx` | 79 | 293 |
| `frontend/src/components/powerbi/MarketValueOscillator.jsx` | 75 | 376 |
| `frontend/src/components/insights/MarketStrategyMap.jsx` | 454 | 686, 900 |
| `frontend/src/components/insights/DistrictLiquidityMap/DistrictLiquidityMap.jsx` | 62 | 326, 580, 587 |

**Pattern for blur class ternaries:**
- `className={isAccessRestricted ? 'blur-sm grayscale-[40%]' : ''}` → remove the `className` attribute entirely (it's always empty string)
- `blur={isAccessRestricted}` → `blur={false}` → then check if `blur` prop with `false` is meaningful to `DataCardToolbar`, if not, remove the prop entirely

### Step 2.4: Simplify `AccessContext.jsx`

Remove dead exports and premium-era context shape:

1. **Remove `DEFAULT_ACCESS`** (lines 14-18) — replace usage at line 78 with inline `null` check or simple object
2. **Remove `unwrapAccessResponse` export** (lines 33-52) — zero production callers
3. **Remove `normalizeAccessLevel` function** (lines 28-31) — only used by `unwrapAccessResponse`
4. **Remove `AccessStatus` export** (lines 20-26) — only used in `debug` block; inline `'resolved'` there
5. **Remove `paywall` object** from context value (lines 94-99) — all no-ops
6. **Remove `showPaywall`/`hidePaywall` callbacks** (lines 65-66)
7. **Remove `expiry` object** from context value (lines 89-93) — all hardcoded null/false
8. **Remove `dispatch: () => {}` stub** (line 84)
9. **Remove `cachedAccess` from `coordState`** (line 78) — uses deleted `DEFAULT_ACCESS`
10. **Remove `accessRequestId` from `coordState`** (line 79)
11. **Simplify `coordState`** to only: `{ user, initialized, accessLevel, accessSource, accessPhase: 'resolved', accessError: null }`
12. **Clean `debug` block** — remove reference to deleted `DEFAULT_ACCESS` and `AccessStatus`

**After cleanup, the context value should be:**
```javascript
{
  coordState: { user, initialized, accessLevel, accessSource, accessPhase: 'resolved', accessError: null },
  accessLevel,
  accessSource,
  status: 'ready',
  canAccessAuthenticated,
  actions: { refresh, clear, ensure },
  debug: import.meta.env.DEV ? { ... } : undefined,
}
```

**Check consumers of removed fields before deleting:**
- `paywall` — grep for `useAccess().paywall` or destructured `paywall` from `useAccess()`. The agents found no consumer.
- `expiry` — grep for `useAccess().expiry` or destructured `expiry`. The agents found no consumer.
- `dispatch` — grep for `useAccess().dispatch`. The agents found no consumer.

### Step 2.5: Remove `requiresSubscription` from `useAppQuery.js`

- Remove parameter `requiresSubscription = false` from destructuring (line 86)
- Remove from JSDoc comment (line 59)
- Simplify line 103: `const shouldRequireAccess = requiresAccess || requiresSubscription;` → `const shouldRequireAccess = requiresAccess;`
- Remove `proReady` from destructuring at line 78 (since it always equals `authenticatedReady`)
- Simplify line 104: `const accessReadyGate = authenticatedReady ?? proReady ?? true;` → `const accessReadyGate = authenticatedReady ?? true;`

### Step 2.6: Remove `proReady` from `AppReadyContext.jsx`

- Remove line 141: `proReady: appReady,` from the value useMemo
- Update `useAppReadyOptional` default (line 35): remove `proReady: true`
- After this, update `RequireAccess.jsx` line 19-21: remove `proReady` from destructuring and simplify `ready`:
  ```javascript
  const { authenticatedReady } = useAppReady();
  const ready = authenticatedReady ?? true;
  ```
- Update `useAppQuery.js` (already addressed in 2.5)

### Step 2.7: Remove `RequirePro` alias

- In `frontend/src/components/common/RequireAccess.jsx` line 83: remove `export const RequirePro = RequireAccess;`
- Delete `frontend/src/components/common/RequirePro.jsx` (1 line re-export file) — **only if no external imports exist** (confirmed: no external imports of `RequirePro` were found)
- The `RequireAccess` default export and named export remain intact.

### Step 2.8: Remove orphaned auth contract schemas (backend)

**In `backend/api/contracts/schemas/auth.py`:**
Remove 5 of 6 contracts that have no route handler:

| Contract | Lines | Route exists? |
|----------|-------|--------------|
| `REGISTER_CONTRACT` | 39-56 | No |
| `LOGIN_CONTRACT` | 63-80 | No |
| `ME_CONTRACT` | 87-103 | No |
| `FIREBASE_SYNC_CONTRACT` | 110-128 | No |
| `SUBSCRIPTION_CONTRACT` | 135-156 | No |

**Keep only:** `DELETE_ACCOUNT_CONTRACT` (lines 163-179) — has an active route at `routes/auth.py:109`.

**Also update imports at top of file (lines 25-32):** Remove `RegisterParams`, `LoginParams`, `MeParams`, `FirebaseSyncParams`, `SubscriptionParams` imports.

**Also update the file docstring (lines 1-13):** Simplify to reflect only `DELETE /auth/delete-account`.

### Step 2.9: Remove orphaned pydantic models

**In `backend/api/contracts/pydantic_models/auth.py`:**
Remove classes: `RegisterParams`, `LoginParams`, `MeParams`, `FirebaseSyncParams`, `SubscriptionParams`.
Keep only: `DeleteAccountParams`.
Update docstring.

**In `backend/api/contracts/pydantic_models/__init__.py`:**
- Remove line 57-63 imports of the 5 deleted classes
- Remove lines 105-109 from `__all__`

### Step 2.10: Remove `serialize_transaction_teaser` and masking helpers

**In `backend/api/contracts/contract_schema.py`:**
- Delete `serialize_transaction_teaser()` (lines 429-465)
- Delete `_mask_price()` (lines 468-481)
- Delete `_mask_area()` (lines 484-489)
- Delete `_mask_psf()` (lines 492-505)
- Zero callers confirmed.

### Step 2.11: Remove unreachable inline access checks in routes

**`backend/routes/analytics/dashboard.py` lines 105-114:**
The `@require_authenticated_access` decorator at line 30 already blocks anonymous users. The inline `has_authenticated_access()` check at line 107 is unreachable. Remove:
- The import at line 107: `from utils.subscription import has_authenticated_access`
- The entire `if not has_authenticated_access()` block (lines 108-114)

**`backend/routes/analytics/aggregate.py` lines 405-415:**
The `@require_authenticated_access` decorator at line 301 already blocks anonymous users. The inline `check_granularity_allowed()` check is unreachable. Remove:
- The import at line 406: `from utils.subscription import check_granularity_allowed, has_authenticated_access`
- The entire granularity check block (lines 407-415)

### Step 2.12: Remove dead exports from `backend/utils/subscription.py`

- Remove `check_granularity_allowed()` function (lines 128-155) — only caller was the unreachable block removed in 2.11
- Remove `enforce_filter_granularity()` function (lines 469-499) — zero callers
- Remove comment at line 265-266 mentioning "Premium"

**Update `backend/utils/__init__.py`:**
- Remove `enforce_filter_granularity` from import (line 10) and `__all__` (line 45)
- `check_granularity_allowed` is NOT in `__init__.py` imports (it was imported inline), so no change needed there

### Step 2.13: Simplify `User` model — remove billing/override dead columns

**In `backend/models/user.py`:**

Remove these storage columns and their property accessors:
- `billing_customer_ref_storage` (line 24) + `billing_customer_ref` property (lines 67-72) — maps to `stripe_customer_id` DB column. Nothing reads it.
- `access_status_storage` (line 25) + `access_status` property (lines 51-56) — set but never read for any decision.

Simplify `access_info()` method (lines 98-113):
- The override logic (lines 104-107) only adjusts metadata fields (`source`, `expires_at`), NOT `has_access`. Since there's no subscription system, simplify to always return `{ 'has_access': True, 'access_source': 'authenticated_user', 'access_expires_at': None }`.

**KEEP these columns (still referenced in migration sync triggers and may exist in DB):**
- `access_level_storage` — written during user creation
- `access_expires_at_storage` — referenced in `to_dict()`
- `access_override_enabled_storage` — referenced in override check
- `access_override_until_storage` — referenced in override check
- `access_source_storage` — referenced in access_info

**DECISION: Keep or remove access_override?**
The admin override columns (`access_override_enabled`, `access_override_until`, `access_source`) currently don't gate anything (`has_access` is always `True`). However, they may serve a legitimate admin purpose (e.g., temporarily revoking access). Since we cannot verify if any admin tooling uses these, we should **keep the columns but simplify the `access_info()` override logic** by removing the `expires_at` tracking (since it doesn't affect access).

**Revised simplification of `access_info()`:**
```python
def access_info(self):
    return {
        'has_access': True,
        'access_source': 'authenticated_user',
        'access_expires_at': None,
    }
```

Also simplify `access_level` property — keep the hardcoded `'authenticated'` return, but update the docstring at file top.

Remove `access_level` setter (lines 45-48) — nothing needs to set it anymore (user creation at `subscription.py:71` can be removed since the storage column default handles it).

### Step 2.14: Clean up comments and naming

- `backend/app.py:489` — change `# AI routes (Chart interpretation - Premium feature)` → `# AI routes (Chart interpretation)`
- `frontend/src/App.jsx:146` — change `(auth + subscription + filters)` → `(auth + filters)`
- `frontend/src/components/layout/UserProfileMenu.jsx:88` — change `{/* System Chip Plan Badge */}` → `{/* Access Badge */}`, and change `{/* Name + System Chip Plan Badge when expanded */}` → `{/* Name + Access Badge when expanded */}`
- `frontend/src/components/ui/index.ts` — remove `// Premium gating` section comment

---

## Phase 3: Rename `subscription.py` to `auth.py`

### Step 3.1: Rename the file
```bash
git mv backend/utils/subscription.py backend/utils/auth.py
```

### Step 3.2: Update all imports (9 files)

| File | Line | Old | New |
|------|------|-----|-----|
| `backend/utils/__init__.py` | 4 | `from .subscription import (` | `from .auth import (` |
| `backend/routes/analytics/aggregate.py` | 26 | `from utils.subscription import require_authenticated_access` | `from utils.auth import require_authenticated_access` |
| `backend/routes/analytics/kpi_v2.py` | 27 | `from utils.subscription import require_authenticated_access` | `from utils.auth import require_authenticated_access` |
| `backend/routes/analytics/dashboard.py` | 24 | `from utils.subscription import require_authenticated_access` | `from utils.auth import require_authenticated_access` |
| `backend/routes/ai.py` | 20 | `from utils.subscription import require_authenticated_access, get_user_from_request` | `from utils.auth import require_authenticated_access, get_user_from_request` |
| `backend/routes/insights.py` | 21 | `from utils.subscription import get_user_from_request` | `from utils.auth import get_user_from_request` |
| `backend/routes/auth.py` | 116 | `from utils.subscription import get_user_from_request` | `from utils.auth import get_user_from_request` |
| `backend/routes/projects.py` | 437 | `from utils.subscription import has_authenticated_access` | `from utils.auth import has_authenticated_access` |
| `backend/routes/deal_checker.py` | 303 | `from utils.subscription import has_authenticated_access` | `from utils.auth import has_authenticated_access` |

**Note:** After Phase 2.11, the inline imports in `dashboard.py:107` and `aggregate.py:406` will already be removed, so those files only have the top-level import to update.

### Step 3.3: Update landmines script reference
- `backend/scripts/check_landmines.py:72` — update `SubscriptionContext.jsx` reference to note the file was renamed to `AccessContext.jsx` (it was already renamed in a prior PR, so this landmine entry just needs its filename updated in the comment)

---

## Phase 4: Update Tests

### Step 4.1: Rewrite `test_subscription_schema_guard.py`

The test at `backend/tests/test_subscription_schema_guard.py` calls `GET /api/auth/subscription` which has no route handler.

**Option A (preferred): Delete the file.** The endpoint doesn't exist. The test is testing a phantom.

**Option B:** If we want to test that the endpoint correctly returns 404 (not 200), rename and update to verify nonexistence. But this seems unnecessary.

**Decision: Delete `backend/tests/test_subscription_schema_guard.py`.**

### Step 4.2: Fix mock `is_subscribed` in contract tests

**`backend/tests/contracts/test_endpoint_smoke.py:127`:**
Remove `mock.is_subscribed.return_value = False` — `User` has no `is_subscribed` method.

**`backend/tests/contracts/test_all_endpoints_strict.py:164`:**
Remove `mock_user.is_subscribed.return_value = False` — same.

### Step 4.3: Update `authRaceConditions.test.js`

This file is 1000+ lines with heavy subscription-era simulation logic. The changes needed:

1. **Remove `createSubscriptionStateMachine()` function** (lines 21-47) and all tests that use it — OR rename it to `createAccessStateMachine()` if the tests still validate real race conditions with the current auth model.
2. **Remove or update tests referencing `subscription:` localStorage keys** (lines 464, 473, 475, 490, 492, 500, 510) — the current `AccessContext` doesn't use localStorage for subscription caching.
3. **Remove tests referencing `getCachedSubscription()`** (lines 1105, 1135, 1148) — function doesn't exist.
4. **Remove tests referencing `subscribed` and `ends_at` fields** (lines 1087, 1109-1154) — these fields are being removed.
5. **Remove the import of `authCoordinatorReducer`** at line 719 — the module is being deleted in Phase 1.2. Remove the entire test block that uses the reducer.

**Important:** Review each test to determine if it's testing a REAL race condition that still applies (auth init timing, Firebase state changes, user switching) vs. testing subscription-specific flows that no longer exist. Keep the former, delete the latter.

### Step 4.4: Update `TimeTrendChart.test.jsx`

- Line 131: Remove `PreviewChartOverlay` mock (component deleted in Phase 2.1)
- Line 142: Remove `proReady` from mock if it was removed from `AppReadyContext`

### Step 4.5: Update `useAppQuery.test.jsx`

- Line 21: Remove `proReady` from mock value

---

## Phase 5: Regenerate Contracts + Verify

### Step 5.1: Regenerate contract artifacts
```bash
python backend/scripts/generate_contracts.py
```

This will regenerate:
- `frontend/src/generated/apiContract.json` — will reflect the removed auth contracts
- `frontend/src/generated/apiContract.ts` — unchanged (passthrough)
- `backend/contracts_manifest.sha256` — new hash

### Step 5.2: Verify frontend builds
```bash
cd frontend && npm run lint && npm run typecheck && npm run build
```

### Step 5.3: Verify backend tests
```bash
cd backend && python -m pytest tests/ -v --ignore=tests/test_subscription_schema_guard.py
```

(Ignore the deleted test file if the test runner sees it before deletion is staged.)

### Step 5.4: Run regression snapshots (if available)
```bash
cd backend && pytest tests/test_regression_snapshots.py -v
```

### Step 5.5: Commit and push
```bash
git add -A
git commit -m "refactor: remove subscription/premium/payment remnants — simplify to auth-only access model"
git push -u origin claude/investigate-contract-drift-5LDUL
```

---

## Files Summary

### Files to DELETE (5):
1. `backend/models/processed_webhook.py`
2. `frontend/src/context/authCoordinator.js`
3. `frontend/src/context/accessDerivations.js`
4. `frontend/src/context/__tests__/accessDerivations.test.js`
5. `frontend/src/context/AccessContext.test.js`
6. `frontend/src/components/ui/PreviewChartOverlay.jsx`
7. `frontend/src/components/ui/ChartWatermark.jsx`
8. `frontend/src/components/common/RequirePro.jsx`
9. `backend/tests/test_subscription_schema_guard.py`

### Files to RENAME (1):
1. `backend/utils/subscription.py` → `backend/utils/auth.py`

### Files to EDIT (~30):
**Backend:**
- `backend/models/__init__.py`
- `backend/models/user.py`
- `backend/utils/__init__.py`
- `backend/utils/auth.py` (née subscription.py)
- `backend/api/contracts/schemas/auth.py`
- `backend/api/contracts/pydantic_models/auth.py`
- `backend/api/contracts/pydantic_models/__init__.py`
- `backend/api/contracts/contract_schema.py`
- `backend/routes/analytics/dashboard.py`
- `backend/routes/analytics/aggregate.py`
- `backend/routes/analytics/kpi_v2.py`
- `backend/routes/ai.py`
- `backend/routes/insights.py`
- `backend/routes/auth.py`
- `backend/routes/projects.py`
- `backend/routes/deal_checker.py`
- `backend/app.py`
- `backend/scripts/check_landmines.py`
- `backend/tests/contracts/test_endpoint_smoke.py`
- `backend/tests/contracts/test_all_endpoints_strict.py`

**Frontend:**
- `frontend/src/context/AccessContext.jsx`
- `frontend/src/context/AppReadyContext.jsx`
- `frontend/src/hooks/useAppQuery.js`
- `frontend/src/components/common/RequireAccess.jsx`
- `frontend/src/components/ui/index.ts`
- `frontend/src/App.jsx`
- `frontend/src/components/layout/UserProfileMenu.jsx`
- 8 chart components (PreviewChartOverlay removal)
- 3 page files (ChartWatermark removal)
- 9 component files (isAccessRestricted removal)
- `frontend/src/components/powerbi/__tests__/TimeTrendChart.test.jsx`
- `frontend/src/hooks/__tests__/useAppQuery.test.jsx`
- `frontend/src/context/__tests__/authRaceConditions.test.js`

### Files NOT TOUCHED (confirmed safe to skip):
- All migration SQL files (historical DDL)
- `ACCESS_NAMING_CLEANUP_PLAN.md` (historical documentation)
- Domain uses of "premium" (new launch premium, price premium zone, CCR premium)
- `config.py:107` browser Permissions-Policy `"payment": "()"` (browser security, not product payments)
- `BlurredCell.jsx` — active display component for server-side data masking (not subscription-related)

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Breaking import paths after subscription.py rename | Grep for ALL `subscription` imports verified in plan; update in single commit |
| Removing contracts that are tested | Delete corresponding tests in same commit |
| Removing context fields that are consumed | All consumers verified: `paywall`, `expiry`, `dispatch` have zero consumers beyond definitions |
| DB column removal causing migration issues | NOT removing DB columns, only removing Python property accessors for unused ones |
| ESLint config referencing deleted files | Update eslint overrides that reference `authCoordinator` |
| `authRaceConditions.test.js` breakage | Carefully review which tests cover real auth race conditions vs. subscription-specific flows |
