"use client";

import { FieldDailyReportProjectBlock } from "@/components/reports/FieldDailyReportProjectBlock";
import { useFieldDailyDetailModals } from "@/hooks/useFieldDailyDetailModals";
import type {
  FieldDailyReportDailyManpowerSavePayload,
  FieldDailyReportProjectDto,
  FieldDailyReportSectionNoteDto,
} from "@/lib/field-daily-report/types";

interface FieldDailyReportProjectSectionProps {
  project: FieldDailyReportProjectDto;
  reportDate: string;
  currentUserId: string;
  currentUserRole: string;
  defaultExpanded?: boolean;
  sheetMode?: boolean;
  editable?: boolean;
  onSectionNotesChange?: (sectionNotes: FieldDailyReportSectionNoteDto[]) => void;
  onDailyManpowerSaved?: (payload: FieldDailyReportDailyManpowerSavePayload) => void;
}

export function FieldDailyReportProjectSection({
  project,
  reportDate,
  currentUserId,
  currentUserRole,
  defaultExpanded,
  sheetMode,
  editable = true,
  onSectionNotesChange,
  onDailyManpowerSaved,
}: FieldDailyReportProjectSectionProps) {
  const modals = useFieldDailyDetailModals({
    projectId: project.projectId,
    projectName: project.projectName,
    currentUserId,
    currentUserRole,
  });

  return (
    <>
      <FieldDailyReportProjectBlock
        project={project}
        reportDate={reportDate}
        currentUserId={currentUserId}
        defaultExpanded={defaultExpanded}
        sheetMode={sheetMode}
        editable={editable}
        onOpenIssue={modals.openIssue}
        onOpenObservation={modals.openObservation}
        onOpenInspection={modals.openInspection}
        onOpenUnit={modals.openUnit}
        onSectionNotesChange={onSectionNotesChange}
        onDailyManpowerSaved={onDailyManpowerSaved}
      />
      {modals.modals}
    </>
  );
}
