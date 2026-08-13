import type { FieldDailyReportSectionNoteAuthorDto } from "@/lib/field-daily-report/types";

type AuthorRow = {
  id: string;
  name: string | null;
  email: string;
  role: { code: string };
};

export function toFieldDailySectionNoteAuthorDto(
  author: AuthorRow,
  projectInstallManagerId: string | null,
): FieldDailyReportSectionNoteAuthorDto {
  return {
    id: author.id,
    name: author.name?.trim() || author.email,
    isInstallManager: Boolean(
      projectInstallManagerId && author.id === projectInstallManagerId,
    ),
    roleCode: author.role.code,
  };
}
