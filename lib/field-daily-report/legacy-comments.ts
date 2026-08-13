import type {
  FieldDailyReportCommentDto,
  FieldDailyReportSectionNoteDto,
} from "@/lib/field-daily-report/types";

/** PDF export still reads legacy comment overlays — derive newest note body per section. */
export function sectionNotesToLegacyComments(
  notes: FieldDailyReportSectionNoteDto[],
): FieldDailyReportCommentDto[] {
  const latestByKey = new Map<string, FieldDailyReportCommentDto>();
  for (const note of notes) {
    const key = `${note.sectionKey}\0${note.itemKey}`;
    if (!latestByKey.has(key)) {
      latestByKey.set(key, {
        sectionKey: note.sectionKey,
        itemKey: note.itemKey,
        body: note.body,
        updatedAt: note.editedAt ?? note.createdAt,
      });
    }
  }
  return [...latestByKey.values()];
}
