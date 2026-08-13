# Layout Rules — CP Build Command Center

> **For AI agents:** Read this file before writing any layout, padding, gap, or spacing values.
> Never use arbitrary pixel values. Always use the CSS tokens defined below.
> When the user approves changes via DevTools → Spacing → Approve, update this file
> and `app/globals.css` to match.

---

## Token Reference

All tokens live in `:root` in `app/globals.css` with responsive overrides at `≥768px` (tablet) and `≥1024px` (desktop).

### Page Layout

| Token | Mobile | Tablet | Desktop | Usage |
|---|---|---|---|---|
| `--page-padding-x` | 16px | 24px | 32px | Horizontal safe zone — left/right on every page |
| `--page-padding-y` | 16px | 24px | 32px | Top/bottom breathing room on every page |
| `--section-gap` | 24px | 32px | 40px | Space between major sections on a page |
| `--content-max-w` | 1280px | 1280px | 1280px | Maximum content width |

### Components

| Token | Mobile | Tablet | Desktop | Usage |
|---|---|---|---|---|
| `--component-gap` | 12px | 16px | 20px | Space between sibling components within a section |
| `--card-padding` | 16px | 20px | 24px | Internal padding inside content cards / panels |
| `--inline-gap` | 8px | 8px | 8px | Gap between icon + label, badge + text |

### Interactive Elements

| Token | Mobile | Tablet | Desktop | Usage |
|---|---|---|---|---|
| `--min-touch` | 44px | 40px | 40px | Minimum tappable area (iOS HIG / WCAG 2.5.8) |
| `--button-height` | 44px | 40px | 40px | Standard button height |
| `--input-height` | 44px | 40px | 40px | Form input height |

### Structure

| Token | Mobile | Tablet | Desktop | Usage |
|---|---|---|---|---|
| `--nav-width` | 240px | 240px | 240px | Main sidebar navigation width |
| `--top-bar-height` | 56px | 56px | 56px | Height of TopBar, ProjectTopBar, and sidebar brand header — **all must use this token so horizontal dividers align at the nav/content seam** |
| `--radius-sm` | 6px | 6px | 6px | Buttons, inputs, small elements |
| `--radius-md` | 8px | 8px | 8px | Cards, panels |

---

## Platform Standards

### iOS HIG (iPhone & iPad)
- Minimum touch target: **44×44pt**
- iPhone content margins: **16pt** left/right (safe area + margin)
- iPad content margins: **20pt** (regular width), **16pt** (compact)
- Navigation bar height: **44pt** (compact), **56pt** (large title)
- Tab/toolbar height: **49pt**
- Home indicator safe area: **34pt** bottom
- Status bar safe area: **~47pt** top
- List row minimum height: **44pt**
- Section spacing: **≥20pt** between grouped content

### Material Design 3 (Android)
- Minimum touch target: **48×48dp** (with ≥8dp gap between adjacent targets)
- Phone content margins: **16dp** left/right
- Tablet content margins: **24dp** left/right
- Navigation bar height: **80dp**
- Navigation rail width: **80dp**
- List item height: **56dp** minimum
- Section spacing: **≥24dp**
- Card padding: **16dp**

### Web / Desktop
- Minimum click target: **44×44px** (WCAG 2.5.8 AA)
- Page padding: **32px** left/right at ≥1024px
- Content max width: **1280px**
- Section gap: **40px**
- Card padding: **24px**

---

## Enforcement Rules

These rules are enforced as design constraints. Never ship code that violates an Active rule.

| # | Rule | Category | Constraint | Status |
|---|---|---|---|---|
| R1 | Page Safe Padding | Padding | Every page must have at least `--page-padding-x` horizontal padding | Active |
| R2 | Minimum Touch Target | Interactive | All interactive elements must meet `--min-touch` on every breakpoint | Active |
| R3 | Card Internal Padding | Padding | Content inside cards must use `--card-padding` on all sides — never flush | Active |
| R4 | Section Breathing Room | Spacing | Adjacent page sections must be separated by at least `--section-gap` | Active |
| R5 | Inline Element Gap | Spacing | Icon-label pairs use `--inline-gap` — never flush, never larger than `--component-gap` | Active |
| R6 | Content Max Width | Layout | No prose or table content exceeds `--content-max-w` | Active |
| R7 | No Arbitrary Values | Tokens | Never use raw pixel values for spacing — always use a CSS token | Active |
| R8 | Button Height Consistency | Interactive | All buttons must use `--button-height` — no ad-hoc heights | Active |
| R9 | Top/Context Bar Padding | Padding | All top bars and context bars (TopBar, ProjectTopBar) must use `--page-padding-x` for left/right padding — never `--space-N` or hardcoded values | Active |
| R10 | Top Bar Height Alignment | Layout | TopBar, ProjectTopBar, and the sidebar brand header must all use `--top-bar-height` for their height — never hardcoded px values — so horizontal divider lines align at the nav/content seam | Active |

---

## Change Log

<!-- DevTools → Spacing → Approve generates entries here -->

| Date | Token | Breakpoint | Old | New | Reason |
|---|---|---|---|---|---|
| 2026-02-25 | (initial) | all | — | see above | Baseline established |
| 2026-03-02 | `aside height` | all | `100vh` | `100%` | Sidebar used real browser height; must use `100%` to fill the simulated viewport container |
| 2026-03-02 | Viewport sim body | all | `align-items: center; overflow: hidden` | `align-items: flex-start; overflow-y: auto; padding: 32px 0 48px` | Tall devices (iPad Mini 1133px) were clipped top and bottom; now anchors at top and body scrolls |
| 2026-03-03 | `ProjectTopBar` padding | all | `paddingLeft: var(--space-5)` (undefined → 0px) | `paddingLeft: var(--page-padding-x)` | Project name was flush-left on mobile; `--space-5` is not a defined token. New rule R9 added: all top/context bars must use `--page-padding-x`. |
| 2026-03-03 | `--top-bar-height` | all | sidebar header `64px`, TopBar `56px`, ProjectTopBar `52px` (all hardcoded, all different) | `56px` via `--top-bar-height` token | Horizontal divider between sidebar and TopBar did not align. New token `--top-bar-height: 56px` introduced. Rule R10 added: all top bars and sidebar brand headers must use this token. |
