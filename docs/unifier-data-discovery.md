# Unifier Data Discovery & API Setup

How to verify what data is available in the PDS API and add it to Command Center.

---

## 1. In Unifier Admin (Company Workspace)

### ER Views — Find Table Names

1. **Company Workspace** → **Admin mode**
2. **Data Structure Setup** → **ER Views**
3. Choose the relevant view:
   - **Shell Manager** — project shells (we use `UNIFIER_US_XPRJ`)
   - **Business Processes** — BP records; table name = `{prefix}_{BP_ID}` (e.g. `UNIFIER_UI` for Invoices)
   - **Document Manager** — document/attachment metadata
   - **Cost Manager**, **Schedule Manager**, etc. — other modules

4. Open a view and find the **table name** (shown in blue under the BP/entity name)
5. For line items, append `_LINEITEM` (e.g. `UNIFIER_UI_LINEITEM`)

### Integrations

- **Integrations** (left sidebar) — check REST/SOAP endpoints and PDS configuration
- PDS may need to be enabled via Oracle support or your contract

---

## 2. PDS Metadata API (Programmatic Discovery)

Command Center includes a dev-only endpoint to list tables and columns:

```bash
# List all PDS tables
curl "http://localhost:3000/api/devtools/unifier-metadata?tables=1"

# Get columns for a specific table
curl "http://localhost:3000/api/devtools/unifier-metadata?columns=UNIFIER_US_XPRJ"
```

Or open in a browser (with dev server running):

- `http://localhost:3000/api/devtools/unifier-metadata?tables=1`
- `http://localhost:3000/api/devtools/unifier-metadata?columns=UNIFIER_US_XPRJ`

**Response (tables):** `tableNames` — sorted list of `physicalTableName` values you can query.

**Response (columns):** Column metadata including `columnName`, `dataType`, `displayName`, etc.

---

## 3. Add New Data to Command Center

### Step 1: Identify Table & Columns

Use the metadata endpoint or ER Views to get:

- `tableName` (e.g. `UNIFIER_UXPT` for project team)
- Column names (exact codes, e.g. `PID`, `UUU_SHELL_STATUS`)

### Step 2: Add Types & Service Layer

1. **`lib/unifier/types.ts`** — Add raw interface and column list:

   ```ts
   export const UNIFIER_MY_TABLE_COLUMNS: string[] = ["ID", "NAME", "PROJECT_ID", ...];
   export interface UnifierMyTableRaw { ID: string; NAME: string | null; ... }
   export interface UnifierMyTable { id: string; name: string | null; ... }
   ```

2. **`lib/unifier/service.ts`** — Add fetcher and normalizer:

   ```ts
   export async function getMyTableData(): Promise<UnifierMyTable[]> {
     const raw = await fetchAllRows<UnifierMyTableRaw>("UNIFIER_MY_TABLE", UNIFIER_MY_TABLE_COLUMNS);
     return raw.map(normalizeMyTable);
   }
   ```

### Step 3: Wire to API & UI

- Add API route (e.g. `/api/unifier/my-data`) that calls the service
- Add UI component that fetches and displays the data

---

## 4. Current Command Center Unifier Usage

| Table            | Purpose                    | Service Method      |
|------------------|----------------------------|---------------------|
| UNIFIER_US_XPRJ  | Project shells (status, etc.) | `getProjects()`, `getProjectByPid()` |
| UNIFIER_UXPT     | Project team assignments   | `getProjectTeams()` |

---

## 5. PDS API Details

- **Endpoint:** `POST {UNIFIER_BASE_URL}/pds/rest-service/dataservice/runquery?configCode=ds_unifier`
- **Auth:** Basic (username:password)
- **Metadata tables:** `GET .../metadata/tables?configCode=ds_unifier`
- **Metadata columns:** `GET .../metadata/columns/{tableName}?configCode=ds_unifier`

PDS is read-only. For document downloads or write operations, use Unifier’s REST API (`/ws/rest/...`) instead.
