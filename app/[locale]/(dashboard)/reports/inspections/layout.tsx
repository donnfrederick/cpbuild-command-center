import { InspectionReportTabs } from "@/components/reports/InspectionReportTabs";

export default function ReportsInspectionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        backgroundColor: "var(--neutral-0)",
      }}
    >
      <InspectionReportTabs />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          alignItems: "stretch",
        }}
      >
        {children}
      </div>
    </div>
  );
}
