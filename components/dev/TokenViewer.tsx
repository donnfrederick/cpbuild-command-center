"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

// ── Component data ─────────────────────────────────────────────────────────

const COMPONENT_LIBRARY = [
  {
    group: "Core UI Primitives",
    items: [
      { name: "Button", path: "components/ui/button.tsx", use: "Primary, secondary, ghost, destructive, and icon button primitive. Buttons never use decorative glow or shadow.", tokens: "--color-accent, --color-text-inverse, --radius-md, --tracking-ui" },
      { name: "Badge", path: "components/ui/badge.tsx", use: "Small status/category pill primitive for labels, metadata, and lightweight state display.", tokens: "--color-surface-sunken, --color-accent-subtle, --color-error-subtle, --radius-pill" },
      { name: "Card", path: "components/shared/Card.tsx", use: "Shared no-stroke card wrapper for app surfaces. Use instead of hand-built card divs when possible.", tokens: "--color-surface, --radius-lg, --shadow-card, --card-padding" },
      { name: "SearchInput", path: "components/shared/SearchInput.tsx", use: "Shared pill search input with surface/canvas/dark variants for correct contrast.", tokens: "--control-*, --radius-pill, --focus-ring" },
      { name: "StatusBadge", path: "components/shared/StatusBadge.tsx", use: "Project lifecycle/phase pill. Construction phases use secondary blue, completed/closeout uses neutral.", tokens: "--color-secondary-subtle, --color-secondary-hover, --color-surface-sunken" },
      { name: "Skeleton", path: "components/ui/skeleton.tsx", use: "Loading placeholder primitive.", tokens: "--color-surface-sunken" },
      { name: "Input", path: "components/ui/input.tsx", use: "Base shadcn input primitive used by forms and dialogs.", tokens: "--input, --ring, --radius-md" },
      { name: "Dialog", path: "components/ui/dialog.tsx", use: "Base dialog primitive for modal flows.", tokens: "--color-surface, --shadow-modal, --radius-lg" },
    ],
  },
  {
    group: "Navigation & Shell",
    items: [
      { name: "SideNav", path: "components/layout/SideNav.tsx", use: "Global desktop navigation for projects, activity, forms, users.", tokens: "--color-surface, --color-accent, --color-accent-subtle, --tracking-ui" },
      { name: "ProjectSideNav", path: "components/projects/ProjectSideNav.tsx", use: "Project-scoped desktop navigation plus Exit Project behavior.", tokens: "--color-surface, --color-accent, --color-divider" },
      { name: "MobileBottomNav", path: "components/layout/MobileBottomNav.tsx", use: "Global mobile bottom navigation. Feedback intentionally excluded.", tokens: "--color-surface, --color-accent, --shadow-nav, --radius-pill" },
      { name: "ProjectMobileBottomNav", path: "components/projects/ProjectMobileBottomNav.tsx", use: "Project-scoped mobile bottom nav on dark navy pill. Active state uses fill only, no glow.", tokens: "--color-surface-dark, --color-accent, --color-text-inverse, --radius-pill" },
      { name: "ProjectTopBar", path: "components/projects/ProjectTopBar.tsx", use: "Dark navy project header that must match project mobile bottom nav color.", tokens: "--color-surface-dark, --top-bar-height" },
      { name: "TopBar", path: "components/layout/TopBar.tsx", use: "Global top bar for dashboard shell.", tokens: "--top-bar-height, --color-surface" },
      { name: "AccountMenu", path: "components/layout/AccountMenu.tsx", use: "Desktop account dropdown/menu.", tokens: "--color-surface, --color-divider, --color-accent" },
      { name: "MobileAccountPanel", path: "components/layout/MobileAccountPanel.tsx", use: "Mobile account drawer with notifications, feedback, profile, language, tour, dev tools, and logout flows.", tokens: "--color-surface, --shadow-modal, --color-divider, --color-accent-subtle" },
      { name: "LocaleSwitcher", path: "components/layout/LocaleSwitcher.tsx", use: "EN/ES language toggle inside account surfaces.", tokens: "--color-accent-subtle, --color-accent, --tracking-ui" },
    ],
  },
  {
    group: "Primary Create CTAs",
    items: [
      { name: "+ New Project CTA", path: "components/projects/ProjectsPageClient.tsx", use: "Project page create action. Capitalized create label format.", tokens: "--color-accent, --color-text-inverse, --radius-md, --tracking-ui" },
      { name: "+ New Form CTA", path: "components/forms/FormsPageClient.tsx", use: "Forms page and forms empty-state create action. Capitalized create label format.", tokens: "--color-accent, --color-text-inverse, --radius-md, --tracking-ui" },
      { name: "+ New User CTA", path: "components/team/InviteModal.tsx", use: "Users page invite/create-user action. Capitalized create label format.", tokens: "--color-accent, --radius-md, --tracking-ui" },
    ],
  },
  {
    group: "Project Surfaces",
    items: [
      { name: "Project summary card", path: "app/[locale]/(project)/projects/[id]/page.tsx", use: "Top project hub summary with title, status, manager assignment, stats, project number, start date.", tokens: "--project-summary-*, --shadow-card, --radius-3xl" },
      { name: "ProjectsTable mobile card", path: "components/projects/ProjectsTable.tsx", use: "Mobile project card for the projects list with scope chips, IM/PM avatars, status, and offline action.", tokens: "--color-surface, --shadow-card, --color-secondary, --color-surface-dark" },
      { name: "ProjectsTable desktop table", path: "components/projects/ProjectsTable.tsx", use: "Desktop projects table with sticky project column, sortable headers, filters, and offline actions.", tokens: "--color-surface, --shadow-card, --color-divider" },
      { name: "ProjectDocuments", path: "components/projects/ProjectDocuments.tsx", use: "Unifier documents/offline data/project info cards on project overview.", tokens: "--color-surface, --shadow-card, --radius-lg" },
      { name: "ProjectOfflineCacheSection", path: "components/projects/ProjectOfflineCacheSection.tsx", use: "Project offline cache status and controls.", tokens: "--color-surface, --shadow-card, --color-accent" },
      { name: "ProjectOverviewStats", path: "components/projects/ProjectOverviewStats.tsx", use: "Overview stat dashboard and inspection summary blocks.", tokens: "--color-surface, --shadow-card, --color-success" },
      { name: "LevelScopeReportModal", path: "components/projects/LevelScopeReportModal.tsx", use: "Project level/scope report modal and trigger.", tokens: "--color-surface, --shadow-modal, --color-divider" },
    ],
  },
  {
    group: "Location / Unit Workflow",
    items: [
      { name: "UnitCards", path: "components/projects/UnitCards.tsx", use: "Main locations grid/list, filters, status controls, grouped building/level sections, and mobile unit detail modal.", tokens: "--unit-grid-card-*, --scope-tile-*, --building-*" },
      { name: "UnitsPageClient", path: "components/projects/UnitsPageClient.tsx", use: "Locations page shell that coordinates search, filters, view mode, deep links, and unit detail flows.", tokens: "--control-*, --page-padding-x, --section-gap" },
      { name: "ScopeStatusSquare", path: "components/projects/ScopeStatusSquare.tsx", use: "Compact scope status tile with icon above abbreviation.", tokens: "--scope-tile-*" },
      { name: "SubcontractorPicker", path: "components/projects/SubcontractorPicker.tsx", use: "Inline subcontractor assignment picker with searchable sheet/dropdown.", tokens: "--color-surface, --color-divider, --color-accent" },
      { name: "BulkActionsSheet", path: "components/projects/BulkActionsSheet.tsx", use: "Bulk unit/scope status actions in bottom sheet/side sheet.", tokens: "--color-surface, --shadow-modal, --color-divider" },
      { name: "BulkActionsBar", path: "components/projects/BulkActionsBar.tsx", use: "Bulk action toolbar for selected locations/scopes.", tokens: "--color-surface, --color-accent" },
      { name: "OfflineProjectButton", path: "components/projects/OfflineProjectButton.tsx", use: "Per-project pre-download/offline cache action.", tokens: "--control-*, --radius-md" },
    ],
  },
  {
    group: "Issue / Observation / Media Flows",
    items: [
      { name: "AddIssueModal", path: "components/projects/AddIssueModal.tsx", use: "Unit-level issue creation flow.", tokens: "--color-surface, --color-error, --color-accent" },
      { name: "AddObservationModal", path: "components/projects/AddObservationModal.tsx", use: "Unit-level observation creation flow.", tokens: "--color-surface, --color-accent" },
      { name: "AddLocationIssueModal", path: "components/projects/AddLocationIssueModal.tsx", use: "Location-level issue creation flow.", tokens: "--color-surface, --color-error, --color-accent" },
      { name: "AddLocationObservationModal", path: "components/projects/AddLocationObservationModal.tsx", use: "Location-level observation creation flow.", tokens: "--color-surface, --color-accent" },
      { name: "IssueDetailModal", path: "components/projects/IssueDetailModal.tsx", use: "Issue detail, resolve/reopen, comments, media.", tokens: "--color-surface, --shadow-modal, --color-error" },
      { name: "ObservationDetailModal", path: "components/projects/ObservationDetailModal.tsx", use: "Observation detail, comments, media.", tokens: "--color-surface, --shadow-modal" },
      { name: "CommentThread", path: "components/projects/CommentThread.tsx", use: "Reusable threaded comments for project entities.", tokens: "--color-surface-sunken, --color-divider" },
      { name: "CameraCapture", path: "components/projects/CameraCapture.tsx", use: "Camera/photo capture control for field workflows.", tokens: "--color-surface, --color-accent" },
      { name: "ImageAnnotationEditor", path: "components/projects/ImageAnnotationEditor.tsx", use: "Annotate project images before submit.", tokens: "--color-accent, --color-surface" },
      { name: "MediaWithOfflineFallback", path: "components/projects/MediaWithOfflineFallback.tsx", use: "Media renderer that gracefully handles cached/offline assets.", tokens: "--color-surface-sunken" },
    ],
  },
  {
    group: "Forms / Inspection Builder",
    items: [
      { name: "FormsPageClient", path: "components/forms/FormsPageClient.tsx", use: "Forms listing page, search, empty state, cards, create/edit/preview actions.", tokens: "--color-surface, --shadow-card, --control-*" },
      { name: "FormSetupModal", path: "components/forms/FormSetupModal.tsx", use: "Create/edit setup gate for form category, level, and scope types.", tokens: "--color-surface, --shadow-modal, --color-accent" },
      { name: "FormBuilderClient", path: "components/forms/FormBuilderClient.tsx", use: "Form builder shell, topbar, publish actions, setup summary, and question canvas.", tokens: "--form-builder-*, --color-accent, --color-surface-dark" },
      { name: "FormSectionBlock", path: "components/forms/FormSectionBlock.tsx", use: "Builder section card with section tab, title/description, question list, and secondary add question action.", tokens: "--form-builder-section-tab-bg, --shadow-card, --color-accent-subtle" },
      { name: "FormQuestionRow", path: "components/forms/FormQuestionRow.tsx", use: "Builder question card, type picker, response previews, deficiency flow, severity pills, drag/drop.", tokens: "--form-response-*, --form-deficiency-*, --form-severity-*" },
      { name: "FormFillClient", path: "components/forms/FormFillClient.tsx", use: "Runtime form fill/inspection response experience.", tokens: "--form-response-*, --color-surface, --color-accent" },
    ],
  },
  {
    group: "Feedback / Notifications / Tour",
    items: [
      { name: "FeedbackFormInline", path: "components/feedback/FeedbackFormInline.tsx", use: "Inline feedback submission form embedded in mobile account drawer.", tokens: "--control-bg, --color-accent, --color-error" },
      { name: "FeedbackModal", path: "components/feedback/FeedbackModal.tsx", use: "Full feedback modal with screenshot/screen recording flow.", tokens: "--color-surface, --shadow-modal, --color-accent" },
      { name: "FeedbackInbox", path: "components/feedback/FeedbackInbox.tsx", use: "Feedback triage inbox.", tokens: "--color-surface, --control-*, --status colors" },
      { name: "NotificationCard", path: "components/notifications/NotificationCard.tsx", use: "Notification list row for mentions, feedback status, and assignment notifications.", tokens: "--color-divider, --color-accent-subtle, --color-accent" },
      { name: "NotificationBell", path: "components/notifications/NotificationBell.tsx", use: "Desktop notification dropdown.", tokens: "--color-surface, --shadow-modal, --color-error" },
      { name: "TourPicker", path: "components/tour/TourPicker.tsx", use: "Tour selection drawer opened from account/topbar flows.", tokens: "--color-surface, --shadow-modal, --control-*" },
      { name: "TourPlayer", path: "components/tour/TourPlayer.tsx", use: "Guided tour player overlay.", tokens: "--color-surface, --shadow-modal" },
    ],
  },
  {
    group: "Users / Account / Banners",
    items: [
      { name: "UsersView", path: "components/users/UsersView.tsx", use: "Users page, member rows, pending invites, role/status/special permission panels.", tokens: "--color-surface, --shadow-card, --color-accent" },
      { name: "InviteModal", path: "components/team/InviteModal.tsx", use: "+ New User invite flow.", tokens: "--color-accent, --radius-md, --tracking-ui" },
      { name: "GenerateResetLinkModal", path: "components/users/GenerateResetLinkModal.tsx", use: "Admin password reset link generation.", tokens: "--color-surface, --shadow-modal" },
      { name: "MasqueradeBanner", path: "components/shared/MasqueradeBanner.tsx", use: "Global impersonation warning banner.", tokens: "--color-warning-subtle, --color-warning" },
      { name: "RolePreviewBanner", path: "components/shared/RolePreviewBanner.tsx", use: "Global role-preview warning banner.", tokens: "--color-warning-subtle, --color-warning" },
      { name: "OfflineIndicator", path: "components/shared/OfflineIndicator.tsx", use: "Global online/offline and queued sync indicator.", tokens: "--color-surface, --shadow-nav, --color-success, --color-warning" },
      { name: "OfflineCacheBanner", path: "components/shared/OfflineCacheBanner.tsx", use: "Banner for cached/offline data context.", tokens: "--color-warning-subtle, --color-warning" },
    ],
  },
] as const;

type ComponentItem = (typeof COMPONENT_LIBRARY)[number]["items"][number];

interface TokenEntry {
  token: string;
  authoredValue: string;
  computedValue: string;
  resolvedValue: string;
}

function resolveCssValue(value: string, computed: CSSStyleDeclaration, seen = new Set<string>()): string {
  return value
    .replace(/var\((--[\w-]+)(?:,[^)]+)?\)/g, (_match, tokenName: string) => {
      if (seen.has(tokenName)) return "";
      seen.add(tokenName);
      const nextValue = computed.getPropertyValue(tokenName).trim();
      return nextValue ? resolveCssValue(nextValue, computed, seen) : "";
    })
    .trim();
}

function collectRootTokens(): TokenEntry[] {
  const authored = new Map<string, string>();
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      if (!rule.selectorText.split(",").map((s) => s.trim()).includes(":root")) continue;
      for (let i = 0; i < rule.style.length; i += 1) {
        const prop = rule.style.item(i);
        if (prop.startsWith("--")) authored.set(prop, rule.style.getPropertyValue(prop).trim());
      }
    }
  }

  const computed = getComputedStyle(document.documentElement);
  return Array.from(authored.entries())
    .map(([token, authoredValue]) => {
      const computedValue = computed.getPropertyValue(token).trim() || authoredValue;
      return {
        token,
        authoredValue,
        computedValue,
        resolvedValue: resolveCssValue(computedValue, computed) || computedValue,
      };
    })
    .sort((a, b) => a.token.localeCompare(b.token));
}

function tokenGroup(token: string): string {
  if (token.startsWith("--color-")) return "Semantic Colors";
  if (/^--(orange|blue|neutral|green|amber|red|violet)-/.test(token)) return "Primitive Color Scales";
  if (/^--(primary|secondary|success|warning|error)-/.test(token)) return "Legacy Aliases";
  if (token.startsWith("--control-")) return "Controls";
  if (token.startsWith("--form-")) return "Form Builder & Inspection";
  if (token.startsWith("--project-summary-")) return "Project Summary";
  if (token.startsWith("--text-")) return "Type Scale";
  if (token.startsWith("--font-weight-")) return "Font Weights";
  if (token.startsWith("--tracking-")) return "Letter Spacing";
  if (token.startsWith("--space-")) return "Spacing";
  if (token.startsWith("--radius-")) return "Radius";
  if (token.startsWith("--shadow-")) return "Shadows";
  if (token.startsWith("--focus-")) return "Focus";
  if (token.startsWith("--button-") || token.startsWith("--input-") || token.startsWith("--nav-") || token.startsWith("--top-bar-") || token.startsWith("--icon-") || token.startsWith("--badge-")) return "Component Dimensions";
  if (token.startsWith("--page-") || token.startsWith("--section-") || token.startsWith("--component-") || token.startsWith("--card-") || token.startsWith("--inline-") || token.startsWith("--min-touch") || token.startsWith("--content-")) return "Layout";
  if (token.startsWith("--dev-")) return "Dev Tools";
  if (token.startsWith("--background") || token.startsWith("--foreground") || token.startsWith("--card") || token.startsWith("--popover") || token.startsWith("--primary") || token.startsWith("--secondary") || token.startsWith("--muted") || token.startsWith("--accent") || token.startsWith("--destructive") || token.startsWith("--border") || token.startsWith("--input") || token.startsWith("--ring") || token.startsWith("--chart") || token.startsWith("--sidebar")) return "Shadcn Bridge";
  return "Other";
}

function looksLikeColor(value: string): boolean {
  return /^(#|rgb|rgba|hsl|hsla|oklch|color-mix)/i.test(value);
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.10em",
      textTransform: "uppercase",
      color: "var(--color-text-disabled)",
      margin: "20px 0 8px",
    }}>
      {children}
    </p>
  );
}

function TokenLibraryRow({ entry }: { entry: TokenEntry }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(`var(${entry.token})`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  const previewValue = entry.resolvedValue || entry.computedValue || entry.authoredValue;
  const isColor = looksLikeColor(previewValue);
  const isShadow = entry.token.startsWith("--shadow-");
  const isRadius = entry.token.startsWith("--radius-");
  const isSpace = entry.token.startsWith("--space-");

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy var(${entry.token})`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 0",
        background: "none",
        border: "none",
        borderBottom: "1px solid var(--color-divider)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span
        style={{
          width: 34,
          height: 24,
          borderRadius: isRadius ? previewValue : "var(--radius-sm)",
          backgroundColor: isColor ? previewValue : isShadow ? "var(--color-surface)" : "var(--color-surface-sunken)",
          boxShadow: isShadow ? previewValue : "none",
          border: "1px solid var(--color-divider)",
          flexShrink: 0,
        }}
      >
        {isSpace && (
          <span
            style={{
              display: "block",
              width: previewValue,
              maxWidth: 32,
              height: "100%",
              backgroundColor: "var(--color-accent-subtle)",
              borderRadius: "var(--radius-sm)",
            }}
          />
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "monospace" }}>
          {copied ? "Copied!" : entry.token}
        </span>
        <span style={{ display: "block", fontSize: 10, color: "var(--color-text-tertiary)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {entry.authoredValue}
        </span>
      </span>
      <span style={{ maxWidth: 96, fontSize: 10, color: "var(--color-text-tertiary)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
        {previewValue}
      </span>
    </button>
  );
}

function MiniLine({ width = "100%", color = "var(--color-surface-sunken)", height = 8 }: { width?: string | number; color?: string; height?: number }) {
  return <span style={{ display: "block", width, height, borderRadius: "var(--radius-pill)", backgroundColor: color }} />;
}

function MiniPill({ children, color = "var(--color-accent)", bg = "var(--color-accent-subtle)" }: { children: React.ReactNode; color?: string; bg?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: "var(--radius-pill)", backgroundColor: bg, color, fontSize: 9, fontWeight: 800, letterSpacing: "var(--tracking-ui)", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function MiniButton({ children = "+ add", muted = false }: { children?: React.ReactNode; muted?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 28, padding: "0 10px", borderRadius: "var(--radius-md)", backgroundColor: muted ? "var(--color-surface-sunken)" : "var(--color-accent)", color: muted ? "var(--color-text-secondary)" : "var(--color-text-inverse)", fontSize: 10, fontWeight: 800, letterSpacing: "var(--tracking-ui)" }}>
      {children}
    </span>
  );
}

function MiniCard({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div style={{ borderRadius: "var(--radius-lg)", backgroundColor: dark ? "var(--color-surface-dark)" : "var(--color-surface)", boxShadow: "var(--shadow-card)", padding: 10, color: dark ? "var(--color-text-inverse)" : "var(--color-text-primary)" }}>
      {children}
    </div>
  );
}

function ComponentPreview({ item }: { item: ComponentItem }) {
  switch (item.name) {
    case "Button":
      return <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><MiniButton>Primary</MiniButton><MiniButton muted>Ghost</MiniButton><span style={{ width: 28, height: 28, borderRadius: "var(--radius-md)", backgroundColor: "var(--color-error-subtle)", color: "var(--color-error)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>!</span></div>;
    case "Badge":
      return <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}><MiniPill>Active</MiniPill><MiniPill bg="var(--color-secondary-subtle)" color="var(--color-secondary-hover)">Phase</MiniPill><MiniPill bg="var(--color-error-subtle)" color="var(--color-error)">Issue</MiniPill></div>;
    case "Card":
      return <MiniCard><MiniLine width="45%" color="var(--color-text-primary)" /><div style={{ height: 8 }} /><MiniLine /><div style={{ height: 6 }} /><MiniLine width="70%" /></MiniCard>;
    case "SearchInput":
      return <div style={{ display: "grid", gap: 8 }}><span style={{ height: 30, borderRadius: "var(--radius-pill)", backgroundColor: "var(--control-bg)", color: "var(--control-placeholder)", display: "flex", alignItems: "center", padding: "0 12px", fontSize: 10 }}>Search projects...</span><span style={{ height: 30, borderRadius: "var(--radius-pill)", backgroundColor: "var(--control-dark-bg)", color: "var(--control-dark-placeholder)", display: "flex", alignItems: "center", padding: "0 12px", fontSize: 10 }}>Dark search...</span></div>;
    case "StatusBadge":
      return <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}><MiniPill bg="var(--color-surface-sunken)" color="var(--color-text-secondary)">Closeout</MiniPill><MiniPill bg="var(--color-secondary-subtle)" color="var(--color-secondary-hover)">Construction</MiniPill></div>;
    case "Skeleton":
      return <div style={{ display: "grid", gap: 8 }}><MiniLine width="80%" /><MiniLine /><MiniLine width="55%" /></div>;
    case "Input":
      return <div style={{ display: "grid", gap: 8 }}><span style={{ height: 36, borderRadius: "var(--radius-md)", backgroundColor: "var(--color-surface)", boxShadow: "inset 0 0 0 1px var(--color-divider)", display: "flex", alignItems: "center", padding: "0 10px", color: "var(--color-text-tertiary)", fontSize: 10 }}>Text field</span><span style={{ height: 36, borderRadius: "var(--radius-md)", backgroundColor: "var(--color-surface)", boxShadow: "var(--focus-ring)", display: "flex", alignItems: "center", padding: "0 10px", color: "var(--color-text-primary)", fontSize: 10 }}>Focused</span></div>;
    case "Dialog":
      return <div style={{ display: "flex", justifyContent: "center" }}><span style={{ width: 118, borderRadius: "var(--radius-lg)", backgroundColor: "var(--color-surface)", boxShadow: "var(--shadow-modal)", padding: 10, display: "grid", gap: 7 }}><MiniLine width="45%" color="var(--color-text-primary)" /><MiniLine /><MiniLine width="75%" /><span style={{ justifySelf: "end" }}><MiniButton>Save</MiniButton></span></span></div>;
    case "SideNav":
      return <div style={{ width: 82, height: 92, borderRadius: "var(--radius-lg)", backgroundColor: "var(--color-surface)", boxShadow: "var(--shadow-card)", padding: 10, display: "grid", gap: 7 }}><MiniLine width="62%" color="var(--color-text-primary)" /><MiniLine color="var(--color-accent)" /><MiniLine width="76%" /><MiniLine width="66%" /></div>;
    case "ProjectSideNav":
      return <div style={{ width: 92, height: 96, borderRadius: "var(--radius-lg)", backgroundColor: "var(--color-surface)", boxShadow: "var(--shadow-card)", padding: 9, display: "grid", gap: 6 }}><MiniLine width="74%" color="var(--color-text-primary)" /><MiniPill>Exit Project</MiniPill><MiniLine color="var(--color-secondary-subtle)" /><MiniLine width="70%" /></div>;
    case "MobileBottomNav":
      return <div style={{ height: 48, borderRadius: "var(--radius-pill)", backgroundColor: "var(--color-surface)", boxShadow: "var(--shadow-nav)", display: "flex", alignItems: "center", justifyContent: "space-around", padding: "0 10px" }}>{[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 22, height: 22, borderRadius: "var(--radius-pill)", backgroundColor: i === 0 ? "var(--color-accent-subtle)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: i === 0 ? "var(--color-accent)" : "var(--color-text-disabled)" }} /></span>)}</div>;
    case "ProjectMobileBottomNav":
      return <div style={{ height: 48, borderRadius: "var(--radius-pill)", backgroundColor: "var(--color-surface-dark)", display: "flex", alignItems: "center", justifyContent: "space-around", padding: "0 10px" }}>{[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 22, height: 22, borderRadius: "var(--radius-pill)", backgroundColor: i === 0 ? "var(--color-accent)" : "transparent" }} />)}</div>;
    case "ProjectTopBar":
      return <div style={{ height: 48, backgroundColor: "var(--color-surface-dark)", color: "var(--color-text-inverse)", display: "grid", gridTemplateColumns: "28px 1fr 28px", alignItems: "center", gap: 8, padding: "0 8px" }}><span style={{ fontSize: 16 }}>‹</span><MiniLine color="rgba(255,255,255,0.9)" /><span style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.16)" }} /></div>;
    case "TopBar":
      return <div style={{ height: 48, backgroundColor: "var(--color-surface)", display: "grid", gridTemplateColumns: "1fr 28px", alignItems: "center", gap: 8, padding: "0 10px", boxShadow: "var(--shadow-card)" }}><MiniLine width="70%" color="var(--color-text-primary)" /><span style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: "var(--color-surface-sunken)" }} /></div>;
    case "AccountMenu":
      return <MiniCard><div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 28, height: 28, borderRadius: "50%", backgroundColor: "var(--color-accent)" }} /><div style={{ flex: 1 }}><MiniLine width="65%" color="var(--color-text-primary)" /><div style={{ height: 5 }} /><MiniLine /></div></div></MiniCard>;
    case "MobileAccountPanel":
      return <div style={{ width: 98, height: 96, margin: "0 auto", borderRadius: "16px 0 0 16px", backgroundColor: "var(--color-surface)", boxShadow: "var(--shadow-modal)", padding: 10, display: "grid", gap: 7 }}><MiniLine width="70%" color="var(--color-text-primary)" /><MiniLine /><MiniLine /><MiniPill bg="var(--color-accent-subtle)">EN / ES</MiniPill></div>;
    case "LocaleSwitcher":
      return <div style={{ display: "flex", padding: 3, borderRadius: "var(--radius-pill)", backgroundColor: "var(--color-surface-sunken)", width: 92 }}><span style={{ flex: 1, height: 24, borderRadius: "var(--radius-pill)", backgroundColor: "var(--color-accent-subtle)", color: "var(--color-accent)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 800 }}>EN</span><span style={{ flex: 1, height: 24, display: "grid", placeItems: "center", fontSize: 10, color: "var(--color-text-secondary)" }}>ES</span></div>;
    case "+ New Project CTA":
    case "+ New Form CTA":
    case "+ New User CTA":
      return <div style={{ display: "flex", justifyContent: "center" }}><MiniButton>{item.name.replace(" CTA", "")}</MiniButton></div>;
    case "Project summary card":
      return <MiniCard><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><div style={{ flex: 1 }}><MiniLine width="76%" color="var(--color-text-primary)" height={10} /><div style={{ height: 5 }} /><MiniLine width="58%" /></div><MiniPill bg="var(--color-surface-sunken)" color="var(--color-text-secondary)">Closeout</MiniPill></div><div style={{ height: 8 }} /><div style={{ borderRadius: "var(--radius-lg)", backgroundColor: "var(--project-summary-assignment-bg)", padding: 7, display: "flex", gap: 8 }}><span style={{ width: 24, height: 24, borderRadius: "50%", backgroundColor: "var(--color-secondary)" }} /><MiniLine width="52%" color="var(--color-text-primary)" /></div><div style={{ height: 8 }} /><MiniLine width="46%" color="var(--color-text-primary)" height={14} /></MiniCard>;
    case "ProjectsTable mobile card":
      return <MiniCard><div style={{ display: "flex", justifyContent: "space-between" }}><MiniLine width="55%" color="var(--color-text-primary)" /><MiniPill bg="var(--color-secondary-subtle)" color="var(--color-secondary-hover)">Phase</MiniPill></div><div style={{ height: 8 }} /><MiniLine /><div style={{ height: 8 }} /><div style={{ display: "flex", gap: 6 }}><span style={{ width: 24, height: 24, borderRadius: "50%", backgroundColor: "var(--color-secondary)" }} /><span style={{ width: 24, height: 24, borderRadius: "50%", backgroundColor: "var(--color-surface-dark)" }} /></div></MiniCard>;
    case "ProjectsTable desktop table":
      return <MiniCard><div style={{ display: "grid", gap: 7 }}>{[0, 1, 2].map((row) => <span key={row} style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr 0.7fr", gap: 6 }}><MiniLine color={row === 0 ? "var(--color-text-primary)" : "var(--color-surface-sunken)"} /><MiniLine /><MiniLine /></span>)}</div></MiniCard>;
    case "ProjectDocuments":
      return <MiniCard><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 18, height: 22, borderRadius: 3, backgroundColor: "var(--color-text-primary)" }} /><MiniLine width="60%" color="var(--color-text-primary)" /><span style={{ marginLeft: "auto", color: "var(--color-text-secondary)" }}>⌄</span></div></MiniCard>;
    case "ProjectOfflineCacheSection":
      return <MiniCard><MiniPill bg="var(--color-warning-subtle)" color="var(--color-warning)">Pending Sync</MiniPill><div style={{ height: 8 }} /><MiniLine /><div style={{ height: 8 }} /><MiniButton>Download</MiniButton></MiniCard>;
    case "ProjectOverviewStats":
      return <MiniCard><div style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ fontSize: 28, fontWeight: 900, color: "var(--color-text-primary)", lineHeight: 1 }}>7%</span><span style={{ flex: 1 }}><MiniLine color="var(--color-success)" /><div style={{ height: 6 }} /><MiniLine width="80%" /></span></div></MiniCard>;
    case "LevelScopeReportModal":
      return <MiniCard><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><MiniLine width="42%" color="var(--color-text-primary)" /><MiniButton muted>Report</MiniButton></div><div style={{ height: 8 }} /><MiniLine /><div style={{ height: 6 }} /><MiniLine width="74%" /></MiniCard>;
    case "UnitCards":
      return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{[0, 1].map((i) => <div key={i} style={{ borderRadius: "var(--unit-grid-card-radius)", backgroundColor: "var(--unit-grid-card-bg)", boxShadow: "var(--unit-grid-card-shadow)", outline: i === 1 ? "2px solid var(--unit-grid-card-issue-outline)" : "none", padding: 8 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}><MiniLine width="38%" color="var(--unit-grid-card-fg)" height={9} /><span style={{ fontSize: 10, fontWeight: 900, color: i === 0 ? "var(--scope-tile-verified-bg)" : "var(--color-accent)" }}>{i === 0 ? 100 : 67}%</span></div><div style={{ height: 5 }} /><MiniLine width="64%" color="var(--unit-grid-card-meta)" height={6} /><div style={{ height: 7 }} /><span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}><span style={{ height: 40, borderRadius: "var(--scope-tile-radius)", backgroundColor: "var(--scope-tile-verified-bg)" }} /><span style={{ height: 40, borderRadius: "var(--scope-tile-radius)", backgroundColor: i === 1 ? "var(--scope-tile-issue-bg)" : "var(--scope-tile-install-bg)" }} /></span></div>)}</div>;
    case "UnitsPageClient":
      return <div style={{ display: "grid", gap: 8 }}><span style={{ height: 30, borderRadius: "var(--radius-pill)", backgroundColor: "var(--control-canvas-bg)", boxShadow: "var(--control-canvas-shadow)", padding: "0 10px", display: "flex", alignItems: "center", color: "var(--color-text-tertiary)", fontSize: 10 }}>Search locations</span><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}><MiniCard><MiniLine /></MiniCard><MiniCard><MiniLine /></MiniCard></div></div>;
    case "ScopeStatusSquare":
      return <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7 }}>{[
        ["--", "var(--scope-tile-staging-bg)", "var(--scope-tile-staging-fg)"],
        ["ASM", "var(--scope-tile-assembly-bg)", "var(--scope-tile-assembly-fg)"],
        ["INS", "var(--scope-tile-install-bg)", "var(--scope-tile-install-fg)"],
        ["OK", "var(--scope-tile-verified-bg)", "var(--scope-tile-verified-fg)"],
        ["SUB", "var(--scope-tile-sub-bg)", "var(--scope-tile-sub-fg)"],
        ["PASS", "var(--scope-tile-passed-bg)", "var(--scope-tile-passed-fg)"],
        ["FAIL", "var(--scope-tile-failed-bg)", "var(--scope-tile-failed-fg)"],
        ["ISS", "var(--scope-tile-issue-bg)", "var(--scope-tile-issue-fg)"],
      ].map(([label, bg, fg]) => <span key={label} style={{ minHeight: 38, borderRadius: "var(--scope-tile-radius)", backgroundColor: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 900, letterSpacing: "var(--tracking-ui)" }}>{label}</span>)}</div>;
    case "SubcontractorPicker":
      return <MiniCard><MiniLine width="48%" color="var(--color-text-primary)" /><div style={{ height: 8 }} /><span style={{ height: 30, borderRadius: "var(--radius-pill)", backgroundColor: "var(--control-bg)", display: "flex", alignItems: "center", padding: "0 10px", fontSize: 10, color: "var(--color-text-secondary)" }}>Select subcontractor</span></MiniCard>;
    case "BulkActionsSheet":
      return <div style={{ width: 118, margin: "0 auto", borderRadius: "18px 18px 0 0", backgroundColor: "var(--color-surface)", boxShadow: "var(--shadow-modal)", padding: 10, display: "grid", gap: 7 }}><MiniLine width="38%" color="var(--color-text-primary)" /><MiniButton>Update Status</MiniButton><MiniButton muted>Assign</MiniButton></div>;
    case "BulkActionsBar":
      return <div style={{ height: 42, borderRadius: "var(--radius-pill)", backgroundColor: "var(--color-surface)", boxShadow: "var(--shadow-nav)", display: "flex", alignItems: "center", gap: 8, padding: "0 10px" }}><MiniPill>3 selected</MiniPill><MiniButton>Apply</MiniButton></div>;
    case "OfflineProjectButton":
      return <div style={{ display: "flex", justifyContent: "center" }}><span style={{ height: 34, borderRadius: "var(--radius-md)", backgroundColor: "var(--control-bg)", display: "inline-flex", alignItems: "center", gap: 8, padding: "0 10px", color: "var(--color-text-secondary)", fontSize: 10, fontWeight: 800 }}><span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "var(--color-success)" }} /> Offline</span></div>;
    case "AddIssueModal":
    case "AddLocationIssueModal":
      return <MiniCard><MiniPill bg="var(--color-error-subtle)" color="var(--color-error)">Issue</MiniPill><div style={{ height: 8 }} /><MiniLine /><div style={{ height: 6 }} /><MiniButton>Create Issue</MiniButton></MiniCard>;
    case "AddObservationModal":
    case "AddLocationObservationModal":
      return <MiniCard><MiniPill bg="var(--color-accent-subtle)" color="var(--color-accent)">Observation</MiniPill><div style={{ height: 8 }} /><MiniLine /><div style={{ height: 6 }} /><MiniButton>Add Note</MiniButton></MiniCard>;
    case "IssueDetailModal":
      return <MiniCard><MiniPill bg="var(--color-error-subtle)" color="var(--color-error)">Open Issue</MiniPill><div style={{ height: 8 }} /><MiniLine /><div style={{ height: 6 }} /><MiniLine width="70%" /><div style={{ height: 6 }} /><MiniButton>Resolve</MiniButton></MiniCard>;
    case "ObservationDetailModal":
      return <MiniCard><MiniLine width="55%" color="var(--color-text-primary)" /><div style={{ height: 8 }} /><MiniLine /><div style={{ height: 6 }} /><MiniLine width="62%" /><div style={{ height: 8 }} /><MiniPill>Comment</MiniPill></MiniCard>;
    case "CommentThread":
      return <div style={{ display: "grid", gap: 7 }}><MiniCard><MiniLine width="44%" color="var(--color-text-primary)" /><div style={{ height: 5 }} /><MiniLine /></MiniCard><MiniCard><MiniLine width="58%" color="var(--color-text-primary)" /><div style={{ height: 5 }} /><MiniLine width="78%" /></MiniCard></div>;
    case "CameraCapture":
      return <div style={{ borderRadius: "var(--radius-lg)", backgroundColor: "var(--color-surface-dark)", height: 82, display: "grid", placeItems: "center" }}><span style={{ width: 42, height: 42, borderRadius: "50%", backgroundColor: "var(--color-surface)", boxShadow: "inset 0 0 0 5px var(--color-accent)" }} /></div>;
    case "ImageAnnotationEditor":
      return <div style={{ borderRadius: "var(--radius-lg)", backgroundColor: "var(--color-surface-sunken)", height: 82, position: "relative", overflow: "hidden" }}><span style={{ position: "absolute", inset: 10, borderRadius: "var(--radius-md)", backgroundColor: "var(--color-surface)" }} /><span style={{ position: "absolute", left: 42, top: 25, width: 58, height: 3, transform: "rotate(-24deg)", backgroundColor: "var(--color-accent)" }} /></div>;
    case "MediaWithOfflineFallback":
      return <div style={{ borderRadius: "var(--radius-lg)", backgroundColor: "var(--color-surface-sunken)", height: 82, display: "grid", placeItems: "center", color: "var(--color-text-tertiary)", fontSize: 10, fontWeight: 800 }}>Cached media</div>;
    case "FormsPageClient":
      return <MiniCard><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><MiniLine width="45%" color="var(--color-text-primary)" /><MiniButton>+ New Form</MiniButton></div><div style={{ height: 8 }} /><MiniLine /><div style={{ height: 6 }} /><MiniLine width="70%" /></MiniCard>;
    case "FormSetupModal":
      return <MiniCard><MiniLine width="54%" color="var(--color-text-primary)" /><div style={{ height: 8 }} /><span style={{ display: "grid", gap: 6 }}><MiniLine /><MiniLine /><MiniButton>Start Building</MiniButton></span></MiniCard>;
    case "FormBuilderClient":
      return <div style={{ display: "grid", gap: 7 }}><div style={{ height: 28, backgroundColor: "var(--color-surface-dark)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", padding: "0 8px" }}><MiniLine width="42%" color="rgba(255,255,255,0.9)" /></div><MiniCard><MiniLine width="38%" color="var(--form-builder-card-stripe)" /><div style={{ height: 8 }} /><MiniLine /></MiniCard></div>;
    case "FormSectionBlock":
      return <MiniCard><MiniPill bg="var(--form-builder-section-tab-bg)" color="var(--color-text-inverse)">Section 1</MiniPill><div style={{ height: 8 }} /><MiniLine color="var(--color-text-primary)" /><div style={{ height: 8 }} /><MiniButton muted>Add question</MiniButton></MiniCard>;
    case "FormQuestionRow":
      return <MiniCard><div style={{ display: "flex", gap: 7, alignItems: "center" }}><span style={{ width: 22, height: 22, borderRadius: "50%", backgroundColor: "var(--color-accent)" }} /><MiniLine color="var(--color-text-primary)" /></div><div style={{ height: 8 }} /><div style={{ display: "flex", gap: 6 }}><MiniPill bg="var(--form-response-pass-bg)" color="var(--form-response-pass-fg)">Pass</MiniPill><MiniPill bg="var(--form-response-fail-bg)" color="var(--form-response-fail-fg)">Fail</MiniPill><MiniPill bg="var(--form-response-na-bg)" color="var(--form-response-na-fg)">N/A</MiniPill></div></MiniCard>;
    case "FormFillClient":
      return <MiniCard><MiniLine width="62%" color="var(--color-text-primary)" /><div style={{ height: 9 }} /><span style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}><MiniPill bg="var(--form-response-pass-bg)" color="var(--form-response-pass-fg)">Pass</MiniPill><MiniPill bg="var(--form-response-fail-bg)" color="var(--form-response-fail-fg)">Fail</MiniPill><MiniPill bg="var(--form-response-na-bg)" color="var(--form-response-na-fg)">N/A</MiniPill></span></MiniCard>;
    case "FeedbackFormInline":
      return <MiniCard><MiniLine width="50%" color="var(--color-text-primary)" /><div style={{ height: 8 }} /><span style={{ height: 36, borderRadius: "var(--radius-md)", backgroundColor: "var(--control-bg)", display: "block" }} /><div style={{ height: 8 }} /><MiniButton>Send</MiniButton></MiniCard>;
    case "FeedbackModal":
      return <MiniCard><MiniPill bg="var(--color-accent-subtle)" color="var(--color-accent)">Feedback</MiniPill><div style={{ height: 8 }} /><MiniLine /><div style={{ height: 6 }} /><span style={{ height: 30, borderRadius: "var(--radius-md)", backgroundColor: "var(--color-surface-sunken)", display: "block" }} /></MiniCard>;
    case "FeedbackInbox":
      return <MiniCard><span style={{ display: "flex", gap: 6 }}><MiniPill>Open</MiniPill><MiniPill bg="var(--color-surface-sunken)" color="var(--color-text-secondary)">Resolved</MiniPill></span><div style={{ height: 8 }} />{[0, 1].map((i) => <div key={i} style={{ display: "flex", gap: 6, marginTop: 5 }}><MiniLine width="55%" color="var(--color-text-primary)" /><MiniLine /></div>)}</MiniCard>;
    case "NotificationCard":
      return <MiniCard><div style={{ display: "flex", gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "var(--color-accent)" }} /><div style={{ flex: 1 }}><MiniLine width="70%" color="var(--color-text-primary)" /><div style={{ height: 5 }} /><MiniLine /></div></div></MiniCard>;
    case "NotificationBell":
      return <div style={{ display: "flex", justifyContent: "center", position: "relative" }}><span style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "var(--color-surface)", boxShadow: "var(--shadow-modal)", display: "grid", placeItems: "center", color: "var(--color-text-primary)", fontSize: 18 }}>⌂</span><span style={{ position: "absolute", right: 48, top: 4, width: 10, height: 10, borderRadius: "50%", backgroundColor: "var(--color-error)" }} /></div>;
    case "TourPicker":
      return <div style={{ width: 102, margin: "0 auto", borderRadius: "16px 0 0 16px", backgroundColor: "var(--color-surface)", boxShadow: "var(--shadow-modal)", padding: 9, display: "grid", gap: 7 }}><MiniLine width="55%" color="var(--color-text-primary)" /><MiniLine /><MiniLine /><MiniPill>Start tour</MiniPill></div>;
    case "TourPlayer":
      return <div style={{ borderRadius: "var(--radius-lg)", backgroundColor: "rgba(16,18,43,0.78)", padding: 10, color: "var(--color-text-inverse)" }}><MiniCard><MiniLine width="60%" color="var(--color-text-primary)" /><div style={{ height: 8 }} /><MiniLine /><div style={{ height: 8 }} /><MiniButton>Next</MiniButton></MiniCard></div>;
    case "UsersView":
      return <MiniCard><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><MiniLine width="45%" color="var(--color-text-primary)" /><MiniButton>+ New User</MiniButton></div><div style={{ height: 8 }} /><div style={{ display: "flex", gap: 7 }}><span style={{ width: 26, height: 26, borderRadius: "50%", backgroundColor: "var(--color-accent)" }} /><div style={{ flex: 1 }}><MiniLine color="var(--color-text-primary)" /><div style={{ height: 5 }} /><MiniLine width="70%" /></div></div></MiniCard>;
    case "InviteModal":
      return <MiniCard><MiniLine width="48%" color="var(--color-text-primary)" /><div style={{ height: 8 }} /><span style={{ height: 30, borderRadius: "var(--radius-md)", backgroundColor: "var(--control-bg)", display: "block" }} /><div style={{ height: 8 }} /><MiniButton>+ New User</MiniButton></MiniCard>;
    case "GenerateResetLinkModal":
      return <MiniCard><MiniLine width="58%" color="var(--color-text-primary)" /><div style={{ height: 8 }} /><span style={{ height: 26, borderRadius: "var(--radius-md)", backgroundColor: "var(--color-surface-sunken)", display: "block" }} /><div style={{ height: 8 }} /><MiniButton>Generate link</MiniButton></MiniCard>;
    case "MasqueradeBanner":
      return <div style={{ borderRadius: "var(--radius-lg)", backgroundColor: "var(--color-warning-subtle)", padding: 10, display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 18, height: 18, borderRadius: "50%", backgroundColor: "var(--color-warning)" }} /><MiniLine color="var(--color-warning)" /></div>;
    case "RolePreviewBanner":
      return <div style={{ borderRadius: "var(--radius-lg)", backgroundColor: "var(--color-secondary-subtle)", padding: 10, display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 18, height: 18, borderRadius: "50%", backgroundColor: "var(--color-secondary)" }} /><MiniLine color="var(--color-secondary)" /></div>;
    case "OfflineIndicator":
      return <div style={{ height: 38, borderRadius: "var(--radius-pill)", backgroundColor: "var(--color-surface)", boxShadow: "var(--shadow-nav)", display: "flex", gap: 8, alignItems: "center", padding: "0 10px" }}><span style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: "var(--color-success)" }} /><span style={{ fontSize: 10, fontWeight: 800, color: "var(--color-text-secondary)" }}>Synced</span></div>;
    case "OfflineCacheBanner":
      return <div style={{ borderRadius: "var(--radius-lg)", backgroundColor: "var(--color-warning-subtle)", padding: 10, display: "grid", gap: 6 }}><MiniLine width="60%" color="var(--color-warning)" /><MiniLine color="var(--color-warning)" /><MiniButton muted>Manage cache</MiniButton></div>;
    default:
      return <MiniCard><MiniLine width="42%" color="var(--color-text-primary)" /><div style={{ height: 7 }} /><MiniLine /><div style={{ height: 5 }} /><MiniLine width="72%" /></MiniCard>;
  }
}

function ComponentLibraryRow({
  item,
}: {
  item: ComponentItem;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(item.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${item.path}`}
      style={{
        display: "grid",
        gridTemplateColumns: "160px minmax(0, 1fr)",
        gap: 12,
        alignItems: "center",
        width: "100%",
        padding: "12px 0",
        background: "none",
        border: "none",
        borderBottom: "1px solid var(--color-divider)",
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span style={{ minHeight: 92, borderRadius: "var(--radius-lg)", backgroundColor: "var(--color-bg)", padding: 10, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <ComponentPreview item={item} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--color-text-primary)" }}>
            {item.name}
          </span>
          <span style={{ fontSize: 10, color: "var(--color-text-disabled)", fontFamily: "monospace", flexShrink: 0 }}>
            {copied ? "Copied!" : item.path}
          </span>
        </span>
        <span style={{ display: "block", marginTop: 5, fontSize: 11, lineHeight: 1.45, color: "var(--color-text-secondary)" }}>
          {item.use}
        </span>
        <span style={{ display: "block", marginTop: 5, fontSize: 10, lineHeight: 1.4, color: "var(--color-text-tertiary)", fontFamily: "monospace" }}>
          {item.tokens}
        </span>
      </span>
    </button>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────────

type Tab = "tokens" | "components";

const TABS: { id: Tab; label: string }[] = [
  { id: "tokens", label: "Tokens" },
  { id: "components", label: "Components" },
];

// ── Embedded panel (Dev Tools → Design System → Library) ───────────────────

const TOKEN_GROUP_ORDER = [
  "Semantic Colors",
  "Primitive Color Scales",
  "Controls",
  "Project Summary",
  "Form Builder & Inspection",
  "Type Scale",
  "Font Weights",
  "Letter Spacing",
  "Spacing",
  "Radius",
  "Shadows",
  "Focus",
  "Component Dimensions",
  "Layout",
  "Shadcn Bridge",
  "Legacy Aliases",
  "Dev Tools",
  "Other",
] as const;

/** Token + component library browser — embed inside Dev Tools, not as a floating FAB. */
export function TokenViewerPanel() {
  const [tab, setTab] = useState<Tab>("components");
  const [rootTokens, setRootTokens] = useState<TokenEntry[]>([]);

  useEffect(() => {
    setRootTokens(collectRootTokens());
  }, []);

  const groupedTokens = rootTokens.reduce<Record<string, TokenEntry[]>>((groups, entry) => {
    const group = tokenGroup(entry.token);
    groups[group] ??= [];
    groups[group].push(entry);
    return groups;
  }, {});

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        width: "100%",
        overflow: "hidden",
        backgroundColor: "var(--color-surface)",
      }}
    >
        {/* Tabs */}
        <div style={{
          display: "flex",
          gap: 2,
          padding: "8px 16px",
          borderBottom: "1px solid var(--color-divider)",
          flexShrink: 0,
        }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: "6px 0",
                borderRadius: 8,
                border: "none",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.04em",
                cursor: "pointer",
                backgroundColor: tab === t.id ? "var(--color-accent-subtle)" : "transparent",
                color: tab === t.id ? "var(--color-accent-hover)" : "var(--color-text-secondary)",
                transition: "background-color 0.12s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 16px 24px",
        }}>
          {/* ── Tokens tab ── */}
          {tab === "tokens" && (
            <>
              <SectionLabel>All CSS Tokens ({rootTokens.length})</SectionLabel>
              <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 12, lineHeight: 1.5 }}>
                This is the single source for foundations. It reads every live <code>:root</code> variable from <code>globals.css</code> and groups them once by purpose. Click any row to copy <code>var(--token)</code>.
              </p>
              {TOKEN_GROUP_ORDER.map((group) => {
                const tokens = groupedTokens[group];
                if (!tokens?.length) return null;
                return (
                  <div key={group}>
                    <SectionLabel>{group} ({tokens.length})</SectionLabel>
                    {tokens.map((entry) => (
                      <TokenLibraryRow key={entry.token} entry={entry} />
                    ))}
                  </div>
                );
              })}
            </>
          )}

          {/* ── Components tab ── */}
          {tab === "components" && (
            <>
              <SectionLabel>Reusable Components ({COMPONENT_LIBRARY.reduce((sum, group) => sum + group.items.length, 0)})</SectionLabel>
              <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 12, lineHeight: 1.5 }}>
                This is the component/pattern library: what to reuse, where it lives, why it exists, and the main tokens it should use. Click a row to copy its path.
              </p>
              {COMPONENT_LIBRARY.map((group) => (
                <div key={group.group}>
                  <SectionLabel>{group.group} ({group.items.length})</SectionLabel>
                  {group.items.map((item) => (
                    <ComponentLibraryRow key={`${group.group}-${item.name}`} item={item} />
                  ))}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--color-divider)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          <ChevronRight size={11} color="var(--color-text-disabled)" />
          <span style={{ fontSize: 10, color: "var(--color-text-disabled)", fontFamily: "monospace" }}>
            DESIGN-SYSTEM.md · v2.0
          </span>
        </div>
    </div>
  );
}
