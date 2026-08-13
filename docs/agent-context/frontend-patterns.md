# Frontend Patterns — CP Build Command Center

> Use this to understand component conventions, state patterns, and layout rules before writing or editing UI code.

## Framework & Architecture

- **Next.js 16 App Router** — Server Components by default; add `"use client"` only when needed
- **React 19** — concurrent features, server actions
- **Tailwind CSS 4** — utility classes only via design tokens (never hardcoded hex/px values)
- **shadcn/ui** — Radix UI primitives; components in `components/ui/`

## Design Tokens (CSS Custom Properties)

All color, shadow, spacing, and radius values must reference tokens from `app/globals.css`. **Never hardcode hex, named colors, or raw `rgba()`/`rgb()` values in component files.**

```css
/* Colors */
--primary-700, --primary-600, --primary-500, --primary-200, --primary-100, --primary-50
--secondary-700, --secondary-500, --secondary-100
--neutral-900 through --neutral-0
--success-600, --success-100
--warning-600, --warning-100
--error-600, --error-100

/* Typography */
--text-display: 32px    --text-heading: 20px
--text-subheading: 16px --text-body: 14px  --text-caption: 12px

/* Spacing (8px base unit) */
--space-1: 4px  --space-2: 8px  --space-4: 16px
--space-6: 24px --space-8: 32px --space-12: 48px --space-16: 64px

/* Components — note: button/input heights are responsive (see LAYOUT_RULES.md R2/R8) */
--button-height: 44px (mobile) / 40px (tablet+)   --input-height: 44px (mobile) / 40px (tablet+)
--nav-width: 240px     --top-bar-height: 56px  /* unified across TopBar, ProjectTopBar, sidebar brand */
--radius-sm: 6px       --radius-md: 8px
--shadow-1, --shadow-2
--focus-ring: 0 0 0 2px var(--primary-500)
--overlay-bg: rgba(0,0,0,0.5)  /* use this for modal backdrops — never inline rgba */
```

Use these in Tailwind via `[var(--token-name)]` syntax or in inline styles.

### ❌ Prohibited CSS patterns

```tsx
// NEVER — hardcoded hex, rgba, named color
style={{ color: "#fff" }}
style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
style={{ borderColor: "white" }}
style={{ animation: "spin 1s linear infinite" }}   // @keyframes spin doesn't exist

// ALWAYS — CSS variables and Tailwind classes
style={{ color: "var(--neutral-0)" }}
style={{ backgroundColor: "var(--overlay-bg, rgba(0,0,0,0.5))" }}
style={{ borderColor: "var(--neutral-300)" }}
style={{ boxShadow: "var(--shadow-2)" }}
className="animate-spin"   // Tailwind guarantees the keyframes exist
```

**Exception:** Fullscreen dark-overlay UIs (e.g. `CameraCapture`) where the entire design intent is white-on-black and mixing CSS vars would break the aesthetic. Document every such exception in `docs/COPILOT_LEARNINGS.md` before opening the PR.

## Layout Structure

### Dashboard layout (`(dashboard)/`)
```
Fixed left sidebar (240px) [desktop only]
  SideNav: Dashboard / Projects / Users links
  AccountMenu: bottom of sidebar

TopBar [full width, fixed top]
  - Mobile: CP Build brand + LocaleSwitcher + avatar
  - Desktop: page title + LocaleSwitcher + avatar

<main id="main-content">   ← SkipLink target
  page content

MobileBottomNav [bottom, ≤767px only]
  Dashboard / Projects / Users icons
```

### Project workspace layout (`(project)/`)
```
ProjectTopBar [blue context bar — project name + Back button]

ProjectSideNav [desktop — project-specific links]
  Overview / Units / SOV / Install

<main>
  page content

ProjectMobileBottomNav [mobile — Overview / Units / SOV]
```

## Server vs Client Components

**Default to Server Components.** Only add `"use client"` when the component needs:
- `useState`, `useEffect`, `useReducer`
- Browser APIs (`window`, `localStorage`)
- Event handlers (`onClick`, `onChange`)
- Third-party client-only libraries

```typescript
// Server Component (default)
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export default async function ProjectsPage() {
  const session = await auth();
  const projects = await db.project.findMany({ where: { deletedAt: null } });
  return <ProjectsTable projects={projects} />;
}

// Client Component
"use client";
import { useState } from "react";
export function ProjectsPageClient({ projects }) {
  const [filter, setFilter] = useState("");
  // ...
}
```

## Data Fetching Pattern

Server components fetch directly from Prisma. Client components fetch via `fetch()` against API routes:

```typescript
"use client";
// Always use try/catch; always show loading and error states; always check r.ok before r.json()
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  fetch("/api/projects")
    .then(async r => {
      if (!r.ok) throw new Error(`Request failed: ${r.status}`);
      return r.json();
    })
    .then(setData)
    .catch(err => { console.error(err); setError(err.message); })
    .finally(() => setLoading(false));
}, []);
```

**Never call `.json()` without checking `r.ok` first** — error responses (4xx/5xx) have JSON bodies too; skipping the check silently puts error payloads into your data state.

## useEffect Rules

```typescript
// DOM writes must be cleaned up on unmount
useEffect(() => {
  document.body.classList.add("modal-open");
  return () => document.body.classList.remove("modal-open");  // ← always return cleanup
}, []);

// useEffect dependency arrays: derive stable keys from IDs, not .length
// BAD  — .length is the same before/after if items are replaced
useEffect(() => { ... }, [items.length]);
// GOOD — a joined ID string changes whenever the actual items change
useEffect(() => { ... }, [items.map(i => i.id).join(",")]);
```

## i18n in Components

**i18n is non-negotiable. Every user-visible string in every component must come from `messages/`. No hardcoded English, ever.**

```typescript
// Server Component
import { getTranslations } from "next-intl/server";
const t = await getTranslations("projects");

// Client Component
"use client";
import { useTranslations } from "next-intl";
const t = useTranslations("projects");

// Navigation — always import from i18n/navigation (not next/link or next/navigation)
import { Link, useRouter, usePathname } from "@/i18n/navigation";
```

**Never mix import sources.** `usePathname` from `next/navigation` returns the raw path without locale prefix; `usePathname` from `@/i18n/navigation` strips the locale prefix correctly. Always use `@/i18n/navigation` for all three: `Link`, `useRouter`, `usePathname`.

### ❌ Prohibited i18n patterns

```tsx
// NEVER — hardcoded English anywhere a user can see it
toast("Scope types linked successfully")
toast.error("Failed to save scope links")
<button aria-label="Save to Photos off (tap to turn on)">
<input placeholder="Enter a name" />
<h2>Link New Scope Types</h2>
<p>All scope types must be linked before continuing.</p>

// ALWAYS — pull every string from messages/
toast(t("linkSuccess"))
toast.error(t("linkError"))
<button aria-label={saveToPhotos ? t("saveOnLabel") : t("saveOffLabel")}>
<input placeholder={t("namePlaceholder")} />
<h2>{t("title")}</h2>
<p>{t("allMustBeLinked")}</p>
```

### Workflow for adding strings to a new component

1. **Decide the namespace** before writing JSX — usually matches the route or component group (`"projects"`, `"feedback"`, `"camera"`, `"scopeLinking"`, etc.)
2. **Add all keys** to `messages/en.json` under that namespace
3. **Add all keys** to `messages/es.json` (translate or use English as a placeholder marked `// TODO: translate`)
4. **Wire `useTranslations`** at the top of the component
5. **Replace every hardcoded string** with `t("key")` before committing

Both `en.json` and `es.json` must be updated in the same commit. Never commit one without the other.

## Component Organization

```
components/
  layout/         ← Navigation shells (SideNav, TopBar, MobileBottomNav, etc.)
  projects/       ← Project-specific components (table, cards, modals)
  auth/           ← LoginForm, InviteAcceptForm
  team/           ← TeamDirectory, InviteModal
  shared/         ← Cross-cutting: StatusBadge, OfflineIndicator, SkipLink, RouteAnnouncer
  devtools/       ← DevTools panel (admin + dev only); includes SiteTourInspector
  tour/           ← Tour overlay system: TourPlayer, SiteTourLauncher, TourCursor, TourPanel
  ui/             ← shadcn/ui primitives (Button, Input, Dialog, etc.) — do not modify
  account/        ← OfflinePreferences
```

## Tour System Architecture

The site tour is a multi-component system. Read this before touching any tour file.

### Lifecycle (first visit)

1. `SiteTourLauncher` mounts silently inside `(dashboard)/layout.tsx`. On first visit (no `cc-site-tour-v2-seen` in localStorage) it writes `sessionStorage["pendingTour"] = { siteTour: true, autoPlay: false }` and sets the seen flag. Bump the `v2` suffix to force the tour to re-show to existing users.
2. `TourPlayer` reads `sessionStorage["pendingTour"]` on mount. If present, it fetches `GET /api/site-tour` to load the bilingual steps and starts the tour.
3. Between page navigations, `TourPlayer` serialises current state into `sessionStorage["activeTour"]` and restores it on the next page.

### Launching from DevTools / TourPanel

Dispatch `tour:request` on `window`:
```typescript
window.dispatchEvent(
  new CustomEvent("tour:request", {
    detail: { siteTour: true, autoPlay: false, startIndex?: number }
  })
);
```
`TourPlayer` listens for this event and starts immediately — no page reload needed.

### SiteTourInspector (DevTools tab)

- Saves per-step text edits to `localStorage["cc-tour-step-edits"]` as `{ [stepOrder]: { titleEn, titleEs, descEn, descEs, voiceEn, voiceEs } }`
- **`TourPlayer` merges these edits on every site tour launch** — changes appear immediately without restarting the app
- Auto-translate calls `https://api.mymemory.translated.net` (no API key, free tier)
- Dispatches `tour:request` to launch from a specific step; calls `onClose()` first to hide the DevTools panel

## Accessibility Requirements (non-negotiable)

- `<SkipLink>` — first child of `<body>`, links to `#main-content`
- `<RouteAnnouncer>` — moves screen reader focus to `h1` on route change
- All form inputs: `aria-describedby` for error IDs, `aria-invalid` for invalid state
- Interactive elements: keyboard navigable, visible focus ring using `--focus-ring`
- **Icon-only buttons must have `aria-label`** — e.g. `<button aria-label="Close dialog"><XIcon /></button>`
- **Toggle buttons must have `aria-pressed`** — e.g. `<button aria-pressed={isOpen} onClick={toggle}>Menu</button>`
- Toasts: use Sonner `<Toaster>` with `aria-live` semantics
- Offline indicator: `aria-live="assertive"` in `<OfflineIndicator>`

## StatusBadge

```typescript
import { StatusBadge } from "@/components/shared/StatusBadge";
<StatusBadge label="Construction" lifecycleStatus="Active" />
```

**`label`** — Unifier phase text (`CP_PROJECT_PHASEPD`) or a known lifecycle key (then translated). Empty → "—". **`lifecycleStatus`** — `Active` | `Completed` | `Planning` | `On Hold`; drives `--success-*`, `--warning-*`, `--error-*`, `--neutral-*` colors.

## Form Pattern (React Hook Form + Zod)

```typescript
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({ title: z.string().min(1) });

const form = useForm({
  resolver: zodResolver(schema),
  defaultValues: { title: "" },
});

const onSubmit = async (data) => {
  const res = await fetch("/api/...", {
    method: "POST",
    body: JSON.stringify(data),
  });
  // handle response
};
```

Project linking uses `CreateProjectModal` → `POST /api/projects` with `{ unifierPid, upmData? }` (no local copy of Unifier name/site/status in the body).

## Units list — location strip (`UnitCards`)

The Field Tracker table column order may be **Building, Level, Unit, Area**. The **collapsed row / grid / modal location strip** uses: **Building → Level → build phase / area** (when defined on the card).

| Data | UI field | Icon (Lucide) |
|------|----------|----------------|
| `building` | Building name | `Building2` |
| `level` | Level | `Layers` |
| `buildPhase` | Build phase (when non-empty and not `"0"`) | plain text: `Phase: {value}` |
| `area` | Area (when non-empty and not `"0"`) | plain text: `Area: {value}` |

**Per-card display (`LocationBuilderMeta` + `lib/location-builder-display.ts`):**

- **`cardLocationBuilderFields(card)`** — Resolves build phase from `card.buildPhase` or the first scope with a defined value; area from `card.area` or the first scope with a defined value. Blank and `"0"` are treated as undefined. **`groupIntoCards`** also promotes non-empty area/build phase from later scope rows when the first row for a unit is blank.
- **`LocationBuilderMeta`** — Renders phase/area chips on grid cards, list rows, and the unit detail modal whenever defined on that card.

**Aggregated level/building labels:**

- **`sharedLocationBuilderFields(cards)`** — When **every** unit and common area in a section (excluding custom site locations) shares the same defined build phase and/or area, that value is appended to the level or building header (`Phase 2 · Area 850 SF`).

**Locations filter panel (`UnitsPageClient`):**

- **Build phase** and **Area** are separate `FilterPanelSection` blocks (same pattern as Location / Scope). List rows show the raw value only (section header supplies context). Options come from `extractFilterOptions` via `cardLocationBuilderFields`. Persisted in `lib/locations-list-filters-session.ts` as `buildPhases` / `areas` arrays (default `[]` when omitted for backward compat).

**Visibility (project-wide helpers in `UnitCards.tsx`):**

- **`shouldShowBuildingInLocationLine(cards)`** — Hides the building segment when the project has only **one** distinct non-empty building. Missing building on some projects is expected.

**Scope count is not location metadata.** Do not show **icon + number** for scope count in the same visual cluster as building/area/level — when the count matches the level digit (e.g. `1`), users read it as “level”. Use **translated text** (e.g. `scopeCount`) elsewhere in the row or modal.

**Mobile compact list card (`UnitRowCollapsedMobile`, ≤767px only):** Top row — unit number, optional blocked badge, then **building / area / level** (same rules as desktop location strip), wrapping inline; **unit-type** pill top-**right**. No **scope count** label (badges below convey multiplicity). Below — `ScopePills` (scope names). **Unit progress** uses `unitInstallCompletePercent()` from `lib/unit-scope-progress.ts`: equal weight per scope; only **INSTALL + COMPLETE** counts; inputs use `ScopeStage` / `ScopeStatus` unions aligned with row APIs. Mobile shows **`MobileUnitInstallProgressSection`**: caption `mobileUnitInstallProgressCaption` (e.g. “0 out of 1 scope at install complete”; pluralizes “scope(s)” on `total`) + **%** above a **pill-shaped** bar (`var(--primary-500)` fill, `var(--neutral-300)` track; `var(--success-600)` at 100%). **Desktop/tablet list** (`UnitRowCollapsed`) uses pill **`UnitBottomProgressBar`** under the row.

**Units toolbar (`UnitsPageClient`, ≤767px):** **Grid only**, **always grouped by location** (`effectiveViewMode` / `effectiveGroupByLocation`); **single row** — search + **filter** icon (no list/grid toggle, no “Group by Location”, no expand-all). **≥768px:** search row + control row with list/grid toggle, group-by, expand-all, filter. Breakpoint matches `UnitCards` mobile list threshold (767px).

**Stacked scope cards (`ScopeStackedBlock`, mobile unit detail modal):** Cards use **`var(--shadow-2)`**, **`1px solid var(--neutral-300)`** border, and **`var(--space-4)`** vertical gap between cards so many scopes stay separated on the **`primary-50`** tray. Top-right of each card shows **assigned subcontractor install team** (`scope.installer?.name`) with a **`Users`** (team) icon. **Clear inspection** is not driven from this UI yet — bottom of the card is a **read-only** line **`units.inspectionStatusLabel`** + value (`inspectionStatusValueNotStarted`, `inspectionStatusValueReady`, or existing passed/failed strings), muted typography (`ScopeStackedInspectionStatusLine`). Desktop **table** rows still use **`InspectionButton`** + modal until that flow is retired. **`units.viewActivity`** is an **outlined** control (`VIEW_ACTIVITY_BUTTON_CLASS` in `UnitCards.tsx`): **min-height `var(--min-touch)`**, border **`neutral-300`**, **full width** under stacked scopes, inline **table** footer on desktop.

**Grid view (`UnitGridCard`):** Grouped by building + level when `effectiveGroupByLocation` is true (always on mobile; desktop can toggle unless grid is on). On desktop, toolbar **“Group by Location”** is disabled while grid is active. **≤767px + grid:** tile tap calls `toggleExpand` (not `onGridCardSelect`); **`MobileUnitDetailModal`** renders when the tile is expanded (`useMobileGridDetailModal`), same UX as mobile list rows. **Modal header:** title is **unit id only** (`units.unitDetailModalTitle` → `{unit}`); subtitle row is **location + `unitDetailModalScopesCompleteCaption`** (“N scopes installed”, count of INSTALL+COMPLETE scopes, pluralized). **Building** is **always** included in the modal location row when `card.building` is non-empty — **not** gated on `shouldShowBuildingInLocationLine` (collapsed list/grid rows may still hide building on single-building projects). **install-complete %** sits **right-aligned** above the bar (`unit-detail-modal-progress-pct`); bar fill still from `unitInstallCompletePercent`. Desktop grid + `onGridCardSelect` still switches to list. **Summary line** under the toolbar (grid + list): left **“{n} of {m} units”**, right **`buildingsVisibleSummary`** — distinct buildings in `filteredCards` vs `cards` (normalized with `MISSING_LOCATION_LABEL`), so filters/search reflect as “Showing 2 of 3 buildings”. **Building row** (`BuildingGroupHeaderRow`): full-width row with the **building chip** on the left and an **icon-only** control on the right (`ChevronsDown` / `ChevronsUp`) that **expands or collapses every level section under that building** (`toggleExpandAllLevelsForGroup` + `expandedLevelSections`). **Level section bars** (`LevelSectionBar`): **light** when collapsed (`neutral-50`), **dark** when expanded (`neutral-900`) so open sections read as active; **default collapsed**; **expanded rows use tighter padding and smaller type** so many open levels stay scannable; **level chevron** is a **borderless** icon control (desktop “expand all unit rows in level” keeps a small bordered button). Grid has no “expand all unit rows” control. **List and grid share** `expandedLevelSections`. Outer **`.units-grid-squares`**: **&lt;640px** — **3 columns**; **≥640px** — **`repeat(auto-fill, minmax(104px, 1fr))`** so column count follows viewport width. **`align-items: start`** so mixed tile heights don’t stretch. **Header** uses full tile width: **unit id** + optional **unit-type** pill, then **`LocationBuilderMeta`** (`variant="compact"`) for phase/area (wraps across full width, no ellipsis). **Install-complete %** is **absolutely positioned** top-right so meta lines are not squeezed beside the percent column. **`flexShrink: 0`** above the scope grid. **Unit id only** (no `Unit ` prefix); type pill can wrap when long. Scopes: **`ScopeStatusSquare` `layout="grid"`**, **2 columns**, **`aspect-ratio: 1/1`** per cell — **2×2** for first four scopes, then more rows for 5+. Styling from `getScopeSquareStyle()` (`lib/scope-square-style.ts`). No **`UnitBottomProgressBar`**.

---

## Mobile-First Responsive Rules

- Mobile layout at ≤767px: bottom nav, stacked cards, no sidebar
- Desktop at ≥768px: fixed left sidebar, table views, side navigation
- Project mobile view: card list → tap → Unit Detail Modal (bottom sheet)
- Use CSS custom property `--top-bar-height` for aligning fixed headers

## DevTools Components (admin + dev only)

```typescript
// DevToolsPanelWrapper conditionally renders based on isDevToolsAllowed()
// Never render DevTools components directly in production layouts
import { DevToolsPanelWrapper } from "@/components/devtools/DevToolsPanelWrapper";

// Only include in root layout — it handles its own visibility guard
<DevToolsPanelWrapper />
```

## Toast Notifications

```typescript
import { toast } from "sonner";
toast.success("Project created");
toast.error("Something went wrong");
```

## PWA / Offline Mode

### Auto-detect model (current)

The app detects network loss automatically — users do not need to opt in to offline mode. When network calls fail or `navigator.onLine` goes false:

- `<OfflineIndicator>` is the **single** connectivity strip (bottom of layout column). Pages register stale snapshot dates via `useRegisterOfflineCacheView` — no duplicate top-of-page cache banners.
- When the browser is online but `lib/offline/connectivity.ts` reports **slow** quality (`GET /api/connectivity` probe exceeds 3s), the bottom strip shows slow-connection messaging (merged with cache date when viewing a snapshot).
- Tapping the banner expands `<OfflineCachePanel>` (an inline shelf) showing aggregate cached data counts (projects, units, issues, observations, subcontractors, published forms) and queued write count.
- Offline write operations (unit status, issues, observations, comments) are queued in IndexedDB via `lib/offline/mutation-queue.ts` and auto-flushed when connectivity returns.
- **Inspection submit (local-first):** new photos are stored in `cc-offline-blobs` on submit (`lib/inspections/inspection-media-blobs.ts`); uploads run during `syncOne`, never blocking the submit UI on slow LTE.
- Snapshot data is served from Cache Storage (`offline-data-v1`) as a fallback when **any** API fetch fails — not only when `navigator.onLine === false` (spotty cell / captive portal). Unit list loads abort after 6s to reach snapshot faster.

**Spotty-network rule:** Prefer `lib/offline/snapshot-cache.ts` (`readSnapshotData`, `readSnapshotModule`, `readSnapshotUnitsForProject`) over inline Cache Storage reads. On fetch failure, always try snapshot before showing an error empty state.

### Pre-download (optional, for field users)

`<OfflineProjectButton>` on the projects table is an **optional** pre-cache feature for users who know they'll be working in areas with no signal. It triggers `triggerResync([projectId])` to populate the cache ahead of time. This button is not required for offline to work — it just gives users a guarantee that the latest data is already cached before they leave connectivity.

### Key files

| File | Role |
|---|---|
| `components/shared/OfflineIndicator.tsx` | Fixed banner, auto-detect, expand to cache panel |
| `components/shared/OfflineCachePanel.tsx` | Cache manifest shelf — reads Cache Storage + IDB pending count |
| `components/projects/OfflineProjectButton.tsx` | Optional pre-download per project |
| `hooks/use-offline-sync.ts` | Central download/flush state |
| `hooks/use-offline-status.ts` | `isOnline` / `wasOffline` |
| `hooks/use-connectivity-mode.ts` | `quality` / `isDegraded` — probes beyond `navigator.onLine` |
| `lib/offline/connectivity.ts` | Health probe, `fetchWithTimeout`, sync defer gate |
| `lib/offline/mutation-queue.ts` | IDB write queue |
| `lib/offline/background-sync.ts` | `triggerResync`, `activateEagerSync`, `initBackgroundSync` |
| `lib/offline/snapshot-cache.ts` | Canonical client reader for `offline-data-v1` snapshot modules |
| `lib/offline/blob-store.ts` | IDB blob store for offline media capture |
| `lib/inspections/inspection-media-blobs.ts` | Local-first inspection photo defer + sync resolve |
| `lib/project-units-serialize.ts` | Shared unit row serialization for live API + offline snapshot |
