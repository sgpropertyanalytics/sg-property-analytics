---
name: api-url-guardrails
description: API URL configuration and routing guardrails. ALWAYS activate when debugging 404s, modifying API client setup, or changing URL routing. Prevents "works locally, 404 in prod" issues through centralized URL management, environment parity, and fail-fast validation.
---

# API URL & Routing Guardrails

## Purpose

Prevent "works locally, 404 in production" issues by enforcing:
- Single source of truth for API base URL
- Canonical `/api` prefix everywhere
- Environment parity between dev and prod
- Fail-fast validation on misconfiguration
- No import-time side effects

---

## Part 1: The Golden Rules

### Rule 1: Single Source of Truth

```javascript
// frontend/src/api/client.js - THE ONLY PLACE
const getApiBase = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (import.meta.env.PROD) {
    return '/api';  // Vercel rewrites to backend
  }
  return 'http://localhost:5000/api';
};

const API_BASE = getApiBase();
```

**FORBIDDEN:**
```javascript
// Hardcoded URLs in components
fetch('https://sg-property-analyzer.onrender.com/api/health')

// Inconsistent paths
fetch('/health')      // One place
fetch('/api/health')  // Another place

// Raw fetch bypassing apiClient
fetch('/api/aggregate?...')
```

**REQUIRED:**
```javascript
// Always use apiClient
import apiClient from '../api/client';
apiClient.get('/aggregate', { params });
```

---

### Rule 2: One Canonical Prefix

Pick ONE pattern and use it EVERYWHERE:

```
Backend serves:  /api/*
Frontend calls:  /api/* (via apiClient)
Vercel rewrites: /api/* -> backend
```

**Current Setup:**
- `vercel.json`: `/api/:path*` -> `https://sg-property-analyzer.onrender.com/api/:path*`
- Backend: Flask routes under `/api/` blueprint
- Frontend: `apiClient` with `baseURL: '/api'` in prod

---

### Rule 3: Environment Parity

Dev should mirror prod routing structure:

```javascript
// Production (Vercel)
baseURL: '/api'  // Vercel proxy handles CORS

// Development (localhost)
baseURL: 'http://localhost:5000/api'  // Direct to Flask
```

---

### Rule 4: No Import-Time Side Effects

```
RULE: Never do I/O, heavy compute, or data loading at import time.

ALLOWED at module top-level:
  - Constants
  - Type definitions
  - Function definitions
  - Class definitions

FORBIDDEN at module top-level:
  - fetch() / axios calls
  - Database queries
  - File reads
  - Heavy computation

PUT SIDE EFFECTS INSIDE:
  - Request handlers
  - Service functions
  - useEffect / lifecycle hooks
  - Background tasks
  - Explicit init() functions
```

---

## Part 2: Fail-Fast Validation

### At Build Time

```javascript
// vite.config.js
export default defineConfig(({ mode }) => {
  if (mode === 'production') {
    const apiUrl = process.env.VITE_API_URL;
    if (apiUrl && !apiUrl.startsWith('http')) {
      throw new Error(`VITE_API_URL must be a full URL, got: ${apiUrl}`);
    }
  }
  return { /* config */ };
});
```

### At Runtime (Debug Mode)

```javascript
// Log resolved URL on errors
apiClient.interceptors.response.use(
  response => response,
  error => {
    if (import.meta.env.DEV) {
      console.error('[API Error]', {
        baseURL: apiClient.defaults.baseURL,
        url: error.config?.url,
        fullURL: `${apiClient.defaults.baseURL}${error.config?.url}`,
        status: error.response?.status,
      });
    }
    return Promise.reject(error);
  }
);
```

---

## Part 3: Smoke Test Before Deploy

### CI/CD Check

```yaml
# .github/workflows/deploy.yml
- name: Smoke test production API
  run: |
    curl -f https://sg-property-analyzer.onrender.com/api/health || exit 1
    curl -f https://sg-property-analyzer.onrender.com/api/filter-options || exit 1
```

### Manual Script

```bash
#!/bin/bash
# scripts/smoke-test.sh
ENDPOINTS=("/api/health" "/api/filter-options" "/api/aggregate?group_by=region&metrics=count")
BASE_URL=${1:-"https://sg-property-analyzer.onrender.com"}

for endpoint in "${ENDPOINTS[@]}"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$endpoint")
  if [ "$status" != "200" ]; then
    echo "FAIL: $endpoint returned $status"
    exit 1
  fi
  echo "OK: $endpoint"
done
```

---

## Part 4: Debugging 404s in Production

### Step-by-Step Checklist

```
1. CHECK VERCEL REWRITES
   - frontend/vercel.json has correct rewrite rule?
   - Source: /api/:path* -> Destination: backend URL

2. CHECK BACKEND URL
   - Is Render service awake? (free tier sleeps)
   - curl https://sg-property-analyzer.onrender.com/api/health

3. CHECK FRONTEND CONFIG
   - Browser DevTools -> Network tab
   - Console: apiClient.defaults.baseURL

4. CHECK ENVIRONMENT VARIABLES
   - Vercel Dashboard -> Environment Variables
   - Rebuild after changing env vars

5. CHECK CORS
   - If CORS error -> backend CORS config missing origin
```

### Common Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| 404 on `/api/*` in prod | Missing vercel.json rewrite | Add rewrite rule |
| Works locally, 404 in prod | Different URL patterns | Ensure parity |
| Intermittent 404s | Render cold start | Add health check ping |
| CORS errors | Backend missing origin | Add frontend URL to allowed |

---

## Part 5: Pre-Commit Checklist

```
[ ] All API calls use apiClient (not raw fetch)
[ ] No hardcoded backend URLs in components
[ ] vercel.json rewrite rule matches backend route prefix
[ ] Dev and prod use same /api/* pattern
[ ] No I/O or data loading at module top-level
[ ] smoke-test.sh passes against prod
```

---

## Part 6: Quick Audit Commands

```bash
# Find hardcoded API URLs
grep -rn "fetch.*http" frontend/src/
grep -rn "onrender.com" frontend/src/

# Find fetch calls bypassing apiClient
grep -rn "fetch('/api" frontend/src/components/

# Find import-time side effects
grep -rn "^fetch\|^axios\|^await " frontend/src/
```

---

## Quick Reference Card

```
API URL GUARDRAILS

SOURCE OF TRUTH:
  frontend/src/api/client.js -> getApiBase() -> API_BASE

CANONICAL PATTERN:
  Backend:  /api/*
  Frontend: /api/* (via apiClient)
  Vercel:   /api/* -> backend

NO IMPORT-TIME SIDE EFFECTS:
  Module top-level: constants, types, functions only
  Side effects: inside handlers, hooks, init()

CHECKLIST:
[ ] All calls use apiClient
[ ] No hardcoded URLs
[ ] vercel.json rewrite correct
[ ] Dev mirrors prod routing
[ ] No I/O at import time
[ ] Smoke test before deploy

DEBUG 404:
  1. curl backend directly
  2. Check vercel.json rewrite
  3. Check Network tab URL
  4. Check VITE_API_URL env var
```
