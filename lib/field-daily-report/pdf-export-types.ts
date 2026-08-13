import type { HubActivityPreviewLabelStrings } from "@/lib/field-daily-report/hub-activity-preview";

export interface FieldDailyReportPdfLabels {
  documentTitle: string;
  reportDateHeading: string;
  exportedAtHeading: string;
  filterHeading: string;
  projectsHeading: string;
  sectionProgress: string;
  sectionStatus: string;
  sectionTeamsOnSite: string;
  sectionSubcontractors: string;
  sectionInspections: string;
  sectionIssues: string;
  sectionObservations: string;
  sectionWorkforce: string;
  sectionOther: string;
  notesLabel: string;
  workforceDailyManpowerLabel: string;
  missingDailyManpowerAlert: string;
  workforceManpowerSummary: string;
  workforceDailyManpowerHeader: string;
  progressDeltaOnly: string;
  progressCurrentPct: string;
  progressUnavailable: string;
  noFieldActivity: string;
  generatedAt: string;
  confidentialFooter: string;
  locationProjectLevel: string;
  previewLabels: HubActivityPreviewLabelStrings;
}

export interface FieldDailyReportPdfMediaRef {
  storageUrl: string;
  storageKey?: string | null;
  mimeType: string;
  caption?: string | null;
}

/** Inline badge colors for PDF HTML (resolved hex — no app CSS in Puppeteer). */
export interface FieldDailyReportPdfBadgeStyle {
  backgroundColor: string;
  color: string;
}

export interface FieldDailyReportPdfDetailBlock {
  heading: string;
  lines: string[];
  images?: FieldDailyReportPdfMediaRef[];
}

export interface FieldDailyReportPdfGroupLine {
  text: string;
  /** Multi-line deficiency / notes rendered below the headline row. */
  detailLines?: string[];
  /** Per-question blocks with optional inline photos (inspections). */
  detailBlocks?: FieldDailyReportPdfDetailBlock[];
  images?: FieldDailyReportPdfMediaRef[];
}

export interface FieldDailyReportPdfListItem {
  headline: string;
  location?: string;
  subline?: string;
  /** Extra body lines (notes, type, scopes, etc.). */
  detailLines?: string[];
  images?: FieldDailyReportPdfMediaRef[];
}

export interface FieldDailyReportPdfGroup {
  heading: string;
  headingStyle?: FieldDailyReportPdfBadgeStyle;
  lines: FieldDailyReportPdfGroupLine[];
}

export interface FieldDailyReportPdfProgressDetail {
  delta?: string;
  pct?: string;
}

export interface FieldDailyReportPdfSection {
  title: string;
  note?: string;
  detailLines?: string[];
  /** Progress section only — delta in black, pct in green. */
  progressDetail?: FieldDailyReportPdfProgressDetail;
  groups: FieldDailyReportPdfGroup[];
  items: FieldDailyReportPdfListItem[];
}

export interface FieldDailyReportPdfProjectEntry {
  projectName: string;
  activitySummary: string;
  hasFieldActivity: boolean;
  reportDateDisplay?: string;
  exportedAtLabel?: string;
  generatedAtLabel?: string;
  progressNote?: string;
  workforceManpowerHeaderLabel?: string;
  workforceManpowerHeaderIsMissing?: boolean;
  missingDataAlerts?: string[];
  sections: FieldDailyReportPdfSection[];
  otherNote?: string;
}

export interface FieldDailyReportPdfPayload {
  locale: string;
  exportedAt: string;
  reportDate: string;
  reportDateDisplay: string;
  filterSummary: string;
  labels: FieldDailyReportPdfLabels;
  projects: FieldDailyReportPdfProjectEntry[];
}
