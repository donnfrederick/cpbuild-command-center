# Data Visualizer — DevTools Plan

## Overview

A new **Data Visualizer** tab in the DevTools panel that lets developers browse database tables and view their contents in a TablePlus-like interface — without leaving the app or opening an external DB client.

---

## Goals

- View all tables and their row counts
- Select a table and see its data in a sortable, scrollable grid
- Search/filter within the current table
- Read-only by default (no accidental edits in dev)
- Blocked in production (same as other DevTools)

---

## Scope (v1)

| Include | Exclude (for later) |
|---------|---------------------|
| List tables with row counts | Edit/delete rows |
| View table data in grid | Create new rows |
| Column sorting (client-side) | Raw SQL query |
| Text search across visible columns | Export to CSV |
| Pagination or virtual scroll for large tables | Schema editing |
| Refresh button | |

---

## Architecture

### API: `GET /api/devtools/data`

**Query params:**
- `table` (optional) — table name to fetch. If omitted, returns table list + counts.
- `page` (optional, default 1) — for pagination
- `limit` (optional, default 50) — rows per page
- `search` (optional) — filter rows where any string column contains this (case-insensitive)
- `sort` (optional) — column name
- `order` (optional) — `asc` | `desc`

**Response when `table` omitted:**
```json
{
  "tables": [
    { "name": "Project", "count": 12 },
    { "name": "User", "count": 5 },
    { "name": "Invite", "count": 2 }
  ]
}
```

**Response when `table` provided:**
```json
{
  "table": "Project",
  "columns": ["id", "projectName", "siteLocation", "status", ...],
  "rows": [
    { "id": "abc", "projectName": "Modera Marmalade", ... }
  ],
  "total": 12,
  "page": 1,
  "limit": 50
}
```

**Security:**
- Hard-block in production (403)
- Use Prisma's `$queryRaw` or dynamic model access — only allow known table names from a whitelist to prevent injection

### Whitelisted Tables

Only expose non-sensitive, dev-useful tables:
- `Project`
- `User` (mask `passwordHash` — show `***` or omit)
- `Invite`
- `OfflinePreference`
- `DesignTokenSnapshot`

Exclude: `Account`, `Session`, `VerificationToken` (auth tokens, sensitive). Can add later if needed.

---

## UI Design

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Data Visualizer                                    [Refresh]     │
├──────────────────┬──────────────────────────────────────────────┤
│ Tables            │  Project (12 rows)              [Search...]  │
│ ─────────────     │  ───────────────────────────────────────────│
│ ► Project    12   │  id          projectName    siteLocation ... │
│   User       5   │  abc123      Modera...      Austin, TX       │
│   Invite     2   │  def456      Riverside...   Dallas, TX       │
│   Invite     0   │  ...                                         │
│   OfflinePref 0  │  ───────────────────────────────────────────│
│   DesignToken 1  │  Page 1 of 1  |  50 per page  [<] [>]        │
└──────────────────┴──────────────────────────────────────────────┘
```

### Components

1. **Table list (left sidebar)**
   - Click table name → load data
   - Show row count next to each
   - Highlight selected table

2. **Data grid (main area)**
   - Header row with column names (click to sort)
   - Data rows — one per DB row
   - Horizontal + vertical scroll for wide/tall data
   - Truncate long values (e.g. 80 chars) with tooltip for full value
   - Date columns: format as `YYYY-MM-DD` or `YYYY-MM-DD HH:mm`
   - Null/empty: show `—`

3. **Toolbar**
   - Search input (filters current table)
   - Refresh button
   - Pagination: page N of M, rows per page selector

4. **Empty states**
   - No table selected: "Select a table to view data"
   - Table has 0 rows: "No rows in this table"
   - Search returns 0: "No rows match your search"

---

## Technical Notes

- **Prisma**: Use `db.$queryRaw` with parameterized table name (validated against whitelist) for flexibility, or `db[model].findMany()` with a model map. Whitelist approach is safer.
- **Large tables**: Cap at 1000 rows per request; pagination required for larger tables.
- **JSON columns**: `upmData` etc. — display as truncated JSON string or "View" expandable. Keep it simple in v1: stringify and truncate.
- **Sensitive fields**: Never return `passwordHash` in full; show `***` or omit.

---

## File Changes

| File | Change |
|------|--------|
| `app/api/devtools/data/route.ts` | New — GET handler for table list + table data |
| `components/devtools/DataVisualizer.tsx` | New — main UI component |
| `components/devtools/DevToolsPanel.tsx` | Add "Data" tab, render DataVisualizer |

---

## Out of Scope (Future)

- Edit/delete rows
- Export to CSV
- Raw SQL runner
- Schema diff (already exists in Schema Diff tab)

---

## Acceptance Criteria

- [x] DevTools has a "Data" tab
- [x] Table list shows Project, User, Invite, OfflinePreference, DesignTokenSnapshot with counts
- [x] Selecting a table loads and displays rows in a grid
- [x] Search filters rows (server-side)
- [x] Column header click sorts (asc/desc)
- [x] Pagination works for tables with > 50 rows
- [x] Refresh reloads current table
- [x] Route returns 403 in production
- [x] `passwordHash` is never exposed
