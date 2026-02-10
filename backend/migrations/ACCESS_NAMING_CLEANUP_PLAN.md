# Access Naming DB Cleanup Plan

## Objective
Remove legacy billing-oriented field names from the `users` schema in a staged, low-risk rollout.

## Phase 1 (non-breaking)
Run `/Users/sekoyaz/Documents/New project/backend/migrations/024_add_neutral_access_columns.sql`.

What it does:
- Adds neutral columns alongside existing legacy columns.
- Backfills neutral columns from legacy values.
- Installs a trigger to keep legacy and neutral columns synchronized during mixed-version deploys.

## App rollout between phases
- Update backend code to read/write neutral names only.
- Keep backward-compatible API payload keys during transition.
- Monitor for any consumer still reading legacy DB columns directly.

## Phase 2 (breaking finalization)
Run `/Users/sekoyaz/Documents/New project/backend/migrations/025_finalize_neutral_access_columns.sql` after all services are migrated.

What it does:
- Verifies row-level parity between legacy and neutral columns.
- Removes sync trigger/function.
- Drops legacy columns.
- Leaves neutral schema as canonical.

## Rollback note
- Before phase 2: rollback is straightforward because legacy columns still exist.
- After phase 2: rollback requires recreating legacy columns and backfilling from neutral columns.
