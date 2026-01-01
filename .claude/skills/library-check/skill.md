# Library-First Check

> **Purpose:** Prevent reinventing solved problems. MANDATORY before writing infrastructure code.

## When This Skill Triggers

This skill is MANDATORY when ANY of these conditions apply:

1. **Creating new file in:** `/hooks`, `/utils`, `/lib`, `/helpers`
2. **Hook/util about to exceed 50 lines**
3. **Naming pattern:** `use[Noun]` (e.g., `useQuery`, `useForm`, `useAuth`)
4. **Using together:** `useState` + `useEffect` + `useRef` for async operations
5. **Writing:** `AbortController` logic, `localStorage` sync, manual cache keys
6. **Pattern:** Request ID tracking, stale response handling, retry logic

---

## Step 1: Identify the Problem Category

Before writing code, categorize what problem you're solving:

| Category | Symptoms |
|----------|----------|
| **Data fetching** | Loading states, caching, refetch, abort |
| **State management** | Shared state across components, persistence |
| **Forms** | Validation, dirty tracking, field state |
| **Async coordination** | Race conditions, stale responses, retries |
| **Browser APIs** | localStorage, IntersectionObserver, ResizeObserver |
| **UI primitives** | Modals, toasts, tooltips, popovers |

---

## Step 2: Check Library Alternatives

### Frontend (React/JavaScript)

| Category | Standard Library | Bundle Size | Why Use It |
|----------|------------------|-------------|------------|
| **Data fetching** | `@tanstack/react-query` | ~13KB | Auto cache keys, abort, stale handling, devtools |
| **Data fetching (alt)** | `swr` | ~4KB | Lighter, simpler API |
| **State management** | `zustand` | ~3KB | Simple, no boilerplate, persist middleware |
| **State management (alt)** | `jotai` | ~3KB | Atomic state, good for derived state |
| **Forms** | `react-hook-form` | ~9KB | Uncontrolled inputs, great performance |
| **Forms (alt)** | `formik` | ~13KB | Controlled, more features |
| **Validation** | `zod` | ~12KB | TypeScript-first, composable |
| **Validation (alt)** | `yup` | ~15KB | Older, widely used |
| **Date/time** | `date-fns` | ~2KB per fn | Tree-shakeable, immutable |
| **Date/time (alt)** | `dayjs` | ~2KB | Moment-like API, smaller |
| **Tables** | `@tanstack/react-table` | ~15KB | Headless, flexible |
| **Virtualization** | `@tanstack/react-virtual` | ~3KB | Virtual scrolling |
| **Virtualization (alt)** | `react-window` | ~6KB | Simpler API |
| **Animations** | `framer-motion` | ~50KB | Full-featured, gestures |
| **Animations (alt)** | `react-spring` | ~20KB | Physics-based |
| **Drag & drop** | `@dnd-kit` | ~10KB | Accessible, composable |
| **Modals** | `@radix-ui/react-dialog` | ~5KB | Accessible, unstyled |
| **Toasts** | `sonner` | ~5KB | Beautiful defaults |
| **Toasts (alt)** | `react-hot-toast` | ~5KB | Lightweight |
| **Error boundaries** | `react-error-boundary` | ~2KB | Declarative error handling |
| **Intersection** | `react-intersection-observer` | ~2KB | Visibility detection |
| **Debounce** | `use-debounce` | ~1KB | Hook-based debouncing |
| **Local storage** | `use-local-storage-state` | ~1KB | SSR-safe, syncs across tabs |
| **URL state** | `nuqs` | ~3KB | Type-safe query params |

### Backend (Python)

| Category | Standard Library | Why Use It |
|----------|------------------|------------|
| **HTTP client** | `httpx` | Async support, modern API |
| **HTTP client (alt)** | `requests` | Simpler, sync only |
| **Validation** | `pydantic` | Type coercion, serialization |
| **ORM** | `sqlalchemy` | Mature, flexible |
| **Caching** | `cachetools` | In-memory with TTL |
| **Rate limiting** | `slowapi` | FastAPI/Starlette compatible |
| **Retries** | `tenacity` | Configurable backoff |
| **Background jobs** | `celery` | Distributed tasks |
| **Date handling** | `pendulum` | Timezone-aware, human-friendly |

---

## Step 3: Check Existing Dependencies

Before suggesting a new library, check if it's already installed:

```bash
# Check package.json for frontend
grep -E "react-query|@tanstack|zustand|zod" frontend/package.json

# Check requirements.txt for backend
grep -E "pydantic|httpx|tenacity" requirements.txt
```

If library exists but unused, USE IT. Don't add another.

---

## Step 4: Evaluate Build vs Buy

### Use Library When (DEFAULT CHOICE):

- [ ] Problem is common (>3 libraries exist for it)
- [ ] Library has >5K GitHub stars
- [ ] Library updated in last 6 months
- [ ] Library saves >50 lines of code
- [ ] Problem involves edge cases (race conditions, browser compat, a11y)
- [ ] You'd be writing `useState` + `useEffect` + `useRef` together
- [ ] You'd be handling AbortController, retry logic, or cache invalidation

### Build Custom When (REQUIRES JUSTIFICATION):

- [ ] Problem is domain-specific business logic (not infrastructure)
- [ ] No maintained library exists (verified: <1K stars or no update in 1 year)
- [ ] Wrapper is <30 lines around existing library
- [ ] Bundle size is measured AND critical (not assumed)

---

## Step 5: Ask User for Confirmation

Before proceeding, present this to the user:

```markdown
## Library Check: [Problem Category]

**Problem:** [What you're trying to solve]

**Recommendation:** Use [library] instead of custom code

**Tradeoffs:**
| Factor | Library | Custom |
|--------|---------|--------|
| Bundle size | [X]KB | 0KB |
| Lines of code | ~[Y] lines | ~[Z] lines |
| Edge cases | Handled | Must implement |
| Maintenance | Community | Us |
| Onboarding | Documented | Custom docs needed |

**My recommendation:** [Library/Custom] because [reason]

Proceed with [library]?
```

---

## Step 6: Document Decision

### If Using Library

No special documentation needed. Standard usage.

### If Choosing Custom (Justified)

Add this comment to the custom code:

```javascript
/**
 * CUSTOM IMPLEMENTATION
 *
 * Chose custom over [library name] because:
 * - [Specific reason 1]
 * - [Specific reason 2]
 *
 * Revisit if:
 * - [Condition that would change this decision]
 * - Library matures / our needs change
 *
 * Lines of code: [X] | Estimated library equivalent: [Y] lines
 * Decision date: [YYYY-MM-DD]
 */
```

---

## Common Scenarios

### Scenario: "I need to fetch data with loading/error states"

**STOP.** This is React Query.

```jsx
// DON'T write this (30+ lines):
const [data, setData] = useState(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);
useEffect(() => { ... }, [deps]);

// DO write this (5 lines):
import { useQuery } from '@tanstack/react-query';

const { data, isLoading, error } = useQuery({
  queryKey: ['myData', params],
  queryFn: () => fetchMyData(params)
});
```

### Scenario: "I need to cancel requests when filters change"

**STOP.** This is React Query with AbortController.

```jsx
// DON'T write this (AbortController + stale check + cleanup):
const controllerRef = useRef();
const requestIdRef = useRef(0);
useEffect(() => {
  controllerRef.current?.abort();
  controllerRef.current = new AbortController();
  const requestId = ++requestIdRef.current;
  fetch(url, { signal: controllerRef.current.signal })
    .then(res => {
      if (requestId !== requestIdRef.current) return;
      setData(res);
    });
  return () => controllerRef.current?.abort();
}, [deps]);

// DO write this (React Query handles it):
const { data } = useQuery({
  queryKey: ['myData', params],
  queryFn: ({ signal }) => fetch(url, { signal }).then(r => r.json())
});
```

### Scenario: "I need global state that persists to localStorage"

**STOP.** This is Zustand with persist middleware.

```jsx
// DON'T write this (Context + useEffect + localStorage):
const [state, setState] = useState(() => JSON.parse(localStorage.getItem('key')));
useEffect(() => { localStorage.setItem('key', JSON.stringify(state)); }, [state]);

// DO write this (Zustand):
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useStore = create(persist(
  (set) => ({ value: null, setValue: (v) => set({ value: v }) }),
  { name: 'my-storage' }
));
```

### Scenario: "I need to track if an element is visible"

**STOP.** This is `react-intersection-observer`.

```jsx
// DON'T write this (custom IntersectionObserver hook):
const [isVisible, setIsVisible] = useState(false);
const ref = useRef();
useEffect(() => {
  const observer = new IntersectionObserver(([entry]) => {
    setIsVisible(entry.isIntersecting);
  });
  if (ref.current) observer.observe(ref.current);
  return () => observer.disconnect();
}, []);

// DO write this:
import { useInView } from 'react-intersection-observer';
const { ref, inView } = useInView();
```

### Scenario: "I need form validation"

**STOP.** This is React Hook Form + Zod.

```jsx
// DON'T write this (custom validation + state per field):
const [email, setEmail] = useState('');
const [emailError, setEmailError] = useState('');
const validate = () => { if (!email.includes('@')) setEmailError('Invalid'); };

// DO write this:
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({ email: z.string().email() });
const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(schema)
});
```

---

## Red Flags: Stop Immediately If You See

| Red Flag | What It Usually Means |
|----------|----------------------|
| `const [data, setData] = useState(null)` + `useEffect` for fetching | Use React Query |
| `const [loading, setLoading] = useState(false)` | Use React Query |
| `const requestIdRef = useRef(0)` | Use React Query (stale handling) |
| `new AbortController()` in component | Use React Query (auto-aborts) |
| `JSON.stringify(deps)` for cache key | Use React Query (auto cache key) |
| `localStorage.setItem` in `useEffect` | Use Zustand persist |
| `new IntersectionObserver()` in component | Use react-intersection-observer |
| `document.addEventListener('keydown')` | Use use-hotkeys or @mantine/hooks |
| `createContext` + `useReducer` + provider (>100 lines) | Use Zustand |

---

## The History: Why This Skill Exists

On Dec 25, 2025, Claude introduced custom query hooks to fix race conditions. Over 7 days, this grew into 400+ lines:

- `useQuery.js` (~100 lines) - Status machine
- `useAbortableQuery.js` (~100 lines) - AbortController wrapper
- `useGatedAbortableQuery.js` (~100 lines) - Visibility gating
- `useStaleRequestGuard.js` (~100 lines) - Stale response prevention

**React Query replaces ALL of this with 5 lines per chart.**

The `datePreset` cache key bug was caused by manual `generateFilterKey()` — a function that React Query makes unnecessary by auto-generating cache keys from the `queryKey` array.

**This skill exists to prevent repeating that mistake.**

---

## Checklist Before Writing Infrastructure Code

- [ ] Identified problem category (data fetching, state, forms, etc.)
- [ ] Searched for library alternatives
- [ ] Checked if library already in package.json
- [ ] Compared: lines of custom code vs library integration
- [ ] Asked user for preference (library vs custom)
- [ ] If custom: documented justification with revisit conditions
- [ ] If library: verified health (stars, downloads, last update)

**If you skip this checklist, you will waste time. Guaranteed.**
