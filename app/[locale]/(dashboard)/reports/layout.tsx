import { GlobalReportsBackHeader } from "@/components/reports/GlobalReportsBackHeader";
import { ReportsOfflineGuard } from "@/components/reports/ReportsOfflineGuard";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ReportsOfflineGuard>
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
        <GlobalReportsBackHeader />
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{children}</div>
      </div>
    </ReportsOfflineGuard>
  );
}
