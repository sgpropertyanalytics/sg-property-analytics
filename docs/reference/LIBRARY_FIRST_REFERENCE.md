# Library-First Reference Guide

> **Purpose:** Comprehensive reference for choosing libraries over custom code.
> **Related:** CLAUDE.md Section 1.6 | Skill: `/library-check`

This document exists because on Dec 25, 2025, we built 400+ lines of custom query hooks when React Query would have solved the problem in 5 lines per chart. The `datePreset` cache key bug was a direct result of this decision.

---

## Table of Contents

1. [Decision Framework](#decision-framework)
2. [Frontend Libraries (React/JavaScript)](#frontend-libraries-reactjavascript)
3. [Backend Libraries (Python)](#backend-libraries-python)
4. [Common Scenarios](#common-scenarios)
5. [Red Flags](#red-flags)
6. [Library Health Checklist](#library-health-checklist)
7. [Decision Documentation Template](#decision-documentation-template)
8. [The Lesson Learned](#the-lesson-learned)

---

## Decision Framework

### Default: Use Library

Unless you have a specific, documented reason, **use a library** for infrastructure code.

### Trigger Conditions (When to Check)

| Trigger | Action |
|---------|--------|
| Creating new file in `/hooks`, `/utils`, `/lib`, `/helpers` | STOP → Run `/library-check` |
| Hook/util about to exceed 50 lines | STOP → Ask "Is there a library?" |
| Naming pattern: `use[Noun]` (e.g., `useQuery`, `useForm`) | STOP → That noun is probably solved |
| Using `useState` + `useEffect` + `useRef` together for async | STOP → Likely reinventing React Query |
| Writing `AbortController` logic | STOP → React Query handles this |
| Writing `localStorage` sync in useEffect | STOP → Use Zustand persist |
| Manual cache key generation (`JSON.stringify` for deps) | STOP → React Query auto-generates keys |
| Request ID tracking for stale responses | STOP → React Query handles this |

### Use Library When (DEFAULT)

- [ ] Problem is common (>3 libraries exist for it)
- [ ] Library has >5K GitHub stars
- [ ] Library updated in last 6 months
- [ ] Library saves >50 lines of code
- [ ] Problem involves edge cases (race conditions, browser compat, a11y)
- [ ] You'd be writing `useState` + `useEffect` + `useRef` together
- [ ] You'd be handling AbortController, retry logic, or cache invalidation

### Build Custom When (REQUIRES JUSTIFICATION)

- [ ] Problem is domain-specific business logic (not infrastructure)
- [ ] No maintained library exists (verified: <1K stars or no update in 1 year)
- [ ] Wrapper is <30 lines around existing library
- [ ] Bundle size is measured AND critical (not assumed)

### When Custom Code is FORBIDDEN

| Situation | Why It's Forbidden | What To Do Instead |
|-----------|-------------------|-------------------|
| "I can write this in an hour" | You'll spend 10 hours on edge cases | Use library (they already handled edge cases) |
| "Library is overkill for this" | Scope creep will make it complex | Start with library, keep it simple |
| "I don't want to learn new API" | You'll teach others your custom API instead | Library API is documented, yours isn't |
| "Bundle size concern" (without measuring) | Premature optimization | Measure first, then decide |
| "We need full control" | You'll have full control of bugs too | Libraries are configurable |

---

## Frontend Libraries (React/JavaScript)

### Data Fetching & Caching

| Library | Size | GitHub Stars | Weekly Downloads | Use For |
|---------|------|--------------|------------------|---------|
| **@tanstack/react-query** | ~13KB | 43K+ | 3.5M+ | Data fetching, caching, refetch, mutations |
| **swr** | ~4KB | 30K+ | 2M+ | Simpler data fetching, lighter |
| **axios** | ~14KB | 105K+ | 45M+ | HTTP client (if not using fetch) |

**When to use:** ANY data fetching with loading/error states, caching, or refetch logic.

**Red flags (use library instead):**
- `const [data, setData] = useState(null)`
- `const [loading, setLoading] = useState(false)`
- `new AbortController()` in component
- `JSON.stringify(deps)` for cache keys
- `requestIdRef.current++` for stale checks

### State Management

| Library | Size | GitHub Stars | Weekly Downloads | Use For |
|---------|------|--------------|------------------|---------|
| **zustand** | ~3KB | 48K+ | 4M+ | Simple global state, persist to localStorage |
| **jotai** | ~3KB | 18K+ | 700K+ | Atomic state, derived values |
| **redux-toolkit** | ~11KB | 10K+ | 3M+ | Complex state with actions/reducers |
| **valtio** | ~3KB | 9K+ | 300K+ | Proxy-based reactivity |

**When to use:** Shared state across components, persistence, complex derived state.

**Red flags (use library instead):**
- `createContext` + `useReducer` + provider (>100 lines)
- `localStorage.setItem` in `useEffect`
- Multiple useState calls that are logically related

### Forms & Validation

| Library | Size | GitHub Stars | Weekly Downloads | Use For |
|---------|------|--------------|------------------|---------|
| **react-hook-form** | ~9KB | 42K+ | 4M+ | Form state, validation, uncontrolled inputs |
| **formik** | ~13KB | 34K+ | 2.5M+ | Form state, controlled inputs |
| **zod** | ~12KB | 35K+ | 10M+ | Schema validation, TypeScript inference |
| **yup** | ~15KB | 22K+ | 6M+ | Schema validation, older ecosystem |
| **valibot** | ~1KB | 6K+ | 200K+ | Tiny schema validation |

**When to use:** ANY form with validation, dirty tracking, or complex field logic.

**Red flags (use library instead):**
- `useState` for each form field
- Custom `validate()` functions (>30 lines)
- Manual `touched` / `dirty` tracking

### Date & Time

| Library | Size | GitHub Stars | Weekly Downloads | Use For |
|---------|------|--------------|------------------|---------|
| **date-fns** | ~2KB/fn | 35K+ | 23M+ | Date manipulation, tree-shakeable |
| **dayjs** | ~2KB | 47K+ | 18M+ | Moment-like API, tiny |
| **luxon** | ~20KB | 15K+ | 6M+ | Timezone handling, Intl-based |

**When to use:** Date formatting, parsing, manipulation, timezone handling.

**Red flags (use library instead):**
- Custom date parsing (>20 lines)
- Manual timezone conversion
- Custom relative time ("2 days ago")

### Tables & Data Grids

| Library | Size | GitHub Stars | Weekly Downloads | Use For |
|---------|------|--------------|------------------|---------|
| **@tanstack/react-table** | ~15KB | 25K+ | 1.5M+ | Headless table, sorting, filtering, pagination |
| **ag-grid-react** | ~200KB+ | 12K+ | 500K+ | Full-featured data grid |
| **react-data-grid** | ~50KB | 7K+ | 150K+ | Excel-like grid |

**When to use:** Tables with sorting, filtering, pagination, or virtual scrolling.

**Red flags (use library instead):**
- Custom `sortBy` state + sort functions
- Manual pagination state
- Custom filter logic for tables

### Virtualization

| Library | Size | GitHub Stars | Weekly Downloads | Use For |
|---------|------|--------------|------------------|---------|
| **@tanstack/react-virtual** | ~3KB | 5K+ | 700K+ | Virtual scrolling, any direction |
| **react-window** | ~6KB | 16K+ | 1.5M+ | Simple virtual lists/grids |
| **react-virtuoso** | ~15KB | 5K+ | 300K+ | Feature-rich virtual lists |

**When to use:** Lists/grids with >100 items, infinite scroll.

**Red flags (use library instead):**
- Custom windowing logic
- Manual `slice(startIndex, endIndex)` rendering
- Performance issues with large lists

### Animations

| Library | Size | GitHub Stars | Weekly Downloads | Use For |
|---------|------|--------------|------------------|---------|
| **framer-motion** | ~50KB | 24K+ | 3M+ | Full-featured animations, gestures |
| **react-spring** | ~20KB | 28K+ | 1M+ | Physics-based animations |
| **auto-animate** | ~2KB | 12K+ | 100K+ | Automatic animations |

**When to use:** Enter/exit animations, layout transitions, gestures.

**Red flags (use library instead):**
- Custom CSS transitions + state coordination
- Manual animation timing logic
- `requestAnimationFrame` in components

### Drag & Drop

| Library | Size | GitHub Stars | Weekly Downloads | Use For |
|---------|------|--------------|------------------|---------|
| **@dnd-kit/core** | ~10KB | 12K+ | 1.5M+ | Accessible, composable drag-drop |
| **react-beautiful-dnd** | ~30KB | 33K+ | 1.5M+ | Beautiful list reordering |
| **react-dnd** | ~20KB | 21K+ | 1M+ | Flexible, lower-level |

**When to use:** Reordering lists, file drops, kanban boards.

**Red flags (use library instead):**
- Custom pointer event handling
- Manual drag state tracking
- `onMouseDown`/`onMouseMove` coordination

### UI Primitives

| Library | Size | GitHub Stars | Weekly Downloads | Use For |
|---------|------|--------------|------------------|---------|
| **@radix-ui/react-dialog** | ~5KB | 16K+ | 2M+ | Accessible modal dialogs |
| **@radix-ui/react-popover** | ~5KB | 16K+ | 1M+ | Accessible popovers |
| **@headlessui/react** | ~10KB | 26K+ | 1.5M+ | Accessible UI primitives |
| **react-aria** | varies | 13K+ | 500K+ | Accessibility hooks |

**When to use:** Modals, dialogs, popovers, menus, tooltips.

**Red flags (use library instead):**
- Custom modal with `createPortal`
- Manual focus trap logic
- Custom popover positioning

### Toasts & Notifications

| Library | Size | GitHub Stars | Weekly Downloads | Use For |
|---------|------|--------------|------------------|---------|
| **sonner** | ~5KB | 8K+ | 500K+ | Beautiful toast notifications |
| **react-hot-toast** | ~5KB | 10K+ | 1M+ | Lightweight toasts |
| **react-toastify** | ~10KB | 12K+ | 2M+ | Feature-rich toasts |

**When to use:** Success/error notifications, auto-dismiss messages.

**Red flags (use library instead):**
- Custom toast context + queue logic
- Manual auto-dismiss with `setTimeout`
- Custom toast positioning

### Utilities

| Library | Size | GitHub Stars | Weekly Downloads | Use For |
|---------|------|--------------|------------------|---------|
| **use-debounce** | ~1KB | 2K+ | 1M+ | Debounced values/callbacks |
| **react-intersection-observer** | ~2KB | 5K+ | 2M+ | Visibility detection |
| **@react-hook/resize-observer** | ~1KB | 500+ | 100K+ | Element size tracking |
| **use-local-storage-state** | ~1KB | 1K+ | 100K+ | SSR-safe localStorage |
| **react-error-boundary** | ~2KB | 7K+ | 3M+ | Error boundaries |
| **nuqs** | ~3KB | 2K+ | 50K+ | URL query state |

---

## Backend Libraries (Python)

### HTTP & API Clients

| Library | Use For | Red Flag (Custom Code) |
|---------|---------|------------------------|
| **httpx** | Async HTTP client | Custom `urllib` wrappers |
| **requests** | Sync HTTP client | Manual socket handling |
| **aiohttp** | Async HTTP (if not using httpx) | Custom async HTTP |

### Validation & Serialization

| Library | Use For | Red Flag (Custom Code) |
|---------|---------|------------------------|
| **pydantic** | Input validation, type coercion | Custom validation functions (>50 lines) |
| **marshmallow** | Serialization/deserialization | Custom dict transforms |
| **attrs** | Data classes with validation | Manual `__init__` with checks |

### Database & ORM

| Library | Use For | Red Flag (Custom Code) |
|---------|---------|------------------------|
| **sqlalchemy** | SQL ORM, query building | Custom SQL string builders |
| **databases** | Async database queries | Custom async wrappers |
| **alembic** | Database migrations | Manual SQL migration scripts |

### Caching

| Library | Use For | Red Flag (Custom Code) |
|---------|---------|------------------------|
| **cachetools** | In-memory caching with TTL | Custom dict-based cache |
| **redis** | Distributed caching | Custom file-based cache |
| **aiocache** | Async caching | Custom async cache logic |

### Background Jobs & Tasks

| Library | Use For | Red Flag (Custom Code) |
|---------|---------|------------------------|
| **celery** | Distributed task queue | Custom threading/multiprocessing |
| **rq** | Simple Redis queue | Custom job scheduling |
| **dramatiq** | Alternative to Celery | Manual task coordination |
| **arq** | Async Redis queue | Custom async workers |

### Rate Limiting

| Library | Use For | Red Flag (Custom Code) |
|---------|---------|------------------------|
| **slowapi** | FastAPI/Starlette rate limiting | Custom token bucket |
| **ratelimit** | Function-level rate limiting | Manual rate tracking |
| **limits** | Rate limit primitives | Custom sliding window |

### Retries & Resilience

| Library | Use For | Red Flag (Custom Code) |
|---------|---------|------------------------|
| **tenacity** | Retry with backoff | Custom retry loops |
| **backoff** | Decorative retries | Manual exponential backoff |
| **circuitbreaker** | Circuit breaker pattern | Custom failure tracking |

### Date & Time

| Library | Use For | Red Flag (Custom Code) |
|---------|---------|------------------------|
| **pendulum** | Timezone-aware dates | Custom datetime parsing (>20 lines) |
| **arrow** | Human-friendly dates | Manual timezone conversion |
| **python-dateutil** | Date parsing | Custom date string parsing |

### Configuration

| Library | Use For | Red Flag (Custom Code) |
|---------|---------|------------------------|
| **pydantic-settings** | Environment config with validation | Custom config parsing |
| **python-dotenv** | .env file loading | Custom env file reader |
| **dynaconf** | Multi-environment config | Manual config merging |

---

## Common Scenarios

### Scenario 1: "I need to fetch data with loading/error states"

**WRONG (30+ lines):**
```jsx
const [data, setData] = useState(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);

useEffect(() => {
  const controller = new AbortController();
  setLoading(true);

  fetchData({ signal: controller.signal })
    .then(res => setData(res))
    .catch(err => {
      if (!controller.signal.aborted) setError(err);
    })
    .finally(() => setLoading(false));

  return () => controller.abort();
}, [deps]);
```

**RIGHT (5 lines):**
```jsx
import { useQuery } from '@tanstack/react-query';

const { data, isLoading, error } = useQuery({
  queryKey: ['myData', params],
  queryFn: () => fetchData(params)
});
```

### Scenario 2: "I need to cancel requests when filters change"

**WRONG (20+ lines):**
```jsx
const controllerRef = useRef();
const requestIdRef = useRef(0);

useEffect(() => {
  controllerRef.current?.abort();
  controllerRef.current = new AbortController();
  const requestId = ++requestIdRef.current;

  fetch(url, { signal: controllerRef.current.signal })
    .then(res => {
      if (requestId !== requestIdRef.current) return; // Stale check
      setData(res);
    });

  return () => controllerRef.current?.abort();
}, [deps]);
```

**RIGHT (React Query handles it):**
```jsx
const { data } = useQuery({
  queryKey: ['myData', params],
  queryFn: ({ signal }) => fetch(url, { signal }).then(r => r.json())
});
```

### Scenario 3: "I need global state that persists to localStorage"

**WRONG (15+ lines):**
```jsx
const [state, setState] = useState(() => {
  const saved = localStorage.getItem('key');
  return saved ? JSON.parse(saved) : defaultValue;
});

useEffect(() => {
  localStorage.setItem('key', JSON.stringify(state));
}, [state]);
```

**RIGHT (Zustand with persist):**
```jsx
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useStore = create(persist(
  (set) => ({ value: null, setValue: (v) => set({ value: v }) }),
  { name: 'my-storage' }
));
```

### Scenario 4: "I need to track if an element is visible"

**WRONG (15+ lines):**
```jsx
const [isVisible, setIsVisible] = useState(false);
const ref = useRef();

useEffect(() => {
  const observer = new IntersectionObserver(([entry]) => {
    setIsVisible(entry.isIntersecting);
  });
  if (ref.current) observer.observe(ref.current);
  return () => observer.disconnect();
}, []);
```

**RIGHT (2 lines):**
```jsx
import { useInView } from 'react-intersection-observer';
const { ref, inView } = useInView();
```

### Scenario 5: "I need form validation"

**WRONG (20+ lines):**
```jsx
const [email, setEmail] = useState('');
const [emailError, setEmailError] = useState('');
const [password, setPassword] = useState('');
const [passwordError, setPasswordError] = useState('');

const validate = () => {
  let valid = true;
  if (!email.includes('@')) {
    setEmailError('Invalid email');
    valid = false;
  }
  if (password.length < 8) {
    setPasswordError('Too short');
    valid = false;
  }
  return valid;
};
```

**RIGHT (React Hook Form + Zod):**
```jsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(schema)
});
```

### Scenario 6: "I need to debounce a value"

**WRONG (10+ lines):**
```jsx
const [debouncedValue, setDebouncedValue] = useState(value);

useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedValue(value);
  }, 300);
  return () => clearTimeout(timer);
}, [value]);
```

**RIGHT (1 line):**
```jsx
import { useDebounce } from 'use-debounce';
const [debouncedValue] = useDebounce(value, 300);
```

---

## Red Flags

Stop immediately if you see yourself writing any of these patterns:

| Red Flag | What It Usually Means | Use Instead |
|----------|----------------------|-------------|
| `const [data, setData] = useState(null)` + `useEffect` | Data fetching | React Query |
| `const [loading, setLoading] = useState(false)` | Async state | React Query |
| `const requestIdRef = useRef(0)` | Stale request handling | React Query |
| `new AbortController()` in component | Request cancellation | React Query |
| `JSON.stringify(deps)` for cache key | Manual cache key | React Query |
| `if (requestId !== currentRequestId) return` | Stale check | React Query |
| `localStorage.setItem` in `useEffect` | State persistence | Zustand persist |
| `new IntersectionObserver()` in component | Visibility detection | react-intersection-observer |
| `document.addEventListener('keydown')` | Keyboard shortcuts | use-hotkeys |
| `createContext` + `useReducer` (>100 lines) | Complex state | Zustand |
| `useState` for each form field | Form state | react-hook-form |
| Custom `validate()` functions | Validation | zod |
| `setTimeout` for auto-dismiss | Toast timing | sonner |
| `createPortal` for modals | Modal logic | @radix-ui/dialog |

---

## Library Health Checklist

Before adopting a new library, verify:

- [ ] **GitHub stars:** >1,000 (ideally >5,000)
- [ ] **Weekly npm downloads:** >10,000
- [ ] **Last commit:** Within 6 months
- [ ] **Open issues:** Reasonable ratio (not 500+ unaddressed)
- [ ] **TypeScript support:** Has types (built-in or `@types/`)
- [ ] **Bundle size:** Check on bundlephobia.com
- [ ] **Used by:** Known companies (check README)
- [ ] **Documentation:** Clear, with examples
- [ ] **Breaking changes:** Check CHANGELOG for stability

### Quick Health Check Commands

```bash
# Check npm stats
npm view @tanstack/react-query

# Check bundle size
npx bundlephobia @tanstack/react-query

# Check if already installed
grep "react-query" package.json
```

---

## Decision Documentation Template

If you choose custom code (for valid reasons), add this comment:

```javascript
/**
 * CUSTOM IMPLEMENTATION
 *
 * Problem: [What this code solves]
 *
 * Chose custom over [library name] because:
 * - [Specific reason 1]
 * - [Specific reason 2]
 *
 * Alternatives considered:
 * - [Library 1]: [Why rejected]
 * - [Library 2]: [Why rejected]
 *
 * Revisit if:
 * - [Condition that would change this decision]
 * - Library matures / our needs change
 *
 * Metrics:
 * - Lines of code: [X]
 * - Estimated library equivalent: [Y] lines
 * - Bundle size saved: [Z]KB (if applicable)
 *
 * Decision date: [YYYY-MM-DD]
 * Decision maker: [Name/Claude]
 */
```

---

## The Lesson Learned

### What Happened

On **December 25, 2025**, Claude introduced `useStaleRequestGuard` and AbortController patterns to fix race conditions in chart data fetching.

Over the following **7 days**, this grew into **400+ lines** across 4 custom hook files:

| File | Lines | Purpose |
|------|-------|---------|
| `useQuery.js` | ~100 | Status machine (idle/pending/loading/success/error) |
| `useAbortableQuery.js` | ~100 | AbortController wrapper |
| `useGatedAbortableQuery.js` | ~100 | Visibility gating with IntersectionObserver |
| `useStaleRequestGuard.js` | ~100 | Request ID tracking, stale response prevention |

Plus `generateFilterKey()` (~20 lines) for manual cache key generation.

### What Went Wrong

The **`datePreset` cache key bug** occurred because:

1. `generateFilterKey()` was manually listing every filter field
2. When `datePreset` was added, someone forgot to add it to the list
3. Result: Changing date presets didn't trigger refetch (cache key was unchanged)

### What Should Have Happened

**React Query** would have prevented this bug entirely:

```jsx
// React Query auto-generates cache key from params
const { data } = useQuery({
  queryKey: ['aggregate', params],  // params includes datePreset automatically
  queryFn: () => fetchData(params)
});
```

No manual cache key maintenance. No possibility of forgetting a field.

### The Cost

| Metric | Custom Code | React Query |
|--------|-------------|-------------|
| Lines of code | 400+ | ~5 per chart |
| Files to maintain | 4 | 0 (library maintained) |
| Bug surface area | High (manual everything) | Low (battle-tested) |
| Edge cases handled | Some (we discovered in prod) | All (years of fixes) |
| DevTools | None | Built-in |
| Time spent debugging | Significant | Minimal |

### The Rule

**This document exists to prevent repeating that mistake.**

Before writing infrastructure code:
1. Check if a library exists
2. Use the library
3. If you must write custom, document why

**There is no scenario where "I can write this in an hour" is a good reason to avoid a library.**

---

## Related Documents

- **CLAUDE.md Section 1.6:** Library-First Principle
- **CLAUDE.md Section 3.2:** Frontend Async (with proactive pattern detection)
- **CLAUDE.md Section 8:** Infrastructure Code Checklist
- **CLAUDE.md Section 9:** Quarterly Infrastructure Audit
- **Skill:** `/library-check`
