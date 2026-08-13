import { ActivityReportTabs } from "@/components/reports/ActivityReportTabs";

export default function ReportsActivityLayout({ children }: { children: React.ReactNode }) {
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
      <ActivityReportTabs />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </div>
  );
}
