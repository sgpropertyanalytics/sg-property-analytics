# UI System Architecture

This UI system is organized into four layers to keep the landing page and dashboard consistent, modular, and themeable.

## Layers

1. **Tokens**: Global CSS variables that define color, typography, spacing, radius, shadow, motion, and z-index.
2. **Primitives**: Small, reusable building blocks (Container, Card, Button, Input, Badge, Divider, EmptyState, ErrorState, Skeleton).
3. **Patterns**: Compositions of primitives for common layouts (PageHeader, FilterBar, ChartPanel, DataSection).
4. **Pages**: Final page layouts built from patterns and primitives.

## Token Structure

Tokens live in `frontend/src/styles/tokens.css` and are exposed as CSS variables. Tailwind consumes these via `frontend/tailwind.config.js` so classes remain semantic and themeable.

Key token groups:

- **Colors**: `--color-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-brand`, `--color-accent`, `--color-success`, `--color-danger`, `--color-warning`, chart palette (`--color-chart-*`).
- **Typography**: `--font-display`, `--font-sans`, `--font-mono`.
- **Spacing**: `--space-1` through `--space-24` (4/8-based scale).
- **Radius**: `--radius-*`.
- **Shadow**: `--shadow-*`.
- **Motion**: `--duration-*`, `--ease-*`.
- **Z-index**: `--z-*`.

## Theming

Theme values are defined via CSS variables. The default (light) theme is declared in `:root`. Dark mode values live under `[data-theme="dark"]`.

To switch themes globally:

```js
// Example: toggle theme in app code
const root = document.documentElement;
root.dataset.theme = 'dark';
```

Because components only reference tokens, no component code changes are needed to re-theme.

## Building New UI

### Primitives

Use primitives from `frontend/src/components/primitives`:

```jsx
import { Container, Card, Button } from '../components/primitives';

<Container>
  <Card className="p-6">
    <Button>Primary Action</Button>
  </Card>
</Container>
```

### Patterns

Patterns should compose primitives, never raw hex colors or ad-hoc spacing. Example pattern layout:

```
Pattern (e.g. ChartPanel)
 └─ Card
     ├─ PageHeader
     ├─ Divider
     └─ Chart content
```

### Pages

Pages should only assemble patterns + primitives. Avoid introducing new hardcoded colors or pixel values.

## Adding a New Theme

1. Add a new theme selector in `tokens.css` (e.g. `[data-theme="brand-x"]`).
2. Override the token variables that should change.
3. Toggle `document.documentElement.dataset.theme` to the new theme value.

No component or page changes are required as long as they use tokens.
