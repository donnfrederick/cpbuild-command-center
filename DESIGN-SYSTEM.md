# CP Build Field Tracker — Design System v2.0

**Source of truth:** `fieldtracker-design-system.md` + `fieldtracker-design-system-reference.html` (provided by Hannah)
**Last synced:** 2026-05-20
**Status:** In progress — being applied component by component. Update this file whenever a component's styles diverge from it.
**Philosophy:** Field-first clarity. Data is the design. Status is sacred. No strokes — ever.

---

## Design Principles

1. **Field-first clarity** — Every decision is made for a phone screen in sunlight. If it can't be scanned in 2 seconds, it fails.
2. **Color earns its place** — Orange and blue show up at full strength only where they need to command attention. The base stays quiet so the color means something.
3. **Data is the design** — Density is a feature, not a problem. Layouts make large amounts of information feel organized, not overwhelming.
4. **Status is sacred** — The status system is the core of this product. Status colors are reserved strictly for their purpose and never repurposed for decoration or brand expression.
5. **No strokes — ever** — Separation is achieved through shadow, spacing, and background contrast only. No border lines on cards, panels, tiles, or inputs. (Exception: sidebar dividers use a 1px `#EDEEF2` line — these are structural separators, not card borders.)
6. **Green means good, always** — Progress bars are ALWAYS `#22C064`. Complete, verified, and passed states are always green. Amber is strictly warning/alert. Orange is strictly brand. These never cross.
7. **Icons carry meaning** — Clipboard = install state. Shield = inspection state. Color alone is never sufficient.
8. **No button glow — ever** — Buttons, CTAs, active nav pills, and icon buttons never use decorative glow or colored box-shadow. Active state is shown with fill, text/icon color, and shape only. Focus rings remain for keyboard accessibility.

---

## In-App Design System Library

The floating design system viewer has two tabs only:

1. **Tokens** — the foundation source of truth. Every live `:root` variable from `globals.css` appears once, grouped by purpose. Do not duplicate color/type tokens in separate top-level tabs.
2. **Components** — the reusable component/pattern library. Every listed component must include a visual preview, file path, intended use, and primary tokens.

This keeps foundations and reusable UI separate: tokens explain what values exist; components show what designers and engineers should actually reuse.

Component previews should be named and specific, not generic category placeholders.
For example, `SideNav`, `ProjectSideNav`, `MobileBottomNav`, and `ProjectTopBar`
must each have their own visual representation because they behave and look
different in the app.

---

## Color System

### Primitives

```css
/* Orange — Brand Primary */
--orange-50:  #FFF4ED;
--orange-100: #FFE4CC;
--orange-400: #FF7A2F;
--orange-500: #F55F00;   /* Primary brand orange */
--orange-600: #CC4D00;
--orange-700: #993A00;

/* Blue — Secondary / Interactive accent */
--blue-50:  #EBF2FF;
--blue-100: #C7DCFF;
--blue-400: #2575FF;
--blue-500: #0057F5;     /* Primary brand blue */
--blue-600: #0044CC;
--blue-700: #003399;

/* Neutral — Near-black ink (#10122B) base */
--neutral-0:   #FFFFFF;
--neutral-50:  #F7F8FA;   /* App canvas background */
--neutral-100: #F0F1F5;   /* Inset areas, inputs, hover bg */
--neutral-200: #EDEEF2;   /* Structural dividers */
--neutral-300: #DDDFE6;
--neutral-400: #C4C7D4;   /* Nav section labels, disabled text */
--neutral-500: #9CA0B3;   /* Tertiary text, logo sub-label */
--neutral-600: #737891;   /* Inactive nav items, secondary text */
--neutral-700: #4D5266;   /* Body text, UI labels */
--neutral-800: #363A4D;
--neutral-900: #10122B;   /* Near-black — primary text, dark headers */

/* Green — Status only (never brand) */
--green-50:   #EDFAF3;
--green-100:  #BBF7D0;
--green-400:  #22C064;   /* Progress bars — ALWAYS this value */
--green-500:  #16A34A;
--green-600:  #15803D;
--green-700:  #14532D;

/* Amber — Warning/alert only (never brand, never complete states) */
--amber-50:  #FFFBEB;
--amber-100: #FEF3C7;
--amber-500: #F59E0B;
--amber-700: #92400E;

/* Red — Failure/issue only */
--red-50:  #FEF2F2;
--red-100: #FEE2E2;
--red-500: #EF4444;
--red-600: #DC2626;
--red-700: #991B1B;
```

### Semantic Tokens

```css
/* Backgrounds */
--color-bg:             #F7F8FA;   /* App background (canvas) */
--color-surface:        #FFFFFF;   /* Cards, panels, modals */
--color-surface-sunken: #F0F1F5;   /* Inset areas, inputs */
--color-surface-dark:   #10122B;   /* Dark headers, level banners */

/* Text */
--color-text-primary:   #10122B;
--color-text-secondary: #737891;   /* Inactive nav, helper text */
--color-text-tertiary:  #9CA0B3;   /* Logo sub, timestamps */
--color-text-disabled:  #C4C7D4;   /* Section labels, disabled */
--color-text-inverse:   #FFFFFF;

/* Brand */
--color-accent:           #F55F00;   /* Active nav, primary buttons */
--color-accent-hover:     #CC4D00;
--color-accent-subtle:    #FFF4ED;   /* Active nav background */
--color-secondary:        #0057F5;   /* Avatar, secondary buttons, links */
--color-secondary-hover:  #0044CC;
--color-secondary-subtle: #EBF2FF;
```

---

## Status System

### Rules (non-negotiable)

- **Progress bars are always `#22C064`.** Never orange, never amber.
- **Complete/verified/passed = always green.** Amber = warning only. Orange = brand only.
- **Red = failure/issue only.**
- **Icon distinguishes within green:** Clipboard = install. Shield = inspection.

### Status Tokens

```css
--status-staging-bg:   #E8E9EF;  --status-staging-fg:   #4D5266;
--status-assembly-bg:  #C7DCFF;  --status-assembly-fg:  #003399;
--status-progress-bg:  #FEF3C7;  --status-progress-fg:  #92400E;
--status-sub-bg:       #BBF7D0;  --status-sub-fg:       #14532D;
--status-verified-bg:  #16A34A;  --status-verified-fg:  #FFFFFF;
--status-passed-bg:    #15803D;  --status-passed-fg:    #FFFFFF;
--status-failed-bg:    #DC2626;  --status-failed-fg:    #FFFFFF;
--status-issue-bg:     #FECACA;  --status-issue-fg:     #991B1B;
```

---

## Typography

**Fonts:** DM Sans (body/UI) + DM Mono (numbers/data), loaded via `next/font/google` in `app/layout.tsx`.

- `--font-dm-sans` — UI text, navigation, labels, buttons
- `--font-dm-mono` — Big stat numbers, data displays

### Type Scale

| Role | Size | Weight | Color | Notes |
|------|------|--------|-------|-------|
| Display / page title | 32px | 900 | `#10122B` | letter-spacing: -0.03em |
| Heading | 20px | 800 | `#10122B` | |
| Subheading | 16px | 700 | `#10122B` | |
| Body | 14px | 400–500 | `#10122B` | Default UI text |
| Nav item | 13px | 700 always | `#737891` / `#F55F00` | letter-spacing 0.04em; color carries active/inactive distinction |
| Caption / meta | 12px | 500–700 | `#9CA0B3` | |
| Section label | 10px | 700 | `#C4C7D4` | ALL CAPS, letter-spacing: 0.10em |
| Logo sub-label | 9px | 700 | `#9CA0B3` | ALL CAPS, letter-spacing: 0.08em |
| Big stat (DM Mono) | 30–52px | 900 | `#10122B` | letter-spacing: -0.03em to -0.04em |
| Micro label | 10px | 700–800 | varies | ALL CAPS, letter-spacing: 0.08–0.10em |

### Font Weight Rules
- 400: body text, table cells
- 500: nav items (inactive), labels, body medium
- 600: semibold emphasis
- 700: active nav, headings, buttons, section labels
- 800: logo name, card titles, stat labels
- 900: page titles, big stats (DM Mono)

---

## Spacing

Base unit: 4px (half-step from 8px grid for fine-grained control).

| Token | Value |
|-------|-------|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |
| `--space-6` | 24px |
| `--space-8` | 32px |
| `--space-12` | 48px |
| `--space-16` | 64px |

---

## Corner Radius

| Token | Value | Use |
|-------|-------|-----|
| `--radius-sm` | 6px | Badges, chips, small buttons |
| `--radius-md` | 8px | Inputs, secondary buttons |
| `--radius-lg` | 10px | Cards, panels |
| `--radius-xl` | 12px | Scope tiles, unit cards |
| `--radius-2xl` | 14px | Large cards |
| `--radius-3xl` | 16px | Panels, drawers |
| `--radius-full` | 9999px | Pills, avatars |

---

## Shadows / Elevation

No borders on cards/panels — shadows only.

| Token | Value | Use |
|-------|-------|-----|
| `--shadow-xs` | `0 1px 3px rgba(16,18,43,0.05)` | Minimal lift |
| `--shadow-sm` | `0 2px 8px rgba(16,18,43,0.07)` | Cards, unit cards |
| `--shadow-md` | `0 4px 16px rgba(16,18,43,0.09)` | Dropdowns, popovers |
| `--shadow-lg` | `0 8px 32px rgba(16,18,43,0.10)` | Modals |
| `--shadow-xl` | `0 16px 48px rgba(16,18,43,0.13)` | Panels, drawers |
| `--focus-ring` | `0 0 0 2px #E85500` | Focus rings — all inputs, buttons, search bars |

---

## Component Dimensions

```css
--button-height:  40px;   /* Minimum touch target */
--input-height:   40px;   /* All inputs and selects */
--nav-width:      240px;  /* Left sidebar */
--top-bar-height: 56px;   /* Shared top bar + sidebar header height */
--icon-size:      20px;   /* Standard Lucide icon size */
```

---

## Component Specs

### Sidebar Navigation

```
Container:
  width: 240px
  background: #FFFFFF
  border-right: 1px solid #EDEEF2   ← structural, NOT a card border
  height: 100vh

Logo area (header):
  height: var(--top-bar-height) = 56px
  border-bottom: 1px solid #EDEEF2
  "CP BUILD"      → 9px, weight 700, color #9CA0B3, ALL CAPS, letter-spacing 0.08em
  "Field Tracker" → 15px, weight 800, color #10122B

Section labels (MAIN, SYSTEM, LOGS):
  font-size: 10px, weight 700, color #C4C7D4
  text-transform: uppercase, letter-spacing: 0.10em
  padding: 6px 16px 4px

Nav items:
  padding: 8px 16px
  font-size: 13px
  border-radius: 0
  icon: 20px × 20px

  Default:  color #737891, font-weight 700, letter-spacing 0.04em, background transparent
  Hover:    background #F0F1F5
  Active:   color #F55F00, font-weight 700, letter-spacing 0.04em, background #FFF4ED
            + box-shadow: inset -3px 0 0 #F55F00  ← right-border indicator
  Note: weight is always 700 — color alone distinguishes active vs inactive

Dividers between sections: 1px, color #EDEEF2, margin 8px 0

User area (bottom):
  border-top: 1px solid #EDEEF2
  Avatar: 30px circle, background #0057F5, color #fff, font-size 11px, weight 800
  Name: 14px, weight 700, color #10122B
  Role: 12px, color #9CA0B3

Project sidebar "Back to Projects" link:
  font-size: 13px, font-weight 700, color #0057F5
  arrow icon: 14px
```

### Mobile Nav — Global (White Pill)

```
Outer wrapper:
  background: #F7F8FA
  padding: 8px 16px calc(16px + safe-area-inset-bottom)

Inner pill:
  background: #FFFFFF
  border-radius: 99px
  padding: 8px 4px
  box-shadow: 0 8px 32px rgba(16,18,43,0.14)

Items (flex: 1 each):
  padding: 6px 12px
  icon: 20px × 20px
  label: 9px, weight 700, letter-spacing 0.04em

  Active:   color #F55F00 + 5px orange dot above icon (absolute, centered)
  Inactive: color #C4C7D4
```

### Mobile Nav — Inside Project (Dark Pill)

```
Outer wrapper:
  background: #F7F8FA
  padding: 8px 16px calc(16px + safe-area-inset-bottom)

Inner pill:
  background: #10122B   ← MUST match ProjectTopBar
  border-radius: 99px
  padding: 6px 4px
  box-shadow: 0 8px 32px rgba(16,18,43,0.22)

Items (flex: 1 each):
  padding: 7px 14px
  border-radius: 99px  ← matches outer pill so rounding is even all the way around
  icon: 20px × 20px
  label: 9px, weight 700, letter-spacing 0.04em

  Active:   background #F55F00, box-shadow none
            icon + label: #FFFFFF
  Inactive: icon + label: rgba(255,255,255,0.35)

  Rule: The inner pill background (#10122B) MUST always match the ProjectTopBar background (#10122B).
        Both surfaces use the same dark navy so the top and bottom chrome feel unified.
        The outer nav wrapper keeps #F7F8FA (page background) — only the pill matches the header.
        NEVER use different values for these two surfaces. If either changes, update both.
```

### Nav Icon Assignments (Lucide)

| Item | Icon | Component |
|------|------|-----------|
| Projects | `LayoutGrid` | SideNav |
| Activity | `Activity` | SideNav |
| Form Builder | `ClipboardList` | SideNav |
| Users | `Users` | SideNav |
| Feedback | `MessageSquare` | SideNav |
| Prod. Status | `Activity` | SideNav |
| API Keys | `Key` | SideNav |
| Overview (project) | `House` | ProjectSideNav / ProjectMobileBottomNav |
| Locations | `MapPin` | ProjectSideNav |
| Location Builder | `Wrench` | ProjectSideNav |
| Reports | `FileText` | ProjectMobileBottomNav only |
| Observations | `Eye` | ProjectSideNav |
| Issues | `AlertTriangle` | ProjectSideNav |
| Inspections | `ShieldCheck` / custom inspection badge | ProjectSideNav / Reports Hub |
| Activity | `Activity` | ProjectSideNav / Reports Hub |

### Search Bars & Toolbar Buttons

```
Search bar (pill)
  background:    #F0F1F5
  border:        none
  border-radius: 99px  (full pill)
  height:        40px (mobile) / 36–44px (varies)
  padding:       0 12px 0 36px  (leaves room for search icon)
  font-size:     13–16px
  color:         var(--neutral-900)
  outline:       none
  focus ring:    var(--focus-ring) → 0 0 0 2px #E85500  (orange, slightly darker than brand)

  Rule: NEVER add a border. The pill background provides visual affordance.
  Rule: Focus ring must ALWAYS be orange via --focus-ring.
  Rule: If the search input sits inside a wrapper div, attach onFocus/onBlur to
        the WRAPPER and add class="no-focus-ring" to the inner <input>.

Filter / toolbar icon buttons
  shared component: components/shared/ToolbarActionButton.tsx
  default (inactive):     var(--control-bg),     color var(--control-icon)
  default (active):       var(--control-active-bg), color var(--control-active-fg)
  Use default on white/light toolbars — filter must match sibling toolbar-action buttons.
  filter variant (page canvas only): var(--control-filter-bg) — gray page background, no white toolbar strip
  filter variant (active): var(--control-filter-active-bg), color var(--control-filter-active-fg)
  border:        none — never add a stroke on filter triggers
  border-radius: 14px
  height/width:  var(--control-filter-size) icon-only filter variant (40px); 36px default icon-only
  Usage:         default in toolbars; variant="filter" only when the trigger sits directly on the page canvas
  Rule: do not recreate this button pattern inline in feature components.
```

### Buttons

```
Primary:    background #F55F00, color #fff
Secondary:  background #0057F5, color #fff
Ghost:      background #F0F1F5, color #737891
Destructive: background #DC2626, color #fff
Resolve:    background #22C064, color #fff

All: height 44px, padding 0 20px, border-radius 10px, font-size 13px, font-weight 700, border: none, box-shadow: none
```

Primary create CTAs use the literal capitalized text pattern:
`+ New Project`, `+ New Form`, `+ New User`.

```
height:        40px
padding:       0 16px
border-radius: var(--radius-md)
background:    var(--color-accent)
color:         var(--color-text-inverse)
font-size:     13px
font-weight:   700
letter-spacing: var(--tracking-ui)
box-shadow:    none
```

### Search & Filter Controls

```
Core rule:
  Search bars and filter buttons never use decorative borders. Use the correct
  surface variant for contrast against the parent background.

Variants:
  surface:
    Use inside white cards, drawers, and panels.
    bg: var(--control-bg)
    shadow: none

  canvas:
    Use directly on app/page canvas backgrounds like #F7F8FA / gray screens.
    bg:     var(--control-canvas-bg)
    shadow: var(--control-canvas-shadow)
    This is required when the sunken fill would blend into the page background.

  dark:
    Use on navy headers/bars.
    bg:          var(--control-dark-bg)
    text/icon:   var(--control-dark-fg) / var(--control-dark-icon)
    placeholder: var(--control-dark-placeholder)

Active filter state:
  bg:   var(--control-active-bg)
  text: var(--control-active-fg)

Toolbar filter trigger (page canvas — icon-only):
  component: ToolbarActionButton variant="filter"
  bg:        var(--control-filter-bg)      /* neutral-400 — darker filled pill, no stroke */
  text:      var(--control-filter-fg)
  size:      var(--control-filter-size)    /* 40px touch target */
  active bg: var(--control-filter-active-bg)
  active fg: var(--control-filter-active-fg)
```

### Filter Panels (shared sheet)

All filter sheets/drawers use `components/shared/filterPanel.tsx` and the
`.filter-panel-*` classes in `app/globals.css`. Do not recreate one-off
backdrop/sheet markup in feature pages.

```
Shell:
  FilterPanelShell — mobile bottom sheet, desktop right drawer (≥640px)
  backdrop: var(--overlay-bg)
  z-index: 300 (use filter-panel-backdrop--elevated when stacking above other overlays)

Header:
  title + optional subtitle + close (X)
  optional FilterPanelSummary bar for live counts (e.g. locations/scopes)

Sections:
  FilterPanelSection — uppercase section label
  FilterChip / FilterPill — toggle options; active uses --control-active-bg/fg
  FilterAccordionCard — expandable groups with preview chips
  filterPanelInputClass / filterPanelSelectClass — date and select fields

Footer:
  FilterPanelFooterActions — Clear all (secondary) + Done/Apply (accent)
  Apply button: var(--color-accent) + var(--color-text-inverse)

Used on:
  Locations (UnitsPageClient), Issues, Observations, Inspection Reports,
  Project Activity, Dashboard Activity, Projects list (ProjectsTable)
```

### Cards

```
background: #FFFFFF
border-radius: 12–14px   (no border — shadow only)
box-shadow: var(--shadow-sm)
padding: 14–18px
```

### Reports Hub Cards

```
Purpose:
  The project reports hub replaces the old Logs list. It is a compact grid of
  destination cards for Issues, Observations, Inspections, and Activity.

Naming:
  User-facing copy is "Reports" / "Back to Reports". The route may remain
  /log for compatibility, but the product surface should not say "Logs".

Grid:
  mobile: 2 columns
  desktop/tablet: 4 columns when width allows
  gap: var(--space-3)

Card surface:
  background: var(--report-card-bg)
  text:       var(--report-card-fg)
  meta:       var(--report-card-meta)
  radius:     var(--report-card-radius)
  shadow:     var(--report-card-shadow)
  border:     none

Icons:
  Each card uses a soft icon tile with semantic color tokens:
    Issues:       var(--report-card-issues-bg/fg)
    Observations: var(--report-card-observations-bg/fg)
    Inspections:  var(--report-card-inspections-bg/fg), custom inspection badge
    Activity:     var(--report-card-activity-bg/fg)
  Clipboard remains install-state only; inspection destinations use the shield/badge.

Badges:
  Open issue count uses red status tokens and a compact pill. It should not
  create a card border or decorative stroke.
```

### Inspection Reports

```
Purpose:
  The inspection Reports page is the canonical inspections view and replaces the
  old Inspection Log. It is data-dense on desktop and field-scannable on phones.
  Preserve the desktop table for wide screens, but never force the 980px table
  into the mobile viewport.
  Default state shows all scope inspections together. Scope is a filter, not the
  page title or primary page grouping.
  Mobile header title is `Inspection Reports`; do not add a redundant
  `All Inspections` title above the count.
  The Reports hub/card landing page is mobile-only. On desktop, project side nav
  already exposes each report route, so do not show a clickable Reports parent
  item in the desktop side nav and do not wire Reports to a single report type.

Responsive layout:
  desktop/tablet: table with dark header, sortable columns, and expandable
    section detail rows. Match the Projects table treatment: full-width,
    unboxed transparent wrapper, no rounded table container, no modal-like cutoffs.
  phone: stacked report cards. Each card shows unit, result, location/scope/date,
    attempt, inspector, subcontractor, deficiency count, and expandable section
    details.

Mobile cards:
  Use the inspection report card tokens:
    --inspection-report-card-bg
    --inspection-report-card-shadow
    --inspection-report-card-radius
    --inspection-report-card-pass-rail / --inspection-report-card-fail-rail
    --inspection-report-card-unit-size / --inspection-report-card-count-size
  background is white, shadow-only, no border.
  pass/fail state is anchored by a left vertical rail. Failed cards show
  `Deficiencies: #` as one right-aligned line in the result column so counts land
  in the same visual spot across cards.
  hierarchy: unit and scope pill on the left; inspection type, result, and deficiency
    count on the right; attempt/date below a divider; inspector avatar/name
    and subcontractor on the final row.
  Calibration inspections are separate report records. Where a normal inspection
  says `Attempt #1`, calibration rows say `Calibration`.
  Do not show the report sequence/inspection number on mobile cards; that belongs
  in the desktop table and backend record, not the compact field card.
  Chevron sits below the subcontractor value as a small downward expand affordance,
  not inline with the subcontractor text and not absolutely positioned in the
  card corner.
  Unit number should be prominent but not oversized, and scope should sit beside
  the unit number as a filled uppercase pill; use
    --inspection-report-card-unit-size
  instead of display-sized type.
  Do not use a large gray inset panel inside each card; it makes the mobile
  report harder to scan and wastes vertical space.

Filters:
  Desktop keeps the original quick filters visible above the table: search,
  date range, scope, inspector, subcontractor, attempt/calibration, and result.
  Do not replace the desktop quick filters with a single Filter action.

  Mobile nests all report filters behind one Filter action. Do not scatter
  search, date, result, attempt/calibration, IM, subcontractor, and scope filters
  across the page on mobile. The mobile filter surface is a side sheet with a
  dark navy header and filled, no-stroke controls using control tokens. Anchor it
  to the right edge at full viewport height; do not present it as a centered or
  floating modal.
  Select controls need custom chevrons with enough right padding for the icon
  area. The mobile Filter trigger is icon-only: ToolbarActionButton
  variant="filter" (var(--control-filter-size), filled var(--control-filter-bg),
  no stroke), with a small badge for the active filter count. Do not add a visible
  "Filter" label on mobile.
```

### Project Summary Card

```
Purpose:
  The top card inside a project is a compact project identity card, not a hero
  block. It should be visually closer in height to the Install Complete-Verified
  card than to a landing-page hero. Avoid oversized typography and excess
  vertical space.

Container:
  background:    var(--color-surface)
  border-radius: var(--radius-lg)
  box-shadow:    var(--shadow-card)
  padding:       var(--space-3)
  max-width:     688px
  border:        none

Header:
  project name: var(--text-subheading), weight 800, tracking var(--tracking-tight), var(--color-text-primary)
  address:      var(--text-caption), weight 500, var(--color-text-disabled)
  status pill:  uses StatusBadge; construction/production phases are secondary blue

Manager assignment panel:
  background:    var(--project-summary-assignment-bg)
  border-radius: var(--radius-lg)
  divider:       var(--project-summary-assignment-divider)
  layout:        always 2 columns with center divider at normal mobile/tablet card width
  PM avatar:     var(--color-secondary) / var(--color-text-inverse)
  IM avatar:     var(--color-surface-dark) / var(--color-text-inverse)
  empty avatar:  var(--project-summary-avatar-muted-bg) / var(--project-summary-avatar-muted-fg)
  avatar:        24px circle, 9px initials
  label:         9px, weight 800, uppercase, tracking var(--tracking-section)
  name:          var(--text-caption), weight 800

Stats:
  layout: one row when card has normal mobile/tablet width
  number: var(--text-heading), weight 800, tracking var(--tracking-tight), tabular nums
  label:  var(--text-micro), weight 800, var(--color-text-disabled)
  divider: var(--color-divider)

Footer:
  project number and start date use var(--text-micro), weight 700, tracking var(--tracking-ui),
  color var(--color-text-disabled).
```

### Scope Progress Card

```
Purpose:
  The % Complete by Scope card summarizes progress without making users hunt for
  totals. Totals should never float underneath the progress bar.

Collapsed scope row:
  left:   scope name
  center: stacked progress bar + unverified/verified legend
  right:  percent complete with the scope total directly below it

Expanded pipeline breakdown:
  show each pipeline stage count, then a final Total row at the bottom.
  The Total row should reconcile the stage list and use tabular numerals.
```

### Locations Building + Level Cards

```
Purpose:
  Building and level grouping on the Locations page must make location hierarchy
  scannable without changing the verified/unverified progress system.

Building color system:
  use explicit design tokens for up to 8 buildings:
    --building-north, --building-south, --building-east, --building-west,
    --building-a, --building-b, --building-c, --building-d
  name mapping wins first:
    North, South, East, West, Bldg A, Bldg B, Bldg C, Bldg D
  unknown building names fall back to sorted building order.
  after 8 buildings, cycle the same palette.

Building labels:
  background: assigned building color
  color:      var(--color-text-inverse), except light building colors may use
              var(--color-text-primary)
  radius:     var(--radius-pill)
  shadow:     var(--shadow-card)
  border:     none

Level cards:
  collapsed: light header using --level-card-collapsed-* tokens
  expanded:  dark navy header using --level-card-expanded-* tokens
  expanded dark mode applies to the level header only; unit cards remain on the
  light page canvas below.
  opening the `% Complete by Scope` breakdown also switches the level card to
  the dark expanded treatment.
  scope breakdown rows live inside the same level-card wrapper, sharing the same
  background, radius, shadow, and left building stripe.
  the scope breakdown toggle is three dots in both closed and open states.
  closed dots sit under the level progress bar; open dots move underneath the
  scope % bars and use a strong accent color so the close affordance is obvious.
  left accent stripe uses the assigned building color.
  level location counts use compact labels (`9 loc`, `18 loc`) inside a pill:
    collapsed: var(--color-surface-sunken) / var(--color-text-secondary)
    expanded:  var(--level-card-expanded-chip-bg) / var(--level-card-expanded-chip-fg)

Locations loading skeleton:
  must mirror the real level-card structure, not generic table rows.
  include compact summary row, building label placeholder, full-height left
  building stripe, soft level-number circle, progress track, percent/count
  placeholders, chevron placeholder, and scope-breakdown dots.
  skeleton level cards use no strokes; use card shadow and surface contrast.

Progress:
  keep verified and unverified install progress as stacked green segments.
  keep % Complete by Scope structure and math unchanged.
```

### Locations Unit Grid Cards

```
Purpose:
  Unit grid cards on the Locations page are compact scan cards. They show the
  location name, install percent, optional unit type, and the two-column scope
  tile grid. Do not repeat building or level on the unit card; that context
  belongs in the level header.

Card surface:
  background: var(--unit-grid-card-bg)
  complete background: var(--unit-grid-card-complete-bg)
  text: var(--unit-grid-card-fg)
  meta: var(--unit-grid-card-meta)
  radius: var(--unit-grid-card-radius)
  shadow: var(--unit-grid-card-shadow)
  border: none by default
  selected/expanded: var(--unit-grid-card-selected-bg) with
    var(--unit-grid-card-selected-outline)
  issue state: any active unit/scope/sub-scope issue gets
    var(--unit-grid-card-issue-outline)
  percent: neutral meta color until 100%; green only when complete

Scope tiles:
  layout: icon above abbreviation, rounded rectangle tile
  compact height: 46px minimum in unit grid cards
  icon: 15px Lucide icon above 8px uppercase abbreviation
  grid: two columns, wrapping as needed
  radius: var(--scope-tile-radius)
  gap: var(--scope-tile-gap)
  no decorative strokes; status is carried by fill, icon, and label color

Scope status color/icon system:
  Not started:
    --scope-tile-not-started-bg / --scope-tile-not-started-fg, dash (Minus) icon
  Staging:
    --scope-tile-staging-bg / --scope-tile-staging-fg, Package icon
  In Assembly:
    --scope-tile-assembly-bg / --scope-tile-assembly-fg, stacked-squares (Copy) icon
  Install In Progress:
    --scope-tile-install-bg / --scope-tile-install-fg, Hammer icon
  Install Complete-SUB:
    --scope-tile-sub-bg / --scope-tile-sub-fg, Clipboard icon
  Install Complete-Verified:
    --scope-tile-verified-bg / --scope-tile-verified-fg, ClipboardCheck icon
  Clear Inspection Passed:
    --scope-tile-passed-bg / --scope-tile-passed-fg, custom badge icon with
    offset check mark
  Clear Inspection Failed:
    --scope-tile-failed-bg / --scope-tile-failed-fg, custom badge icon with
    offset x mark
  Issue Flagged:
    --scope-tile-issue-bg / --scope-tile-issue-fg, AlertTriangle icon

Data behavior:
  keep current card click, long-press, select mode, modal, and scope data flow.
  derive PENDING_VERIFICATION from sub-scope instances so SUB-complete status can
  appear in the grid before manager verification.
```

### Unit Detail Modal

```
Purpose:
  The unit detail modal is a mobile-first detail surface for one location. It
  should use the current design-system typography and stacked cards, not the old
  grid/card table structure.

Header:
  background: var(--unit-detail-header-bg)
  text: var(--unit-detail-header-fg)
  meta: var(--unit-detail-header-meta)
  type pill: var(--unit-detail-header-chip-bg) / var(--unit-detail-header-chip-fg)
  progress: var(--unit-detail-progress-track) with var(--unit-detail-progress-fill)

Body:
  background: var(--unit-detail-bg)
  scope section uses one stacked column.
  scope card header places the scope name on the left and assigned
  subcontractor picker on the top right.
  assigned subcontractor picker uses control tokens and no stroke.
  scope cards use:
    var(--unit-detail-scope-card-bg)
    var(--unit-detail-scope-card-shadow)
    var(--unit-detail-scope-card-radius)
  no decorative strokes on normal scope cards.
  spacing should stay compact on phone: modest card padding, section gaps around
  12px, status controls near 44px tall, and inspection CTAs/results near 42-48px
  tall. Avoid oversized vertical padding that makes two scopes consume the whole
  viewport.
  blocking/issue state may use the red issue outline.
  status bars describe install progress only: dash, cube, hammer, clipboard,
  clipboard-check, or warning. Inspection pass/fail outcomes use the custom
  badge-check/badge-x icons in inspection result components.

Inspection controls:
  Inspection actions/results are not wrapped in a grey frame. The wrapper stays
  transparent; each CTA, result badge, retry action, or calibration action owns
  its own fill.
  Start Inspection uses:
    --inspection-start-bg / --inspection-start-fg
    light blue fill, dark blue text, custom badge icon
    when Procore backfill is available, Start Inspection and Set existing
    Procore status sit on one compact row. Start Inspection owns the remaining
    width; Procore is a fixed narrow secondary column with shortened visible copy.
  Pass badge uses:
    --inspection-pass-bg / --inspection-pass-fg
    custom badge icon with check
  Fail badge uses:
    --inspection-fail-bg / --inspection-fail-fg
    custom badge icon with x
  Inspection results render as large filled pills close to status-bar height.
  Failed inspections keep Retry as a separate right-side action.
  Pending/empty uses:
    --inspection-pending-bg / --inspection-pending-fg
  Calibration uses:
    --inspection-calibration-bg / --inspection-calibration-fg
    Calibration action/results sit at the bottom-right of the scope card, not as
    a full-width row.

Clear inspection history:
  Use the global `.inspection-history-*` classes and
  `--inspection-history-*` tokens for the expandable clear-inspection result
  list. Do not style these rows inline.
  Category headers are uppercase section controls with quiet metadata counts.
  Attempt rows are flat list rows, not nested cards. Most-recent pass/fail may
  use a 3px left rail. Retry rows use the red subtle background token and split
  the view/retry actions with the retry divider token.
  `View` is a quiet pill using the history action tokens. Calibration rows use
  the inspection calibration tokens.

Inspection record review:
  The readonly inspection record uses the same visual language as the expanded
  Inspection Reports view, not the live form-fill UI. Use the global
  `.inspection-record-*` classes for record header, section cards, answers, and
  deficiency rows.
  Header outcome is a compact pass/fail pill using
    --inspection-pass-bg / --inspection-pass-fg
    --inspection-fail-bg / --inspection-fail-fg
  Do not use a full-width red or green banner for the record header.
  Sections are shadow-only cards. Scored sections (pass/fail, yes/no, or
  deficiency capture) use pass/fail filled surfaces; informational sections
  (text-only, no scored questions) use a neutral surface with no pass/fail icon
  or status. Never fall back to a generic section title like "General" — omit
  the section header when there is no title.
  Failed scored sections show the total occurrence count in the section status
  area; passed sections show `Passed`.
  Question details stay inside white inner panels so all original information is
  preserved, but recorded pass/fail answers use filled pills rather than stroked
  boxes. Deficiency rows use the record deficiency classes and the fail
  surface tokens for the card body; severity and occurrence count sit on the
  right (no "Deficiency 1/2" index labels). Media still displays inline.
  Severity color coding uses the shared form severity tokens everywhere:
    Minor:    var(--form-severity-minor-bg) / var(--form-severity-minor-fg)
    Major:    var(--form-severity-major-bg) / var(--form-severity-major-fg)
    Critical: var(--form-severity-critical-bg) / var(--form-severity-critical-fg)
  Record review: `.inspection-record-deficiency__severity--*` pills and matching
  left-rail + count styling on `.inspection-record-deficiency--*`.
  Reports / export: `.deficiency-severity-pill--*` (same tokens). Never hardcode
  hex severity colors in components.

Inspection retry fill:
  The clear-inspection retry overlay reuses the same token families as record
  review and form fill. Use global `.inspection-retry-*` classes — not inline
  hex colors.
  Header attempt label: `--color-accent-hover` eyebrow typography.
  Open deficiencies panel: `--inspection-fail-bg` / `--inspection-fail-fg` /
  `--error-300` borders; remaining-items panel uses neutral surface tokens.
  Previous-answer readout: `--form-response-pass/fail/na-*` via
  `.inspection-retry-readout-choice`; resolution toggles use the same pass/fail
  fill tokens when selected.
  Prior deficiency rows reuse `.inspection-record-deficiency*` (description left,
  severity + count right, `--form-severity-*` pills).
  New deficiency entry panel: `--form-deficiency-bg/border/fg`.
  Submit CTA: `--color-accent` enabled, `--control-bg` disabled.

Secondary action cards:
  Observations and Issues are stacked white cards with shadow-only surfaces.
  The count copy should read as quiet metadata (for example, `0 logged`), and
  the add action should be a compact neutral control, not a primary orange CTA.
```

### Mobile Account Drawer

```
Core rule:
  The account drawer is a surface panel, not a card. It may use structural row dividers,
  but no decorative strokes or outlined cards.

Panel:
  background: var(--color-surface)
  shadow:     var(--shadow-modal)
  width:      min(340px, 100vw)
  backdrop:   rgba(16,18,43,0.35)

Header:
  divider:     var(--color-divider)
  avatar bg:   var(--color-accent-subtle)
  avatar text: var(--color-accent-hover)
  name:        15px, weight 700, var(--color-text-primary)
  role:        12px, var(--color-text-tertiary)

Rows:
  height:         natural 16px/20px vertical padding
  divider:        var(--color-divider)
  label:          15px, weight 700, letter-spacing var(--tracking-ui)
  label color:    var(--color-text-primary)
  icon color:     var(--color-text-tertiary)
  chevron color:  var(--color-text-disabled)
  hover:          var(--color-surface-sunken)

Language toggle:
  active bg:   var(--color-accent-subtle)
  active text: var(--color-accent)
  inactive:    transparent / var(--color-text-secondary)

Sub-panels:
  title:       16px, weight 700, var(--color-text-primary)
  back/action: var(--color-accent), weight 700 when text is present
  forms:       inputs use var(--color-surface-sunken), no border, radius var(--radius-md)
```

### Form Builder

```
Core rule:
  The form builder uses the same no-stroke surface system as the rest of the app.
  Cards use white surface + 14px radius + shadow only.
  Structural dividers may use #EDEEF2 when needed, but no decorative card strokes.

Form header card:
  background:    var(--color-surface)
  border-radius: var(--radius-lg)
  box-shadow:    var(--shadow-card)
  top stripe:    var(--form-builder-card-stripe) → #F55F00
  title:         20px, weight 700, color var(--color-text-primary)
  description:   13px, color var(--color-text-tertiary)

Section card:
  tab background: var(--form-builder-section-tab-bg) → #10122B
  tab text:       11px, weight 700, ALL CAPS, letter-spacing var(--tracking-label)
  card:           var(--color-surface), var(--radius-lg), var(--shadow-card)
  section title:  20px, weight 700, color var(--color-text-primary)
  description:    14px, weight 500, color var(--color-text-tertiary)

Question card:
  background:    var(--color-surface)
  border-radius: var(--radius-md)
  box-shadow:    var(--shadow-card)
  focus indicator: 4px left stripe, var(--color-accent)
  question title: 16px, weight 700, var(--color-text-primary)
  question number badge: 10px, weight 700, letter-spacing var(--tracking-label)

Response preview pills:
  Pass: var(--form-response-pass-bg) / var(--form-response-pass-fg)
  Fail: var(--form-response-fail-bg) / var(--form-response-fail-fg)
  N/A:  var(--form-response-na-bg)   / var(--form-response-na-fg)
  All:  border none, radius var(--radius-md), weight 700

Deficiency preview:
  background: var(--form-deficiency-bg)       → #FFF4ED
  top line:   var(--form-deficiency-border)   → #FFE4CC
  labels:     var(--form-deficiency-fg)       → #CC4D00
  This panel uses brand-orange subtle, not amber/yellow. Amber is reserved for true warnings.

Severity pills:
  Minor:    var(--form-severity-minor-bg) / var(--form-severity-minor-fg)
  Major:    var(--form-severity-major-bg) / var(--form-severity-major-fg)
  Critical: var(--form-severity-critical-bg) / var(--form-severity-critical-fg)
  All:      border none, radius pill

Builder actions:
  Add question (primary): solid var(--color-accent), weight 700, letter-spacing var(--tracking-ui)
  Add question (secondary within earlier sections): subtle orange fill + orange outline
  Add section: ghost/dashed, neutral text
  Publish: var(--form-builder-commit-bg) → #10122B
```

### Level Banners (dark)

```
background: #10122B
border-radius: 10px
height: 44px
padding: 0 16px
progress track: background rgba(255,255,255,0.12), height 6px, border-radius 99px
progress fill:  background #22C064  ← ALWAYS green, never orange
```

---

## Responsive Breakpoints

```
Mobile:  < 768px  — sidebar hidden, mobile bottom nav
Desktop: ≥ 768px  — fixed sidebar (240px)
```

---

## Typography — "UI Label" Pattern

The following rule applies to any text that *labels or identifies* UI — not body copy:

**Rule: `font-weight: 700` + `letter-spacing: 0.04em`**

Applied to:
| Surface | Notes |
|---------|-------|
| Navigation items (desktop + mobile) | Color distinguishes active vs inactive |
| Button labels | All variants — primary, secondary, ghost, destructive |
| Table column headers (`<th>`) | Set in globals.css base layer |
| Form field labels (`<label>`) | Set in globals.css base layer |
| Status badge / pill text | 12px + 700 + 0.04em |
| Top bar title / project name | 14px + 700 + 0.04em |
| Back-link text | 12px + 700 + 0.04em |

ALL CAPS labels (section headers, stat sub-labels, micro labels) use wider spacing:
- `font-weight: 700` + `letter-spacing: 0.08em–0.10em` + `text-transform: uppercase`

Big stat numbers (DM Mono) use tight spacing:
- `font-weight: 800–900` + `letter-spacing: -0.03em`

---

## Component Specs — Project Cards & Table

### Mobile Project Card

```
Card container
  background:    #FFFFFF
  border-radius: 14px
  box-shadow:    0 2px 8px rgba(16,18,43,0.07)
  border:        none
  padding:       14px
  gap:           10px

Project name (h-level text)
  font-size:     15px
  font-weight:   800
  color:         #10122B
  line-height:   1.3

Status badge — top-right, inline with name (see StatusBadge component)

Location row
  icon:  <MapPin> 13×13, color #F55F00
  text:  13px, color #9CA0B3

Scope chips (pills)
  font-size:     11px
  font-weight:   600
  padding:       3px 10px
  border-radius: 99px
  background:    #F0F1F5
  color:         #4D5266
  border:        none

People row (IM / PM)
  No top border
  gap: 16px between IM and PM blocks

  Avatar:
    size:         26×26px
    border-radius: 50%
    font-size:    11px
    font-weight:  800

  IM avatar:  background #0057F5, color #FFFFFF
  PM avatar:  background #10122B, color #FFFFFF

  Role label (IM / PM)
    font-size:     9px
    font-weight:   700
    color:         #9CA0B3
    text-transform: uppercase
    letter-spacing: 0.06em

  Person name
    font-size:     12px
    font-weight:   700
    color:         #10122B
```

### Desktop Projects Table

```
Table container
  background:    #FFFFFF
  border-radius: 14px
  box-shadow:    0 2px 8px rgba(16,18,43,0.07)
  border:        none
  overflow:      auto

Table header row (thead)
  background:    #F7F8FA

Column headers (th / SortableHeader)
  font-size:     10px
  font-weight:   700
  color:         #9CA0B3
  text-transform: uppercase
  letter-spacing: 0.08em
  padding:       10px 20px
  Active sort:   color #F55F00

Row dividers
  border-bottom: 1px solid #EDEEF2  (not neutral-300)

Project name cell (sticky)
  Shows project name (14px, 700, #10122B) STACKED above
  site location (12px, #9CA0B3)
  border-right:  1px solid #EDEEF2

Data cells
  font-size:     14px
  color:         #737891
  padding:       12px 20px

Page title
  font-size:     28px
  font-weight:   800
  letter-spacing: -0.02em
  color:         #10122B

Page subtitle
  font-size:     13px
  color:         #9CA0B3

Add Project button (primary button)
  background:    #F55F00
  color:         #FFFFFF
  height:        44px
  padding:       0 20px
  border-radius: 10px
  font-size:     13px
  font-weight:   700
  letter-spacing: 0.04em
```

---

## Progress Bars — Critical Rule

**Progress bars in this app are ALWAYS `#22C064` (green-400).**
They represent completion of work — not brand identity.
- Never use orange (`#F55F00`) for a progress bar
- Never use amber for a progress bar
- Level banners, overview stats, scope panels — all use `#22C064`

---

## Changelog

| Version | Date | Notes |
|---------|------|-------|
| v0.1 | 2026-02-19 | Initial. Font: Inter. Brand: blue (`#2E5C8A`). |
| v2.0 | 2026-05-18 | Full rebrand. Font: DM Sans + DM Mono. Brand: orange (`#F55F00`). New neutral scale anchored at `#10122B`. No-borders rule. Green-only progress rule. Being applied component by component. |
| v2.1 | 2026-05-18 | Project cards (mobile) + projects table (desktop) updated. Shadow-only cards, 14px radius, IM/PM avatars, neutral scope chips, ALL CAPS table headers, stacked project name + sub-location, `#EDEEF2` row dividers. Page title 28px/800. Add Project button matches primary button spec. |
