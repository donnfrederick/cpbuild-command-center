import { Plus, Search, Filter } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const COLUMNS = [
  { label: "Project Name", minWidth: 250, sticky: true },
  { label: "Site Location" },
  { label: "Status" },
  { label: "Start Date" },
  { label: "Unifier #" },
  { label: "Install Manager" },
  { label: "Project Manager" },
];

const ROWS = 5;

export default function ProjectsLoading() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gap: 20,
        padding: "var(--page-padding-x)",
      }}
    >
      {/* Page header — real UI, not skeleton */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--neutral-900)", margin: 0 }}>
            Projects
          </h1>
          <p style={{ fontSize: 13, color: "var(--neutral-500)", marginTop: 4, marginBottom: 0 }}>
            All active and historical construction projects.
          </p>
        </div>
        <button
          disabled
          aria-label="Add project"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            height: 40,
            padding: "0 16px",
            border: "none",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--primary-500)",
            color: "var(--neutral-0)",
            fontSize: 14,
            fontWeight: 500,
            whiteSpace: "nowrap",
            flexShrink: 0,
            cursor: "default",
            opacity: 0.7,
          }}
        >
          <Plus size={16} />
          <span>+ Add Project</span>
        </button>
      </div>

      {/* Toolbar — real UI, not skeleton */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
          <Search
            style={{
              position: "absolute",
              left: 12,
              width: 16,
              height: 16,
              color: "var(--neutral-400)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            placeholder="Search by name, location, Unifier #..."
            disabled
            style={{
              width: "100%",
              height: 40,
              paddingLeft: 36,
              paddingRight: 12,
              border: "1px solid var(--neutral-300)",
              borderRadius: "var(--radius-sm, 6px)",
              backgroundColor: "var(--neutral-0)",
              color: "var(--neutral-900)",
              fontSize: 14,
              outline: "none",
            }}
          />
        </div>
        <button
          disabled
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 40,
            padding: "0 16px",
            border: "1px solid var(--neutral-300)",
            borderRadius: "var(--radius-sm, 6px)",
            backgroundColor: "var(--neutral-0)",
            color: "var(--neutral-700)",
            fontSize: 14,
            fontWeight: 500,
            cursor: "default",
            whiteSpace: "nowrap",
          }}
        >
          <Filter style={{ width: 16, height: 16 }} />
          Filters
        </button>
      </div>

      {/* Table container */}
      <div
        style={{
          flex: 1,
          border: "1px solid var(--neutral-300)",
          borderRadius: "var(--radius-md, 8px)",
          overflow: "hidden",
          backgroundColor: "var(--neutral-0)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Table header — real column labels */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderBottom: "1px solid var(--neutral-300)",
            backgroundColor: "var(--neutral-0)",
            position: "sticky",
            top: 0,
            zIndex: 20,
          }}
        >
          {COLUMNS.map((col, i) => (
            <div
              key={col.label}
              style={{
                ...(col.sticky
                  ? { minWidth: col.minWidth, flexShrink: 0, borderRight: "1px solid var(--neutral-300)" }
                  : { flex: 1 }),
                padding: "12px 24px",
                fontSize: 14,
                fontWeight: 600,
                color: i === 0 ? "var(--primary-700)" : "var(--neutral-700)",
                whiteSpace: "nowrap",
              }}
            >
              {col.label}
            </div>
          ))}
          {/* Actions column spacer */}
          <div style={{ width: 140, flexShrink: 0 }} />
        </div>

        {/* Skeleton rows — only the body has skeletons */}
        {Array.from({ length: ROWS }).map((_, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              borderBottom: i < ROWS - 1 ? "1px solid var(--neutral-300)" : "none",
            }}
          >
            {/* Project Name */}
            <div style={{ minWidth: 250, flexShrink: 0, padding: "13px 24px", borderRight: "1px solid var(--neutral-300)" }}>
              <Skeleton style={{ width: `${[68, 80, 55, 72, 62][i]}%`, height: 14 }} />
            </div>
            {/* Site Location */}
            <div style={{ flex: 1, padding: "13px 24px" }}>
              <Skeleton style={{ width: `${[55, 45, 60, 50, 48][i]}%`, height: 14 }} />
            </div>
            {/* Status badge */}
            <div style={{ flex: 1, padding: "13px 24px" }}>
              <Skeleton style={{ width: 58, height: 22, borderRadius: 999 }} />
            </div>
            {/* Start Date */}
            <div style={{ flex: 1, padding: "13px 24px" }}>
              <Skeleton style={{ width: [14, 70, 14, 70, 14][i], height: 14 }} />
            </div>
            {/* Unifier # */}
            <div style={{ flex: 1, padding: "13px 24px" }}>
              <Skeleton style={{ width: [72, 14, 72, 14, 72][i], height: 14 }} />
            </div>
            {/* Install Manager */}
            <div style={{ flex: 1, padding: "13px 24px" }}>
              <Skeleton style={{ width: `${[14, 62, 50, 14, 58][i]}%`, height: 14 }} />
            </div>
            {/* Project Manager */}
            <div style={{ flex: 1, padding: "13px 24px" }}>
              <Skeleton style={{ width: `${[65, 55, 14, 70, 48][i]}%`, height: 14 }} />
            </div>
            {/* Actions */}
            <div style={{ width: 140, flexShrink: 0, padding: "13px 16px", display: "flex", alignItems: "center", gap: 6 }}>
              <Skeleton style={{ width: 96, height: 28, borderRadius: "var(--radius-sm)" }} />
              <Skeleton style={{ width: 28, height: 28, borderRadius: "var(--radius-sm)" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Row count */}
      <Skeleton style={{ width: 60, height: 12 }} />
    </div>
  );
}
