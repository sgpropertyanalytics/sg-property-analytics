# Lazy Import Guardrails

**ALWAYS activate before adding `React.lazy()` or dynamic `import()` for code splitting.**

## The Problem

Lazy import syntax must match the target module's export style. Mismatches cause runtime errors that only appear when the lazy component loads - not during build.

### Common Mistake (caused production outage)

```jsx
// WRONG - expects named export but file uses default export
const MyComponent = lazy(() =>
  import('./MyComponent').then(m => ({ default: m.MyComponent }))
);
// Error: m.MyComponent is undefined
```

## Verification Checklist

Before adding ANY lazy import:

### 1. Check the target file's export style

```bash
# Quick check - what does the file export?
grep -E "^export (default|const|function|class)" path/to/Component.jsx
```

### 2. Match import syntax to export style

| Export Style | File Contains | Lazy Import Syntax |
|--------------|---------------|-------------------|
| **Default export** | `export default Component` | `lazy(() => import('./Component'))` |
| **Named export** | `export function Component` | `lazy(() => import('./Component').then(m => ({ default: m.Component })))` |
| **Re-export default** | `export { default } from './Component'` | `lazy(() => import('./Component'))` |

### 3. Test the lazy import

```jsx
// Add console.log to verify the module shape
const MyComponent = lazy(() =>
  import('./MyComponent').then(m => {
    console.log('Module exports:', Object.keys(m));
    return m; // or { default: m.ComponentName } for named
  })
);
```

## Correct Patterns

### Default Export (most common in this codebase)
```jsx
// Component file
export default function DistrictLiquidityMap() { ... }

// Lazy import - SIMPLE, no .then() needed
const DistrictLiquidityMap = lazy(() => import('./DistrictLiquidityMap'));
```

### Named Export
```jsx
// Component file
export function DistrictLiquidityMap() { ... }

// Lazy import - needs .then() to wrap named export
const DistrictLiquidityMap = lazy(() =>
  import('./DistrictLiquidityMap').then(m => ({ default: m.DistrictLiquidityMap }))
);
```

### Index Re-exports
```jsx
// index.js
export { DistrictLiquidityMap } from './DistrictLiquidityMap';

// Lazy import - named export from index
const DistrictLiquidityMap = lazy(() =>
  import('./components').then(m => ({ default: m.DistrictLiquidityMap }))
);
```

## Pre-Commit Validation

Before committing lazy imports, verify:

- [ ] Checked target file's export style (`export default` vs `export function`)
- [ ] Import syntax matches export style
- [ ] Tested that component loads correctly in browser
- [ ] Suspense fallback is provided

## Common Files in This Codebase

| File | Export Style | Correct Lazy Syntax |
|------|--------------|---------------------|
| `components/insights/DistrictLiquidityMap.jsx` | Default | `lazy(() => import(...))` |
| `components/insights/MarketStrategyMap.jsx` | Default | `lazy(() => import(...))` |
| `pages/*.jsx` | Named (`export function XContent`) | `.then(m => ({ default: m.XContent }))` |

## Why This Matters

- **Build passes, runtime fails**: Vite/Webpack can't validate dynamic imports at build time
- **Error propagates**: One failed lazy import can crash the entire page/app
- **Hard to debug**: Error message doesn't clearly indicate export mismatch
