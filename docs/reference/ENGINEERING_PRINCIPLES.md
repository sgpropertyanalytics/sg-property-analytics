# Engineering Principles

Design philosophy for this codebase. Apply these when making architectural decisions.

> **Note:** This content was extracted from CLAUDE.md Section 7 to keep the main file lean.

---

## Component Design

1. **One Chart = One Question** — Multiple questions → split or add toggle
2. **Pure Chart + Container** — Chart renders props, Container wires data
3. **UI Components Don't Fetch** — Hooks fetch, components render
4. **Write for Deletion** — Removing feature folder deletes feature cleanly
5. **DRY at 3 Uses** — 1: local, 2: consider, 3: extract
6. **Composition > Abstraction** — Small parts, not mega-components
7. **No Import-Time Side Effects** — No fetch/DB/I/O at module top-level
8. **Never Leak Premium Data** — Backend masks for free users
9. **Simplest Rule Wins** — Business intent over technical correctness

---

## API & Code Design

1. **Don't ship what nobody uses**
   - Bad: "It might be useful someday" → Add it
   - Good: "Is it used today?" → No → Don't add it
   - Dead code/fields become maintenance burden. Remove aggressively.

2. **Single source of truth**
   - Bad: Subscription info in `/aggregate` AND `/auth/subscription`
   - Good: Subscription info ONLY in `/auth/subscription`
   - Duplicated data drifts. One place for each piece of information.

3. **One job per component**
   - Bad: Serializer transforms data AND injects meta AND validates
   - Good: Serializer transforms data. Decorator handles meta. Validator validates.
   - When something breaks, you know exactly where to look.

4. **Make invalid states impossible**
   - Bad: Schema and serializer can disagree → Runtime errors
   - Good: Schema generates serializer → Can't disagree
   - Design so mistakes can't happen, not just "shouldn't" happen.

5. **Fail fast, fail loud**
   - Bad: Log warning, continue anyway → Problems hide
   - Good: Throw error immediately → Problems surface
   - The earlier you catch issues, the easier they are to fix.

6. **Explicit over implicit**
   - Bad: Fields magically appear from somewhere
   - Good: Every field traced to a declaration
   - Future you (or teammates) should understand code without archaeology.

7. **Boring is good**
   - Bad: Clever one-liner nobody understands
   - Good: Obvious 5 lines everyone understands
   - Code is read 10x more than written. Optimize for reading.

8. **Consistent patterns everywhere**
   - Bad: Endpoint A returns `{ data, meta }`, B returns `{ results, info }`, C returns `{ payload }`
   - Good: ALL endpoints return `{ data, meta }`
   - Learn once, apply everywhere. No surprises.

9. **Delete before you add**
   - Bad: Add new field, keep old field "for compatibility"
   - Good: Remove old field, add new field
   - Every line of code is a liability. Less code = less bugs.

10. **Test the contract, not the implementation**
    - Bad: Test that function calls X, Y, Z internally
    - Good: Test that input A produces output B
    - Implementation can change. Contract shouldn't.

11. **Make dependencies obvious**
    - Bad: Function secretly reads global state
    - Good: Function takes all inputs as parameters
    - If it's not in the function signature, it shouldn't affect the output.

12. **Optimize for change**
    - Bad: Hardcode values everywhere
    - Good: Single config file, referenced everywhere
    - Requirements change. Make changing easy.

13. **YAGNI: Don't optimize until you have a measured problem**
    - Bad: Add caching "because it might be slow" → Complex code, no benefit
    - Good: Measure first, optimize only if needed → Simple code until proven otherwise
    - Premature optimization adds complexity without evidence of value. The useDeferredFetch bug (Jan 2026) was caused by optimization for "cascade load reduction" that disabled queries mid-flight.

14. **Push complexity to the edges**
    - Bad: Add middleware layer to transform/normalize data between frontend and backend
    - Good: Backend provides aliases/computed fields, frontend consumes directly
    - Middleware layers add indirection and hiding places for bugs. Keep the pipe clean.

---

## Param & Data Flow Integrity

> **Origin:** Jan 2026 - `timeframe=M6` was sent by frontend, converted to `period` by adapter, backend used `period` to compute dates, but cache key read `params.timeframe` which was never set → defaulted to Y1. The param flowed correctly through transformations but a downstream reader used the wrong name.

These principles prevent "param identity drift" bugs where data enters the system under one name, gets transformed, and downstream consumers read the wrong name/value.

### Parse, Don't Transform in Transit

```
❌ Bad:  Input → Transform → Transform → Transform → Use
✅ Good: Input → Parse once → Use everywhere
```

Every transformation is a chance for mismatch. Parse to final form immediately.

```python
# BAD: Transform at each layer
def adapter(params):
    params['period'] = params.get('timeframe')  # Transform 1
def normalize(params):
    params['date_range'] = resolve_period(params['period'])  # Transform 2
def service(params):
    dates = params.get('date_range') or default_dates()  # Transform 3 (implicit)

# GOOD: Parse once at entry
def parse_time_filter(raw_timeframe):
    """Single place that converts 'M6' → { start: date, end: date }"""
    return { 'start': computed_start, 'end': computed_end }
# Everything downstream uses start/end directly
```

### Canonicalize at the Edges

```
❌ Bad:  Transform data as it flows through the system
✅ Good: Convert to final form immediately at API entry
```

```
API boundary: timeframe='M6' → { startDate: '2025-01-01', endDate: '2025-06-30' }
                                        ↓
                Everything after this uses startDate/endDate only
```

The API boundary is the ONE place where `timeframe` → dates conversion happens. After that point, `timeframe` doesn't exist.

### Pass Specific Values, Not Intents

```
❌ Intent:   "M6" (what does this mean? 180 days? 6 calendar months? from when?)
✅ Specific: "2025-01-01 to 2025-06-30" (unambiguous)
```

Convert fuzzy human intent to precise machine values as early as possible. Don't pass "M6" through 5 layers hoping each interprets it the same way.

```python
# BAD: Pass intent, let each layer interpret
cache_key = f"data:{timeframe}"  # What does M6 mean here?
query_dates = resolve_timeframe(timeframe)  # And here?

# GOOD: Resolve once, pass resolved values
resolved = resolve_timeframe(timeframe)  # { start: date, end: date }
cache_key = f"data:{resolved['start']}:{resolved['end']}"
query_dates = resolved
```

### One Name Per Concept

```
❌ Bad:  timeframe, period, dateRange (all mean the same thing)
✅ Good: period (everywhere, or resolved to start_date/end_date)
```

Multiple names for the same concept = multiple bugs waiting to happen.

**The Test:** Can you grep for a concept and find ALL usages? If you need to grep for 3 different names, you have 3x the bug surface.

```bash
# BAD: Need to search multiple names
grep -rn "timeframe\|period\|dateRange" backend/

# GOOD: One canonical name
grep -rn "date_from.*date_to" backend/
```

### Immutable After Normalization

```
❌ Bad:  params object gets modified by different layers
✅ Good: params object frozen after initial parsing
```

```python
# BAD: Mutable params object
def layer1(params):
    params['period'] = params.get('timeframe')  # Mutates

def layer2(params):
    # Did layer1 run? Is 'period' set? Who knows!
    period = params.get('period')  # Might be None

def layer3(params):
    # Now params has been modified by layer1 and layer2
    # Good luck debugging which layer set what

# GOOD: Immutable after parse
@dataclass(frozen=True)
class NormalizedParams:
    start_date: date
    end_date: date
    districts: tuple[str, ...]

def parse_params(raw: dict) -> NormalizedParams:
    """Single parse point. After this, params are frozen."""
    return NormalizedParams(
        start_date=resolve_start(raw),
        end_date=resolve_end(raw),
        districts=tuple(raw.get('districts', []))
    )
# All downstream code receives NormalizedParams, can't modify it
```

### Param Flow Integrity Checklist

Before merging param-related changes:

- [ ] Param is parsed to final form at entry point (not transformed in transit)
- [ ] All downstream code uses the SAME name for the concept
- [ ] Cache keys use the SAME resolved values as queries
- [ ] No layer modifies params after initial normalization
- [ ] Grep for param name returns ALL usages (no aliases)

---

## Anti-Over-Engineering Principle

> **Origin:** On Jan 4, 2026, we discovered the filter-to-API flow had grown to 7 layers when 3 would suffice. This caused the useDeferredFetch bug and made debugging require tracing through 5 files. See [REPO_MAP.md Historical Incidents](./REPO_MAP.md#9-historical-incidents-landmines).

### The 5 Questions (Before Adding ANY Abstraction)

Before creating a new file, function, hook, or layer, answer these:

| Question | If NO → |
|----------|---------|
| **1. Is there a bug RIGHT NOW?** (not hypothetical) | Don't add the layer |
| **2. Does the library already handle this?** | Use the library feature |
| **3. Can I delete this layer and still work?** | Delete it |
| **4. Would a new developer understand this in 5 minutes?** | Too complex, simplify |
| **5. Am I adding a layer to rename 3 fields?** | Fix naming at source instead |

### Claude's Over-Engineering Triggers (Self-Awareness)

Claude tends to over-engineer when:

| Trigger | What Claude Does | What Claude Should Do |
|---------|------------------|----------------------|
| Sees "filter state" | Applies enterprise Redux patterns | Use Zustand directly |
| Sees duplicate code | Extracts helper immediately | Wait until 3rd occurrence |
| Sees library | Wraps it "in case we swap later" | Use library directly |
| Sees edge case | Builds abstraction to handle it | Handle inline if rare |
| Hears "might need later" | Builds for hypothetical | Solve today's problem only |

### The Diagram Test

> **Rule:** If explaining the data flow requires a diagram, it's probably too complex.

```
# TOO COMPLEX (7 layers)
User → Zustand → getActiveFilters → getFilterKey → debounce → useAppQuery → buildApiParams → adapter → Backend

# CORRECT (3 layers)
User → Zustand → useQuery → Backend
```

### Simplicity Checklist (Before PR)

- [ ] Can explain the data flow in ONE sentence
- [ ] No helper function used only once
- [ ] No abstraction for <3 occurrences
- [ ] No layer that just renames fields
- [ ] No debounce on single-click actions (dropdowns, buttons)
- [ ] Using library features directly (not wrapped)
