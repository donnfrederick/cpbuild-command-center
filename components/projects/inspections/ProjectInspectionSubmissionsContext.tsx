"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { InspectionSubmission } from "@/lib/inspections/submissionsApi";

const ProjectInspectionSubmissionsContext = createContext<InspectionSubmission[]>([]);

export function ProjectInspectionSubmissionsProvider({
  submissions,
  children,
}: {
  submissions: InspectionSubmission[];
  children: ReactNode;
}) {
  return (
    <ProjectInspectionSubmissionsContext.Provider value={submissions}>
      {children}
    </ProjectInspectionSubmissionsContext.Provider>
  );
}

export function useProjectInspectionSubmissions(): InspectionSubmission[] {
  return useContext(ProjectInspectionSubmissionsContext);
}
