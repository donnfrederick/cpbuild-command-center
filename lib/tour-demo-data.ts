/**
 * Tour Demo Data — CP Build Field Tracker
 *
 * Defines a fully in-memory fake project used exclusively during the site tour.
 * No records are written to the database. The TOUR_DEMO_PROJECT_ID is a reserved
 * string that API routes and page components recognise to return this data instead
 * of querying Prisma.
 *
 * When the tour ends the data simply disappears — there is nothing to clean up.
 */

// ─── Reserved ID ────────────────────────────────────────────────────────────

export const TOUR_DEMO_PROJECT_ID = "tour-demo-project";

// ─── Fake project (matches enriched API `Project` shape) ────────────────────

export const TOUR_DEMO_PROJECT = {
  id: TOUR_DEMO_PROJECT_ID,
  projectName: "Menchaca Apt Complex",
  siteLocation: "Austin, TX",
  status: "Construction",
  lifecycleStatus: "Active" as const,
  startDate: "2024-03-01",
  installManagerId: null,
  installManagerName: "Maria Santos",
  projectManagerId: null,
  projectManagerName: "Alex Rivera",
  unifierPid: "TOUR-001",
  unifierProjectNumber: "UP-2024-789",
  scopeTypes: [] as string[],
  isTestProject: false,
  clonedFromProjectId: null,
  clonedFromProjectName: null,
  clonedAt: null,
};

// ─── Fake Unifier project (shown in the Create Project modal search results) ─

export const TOUR_DEMO_UNIFIER_PROJECT = {
  pid: "TOUR-001",
  projectName: "Menchaca Apt Complex",
  projectNumber: "UP-2024-789",
  location: "7200 S Menchaca Rd, Austin, TX 78745",
  address: "7200 S Menchaca Rd, Austin, TX 78745",
  shellStatus: "Active",
  status: "Construction",
  projectPhase: "Construction",
  projectManagerName: "Alex Rivera",
  clientName: "Menchaca Development LLC",
};

// ─── Fake UPM rows (shown in the Field Tracker units page) ──────────────────
// 15 rows across three buildings — mix of scope stages and statuses.

export const TOUR_DEMO_UNITS = [
  { id: "tdrow-01", rowIndex: 0,  building: "A", level: "1", unit: "101", area: "790",  shipPhase: null, buildPhase: null, scheme: null, unitType: "1BR",   description: "1 Bedroom / 1 Bath", scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null, costType: null, installer: null, qty: 1, uom: null, unitRate: null, budgetedManHours: 40,  startDate: "2024-03-15", finishDate: "2024-04-30", percentComplete: 100, actualManHours: 38,  scopeStage: "INSTALL",  scopeStatus: "COMPLETE",  inspectionStatus: "PASSED" },
  { id: "tdrow-02", rowIndex: 1,  building: "A", level: "1", unit: "102", area: "1040", shipPhase: null, buildPhase: null, scheme: null, unitType: "2BR",   description: "2 Bedroom / 2 Bath", scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null, costType: null, installer: null, qty: 1, uom: null, unitRate: null, budgetedManHours: 60,  startDate: "2024-03-15", finishDate: "2024-05-10", percentComplete: 100, actualManHours: 62,  scopeStage: "INSTALL",  scopeStatus: "COMPLETE",  inspectionStatus: "PASSED" },
  { id: "tdrow-03", rowIndex: 2,  building: "A", level: "2", unit: "201", area: "790",  shipPhase: null, buildPhase: null, scheme: null, unitType: "1BR",   description: "1 Bedroom / 1 Bath", scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null, costType: null, installer: null, qty: 1, uom: null, unitRate: null, budgetedManHours: 40,  startDate: "2024-04-01", finishDate: "2024-05-15", percentComplete: 85,  actualManHours: 34,  scopeStage: "INSTALL",  scopeStatus: "IN_PROGRESS", inspectionStatus: null },
  { id: "tdrow-04", rowIndex: 3,  building: "A", level: "2", unit: "202", area: "1040", shipPhase: null, buildPhase: null, scheme: null, unitType: "2BR",   description: "2 Bedroom / 2 Bath", scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null, costType: null, installer: null, qty: 1, uom: null, unitRate: null, budgetedManHours: 60,  startDate: "2024-04-01", finishDate: "2024-05-20", percentComplete: 70,  actualManHours: 42,  scopeStage: "INSTALL",  scopeStatus: "IN_PROGRESS", inspectionStatus: null },
  { id: "tdrow-05", rowIndex: 4,  building: "A", level: "3", unit: "301", area: "790",  shipPhase: null, buildPhase: null, scheme: null, unitType: "1BR",   description: "1 Bedroom / 1 Bath", scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null, costType: null, installer: null, qty: 1, uom: null, unitRate: null, budgetedManHours: 40,  startDate: "2024-05-01", finishDate: "2024-06-10", percentComplete: 0,   actualManHours: 0,   scopeStage: "ASSEMBLY", scopeStatus: "NOT_STARTED", inspectionStatus: null },
  { id: "tdrow-06", rowIndex: 5,  building: "B", level: "1", unit: "101", area: "810",  shipPhase: null, buildPhase: null, scheme: null, unitType: "1BR",   description: "1 Bedroom / 1 Bath", scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null, costType: null, installer: null, qty: 1, uom: null, unitRate: null, budgetedManHours: 42,  startDate: "2024-03-20", finishDate: "2024-05-05", percentComplete: 100, actualManHours: 40,  scopeStage: "INSTALL",  scopeStatus: "COMPLETE",  inspectionStatus: "READY" },
  { id: "tdrow-07", rowIndex: 6,  building: "B", level: "1", unit: "102", area: "1060", shipPhase: null, buildPhase: null, scheme: null, unitType: "2BR",   description: "2 Bedroom / 2 Bath", scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null, costType: null, installer: null, qty: 1, uom: null, unitRate: null, budgetedManHours: 62,  startDate: "2024-03-20", finishDate: "2024-05-15", percentComplete: 90,  actualManHours: 56,  scopeStage: "INSTALL",  scopeStatus: "IN_PROGRESS", inspectionStatus: null },
  { id: "tdrow-08", rowIndex: 7,  building: "B", level: "2", unit: "201", area: "810",  shipPhase: null, buildPhase: null, scheme: null, unitType: "1BR",   description: "1 Bedroom / 1 Bath", scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null, costType: null, installer: null, qty: 1, uom: null, unitRate: null, budgetedManHours: 42,  startDate: "2024-04-15", finishDate: "2024-05-30", percentComplete: 55,  actualManHours: 23,  scopeStage: "ASSEMBLY", scopeStatus: "IN_PROGRESS", inspectionStatus: null },
  { id: "tdrow-09", rowIndex: 8,  building: "B", level: "2", unit: "202", area: "1060", shipPhase: null, buildPhase: null, scheme: null, unitType: "2BR",   description: "2 Bedroom / 2 Bath", scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null, costType: null, installer: null, qty: 1, uom: null, unitRate: null, budgetedManHours: 62,  startDate: "2024-04-15", finishDate: "2024-06-01", percentComplete: 40,  actualManHours: 25,  scopeStage: "ASSEMBLY", scopeStatus: "IN_PROGRESS", inspectionStatus: null },
  { id: "tdrow-10", rowIndex: 9,  building: "B", level: "3", unit: "301", area: "810",  shipPhase: null, buildPhase: null, scheme: null, unitType: "1BR",   description: "1 Bedroom / 1 Bath", scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null, costType: null, installer: null, qty: 1, uom: null, unitRate: null, budgetedManHours: 42,  startDate: "2024-05-15", finishDate: "2024-06-30", percentComplete: 0,   actualManHours: 0,   scopeStage: "STAGING",  scopeStatus: "NOT_STARTED", inspectionStatus: null },
  { id: "tdrow-11", rowIndex: 10, building: "C", level: "1", unit: "101", area: "795",  shipPhase: null, buildPhase: null, scheme: null, unitType: "1BR",   description: "1 Bedroom / 1 Bath", scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null, costType: null, installer: null, qty: 1, uom: null, unitRate: null, budgetedManHours: 40,  startDate: "2024-04-10", finishDate: "2024-05-25", percentComplete: 75,  actualManHours: 30,  scopeStage: "INSTALL",  scopeStatus: "IN_PROGRESS", inspectionStatus: null },
  { id: "tdrow-12", rowIndex: 11, building: "C", level: "1", unit: "102", area: "1050", shipPhase: null, buildPhase: null, scheme: null, unitType: "2BR",   description: "2 Bedroom / 2 Bath", scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null, costType: null, installer: null, qty: 1, uom: null, unitRate: null, budgetedManHours: 60,  startDate: "2024-04-10", finishDate: "2024-06-01", percentComplete: 60,  actualManHours: 36,  scopeStage: "INSTALL",  scopeStatus: "IN_PROGRESS", inspectionStatus: null },
  { id: "tdrow-13", rowIndex: 12, building: "C", level: "2", unit: "201", area: "795",  shipPhase: null, buildPhase: null, scheme: null, unitType: "1BR",   description: "1 Bedroom / 1 Bath", scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null, costType: null, installer: null, qty: 1, uom: null, unitRate: null, budgetedManHours: 40,  startDate: "2024-05-01", finishDate: "2024-06-15", percentComplete: 20,  actualManHours: 8,   scopeStage: "ASSEMBLY", scopeStatus: "IN_PROGRESS", inspectionStatus: null },
  { id: "tdrow-14", rowIndex: 13, building: "C", level: "2", unit: "202", area: "1050", shipPhase: null, buildPhase: null, scheme: null, unitType: "2BR",   description: "2 Bedroom / 2 Bath", scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null, costType: null, installer: null, qty: 1, uom: null, unitRate: null, budgetedManHours: 60,  startDate: "2024-05-01", finishDate: "2024-06-20", percentComplete: 10,  actualManHours: 6,   scopeStage: "STAGING",  scopeStatus: "IN_PROGRESS", inspectionStatus: null },
  { id: "tdrow-15", rowIndex: 14, building: "C", level: "3", unit: "301", area: "795",  shipPhase: null, buildPhase: null, scheme: null, unitType: "1BR",   description: "1 Bedroom / 1 Bath", scopeType: null, csiPrimeCode: null, csiDetailCode: null, locationType: null, costType: null, installer: null, qty: 1, uom: null, unitRate: null, budgetedManHours: 40,  startDate: "2024-06-01", finishDate: "2024-07-15", percentComplete: 0,   actualManHours: 0,   scopeStage: "STAGING",  scopeStatus: "NOT_STARTED", inspectionStatus: null },
];

// ─── Demo UPM data in spreadsheet format (for tour wizard simulation) ────────
// Used by CreateProjectModal when `tour:inject-and-create` fires.

export const TOUR_DEMO_UPM_HEADERS = [
  "Building", "Level", "Unit", "Area (SF)", "Unit Type", "Description", "QTY",
];

export interface UpmSpreadsheetRow {
  [key: string]: string;
  Building: string;
  Level: string;
  Unit: string;
  "Area (SF)": string;
  "Unit Type": string;
  Description: string;
  QTY: string;
}

export const TOUR_DEMO_UPM_ROWS: UpmSpreadsheetRow[] = TOUR_DEMO_UNITS.map((u) => ({
  "Building": u.building,
  "Level": u.level,
  "Unit": u.unit,
  "Area (SF)": u.area ?? "",
  "Unit Type": u.unitType ?? "",
  "Description": u.description ?? "",
  "QTY": String(u.qty ?? 1),
}));
