## Endpoint Deprecation Monitoring (Contingencies)

This repo uses request logging (sampling + watchlist) to detect traffic on
deprecated or at-risk endpoints before removal.

### Logging Behavior

Logging is written to the app logger output (stdout/stderr). In production,
this means your hosting platform logs (Render, Vercel logs, or container logs).

Example log line:
```
api_request path=/api/aggregate-summary method=GET status=410 duration_ms=2.3 request_id=...
```

### Enable Watchlist Logging (No Sampling)

Set these environment variables in your deployment:
```
REQUEST_LOG_ENABLED=true
REQUEST_LOG_SAMPLE_RATE=0.0
REQUEST_LOG_ENDPOINTS=/api/aggregate-summary,/api/deal-checker/nearby-transactions,/api/insights/district-summary
```

### Optional Sampling (Low Noise)

If you want general API sampling:
```
REQUEST_LOG_ENABLED=true
REQUEST_LOG_SAMPLE_RATE=0.01
REQUEST_LOG_ENDPOINTS=
```

### Incident Checklist (If Anything Breaks)

1. Identify the request path and request_id from logs.
2. Confirm whether the path is in the deprecation watchlist.
3. If a deprecated endpoint is still in use, re-add a temporary route or 410 stub.
4. If data shape issues appear, compare response with contract snapshots:
   `backend/tests/contracts/snapshots/*.json`
5. If client failures occur, check adapter/version assertions in:
   `frontend/src/adapters/`

### Rollback Plan

- Revert the last cleanup commit(s) on the branch if needed.
- If only one endpoint is impacted, restore that route file or re-add a 410 stub.

### Final Safe-Delete Criteria

You are safe to delete endpoints when:
- Watchlist logs show zero hits for all deprecated endpoints during normal usage.
- Contract tests and backend tests pass.
- Frontend smoke checks pass for active endpoints.
