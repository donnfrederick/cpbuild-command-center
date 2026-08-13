import { toFieldDailySectionNoteAuthorDto } from "@/lib/field-daily-report/note-author";
import type { FieldDailyReportDailyManpowerMetaDto } from "@/lib/field-daily-report/types";

type AuthorRow = {
  id: string;
  name: string | null;
  email: string;
  role: { code: string };
};

export const FIELD_DAILY_DAILY_MANPOWER_SET_BY_SELECT = {
  select: { id: true, name: true, email: true, role: { select: { code: true } } },
} as const;

export function toDailyManpowerMetaDto(
  row: {
    dailyManpower: number | null;
    dailyManpowerSetAt: Date | null;
    dailyManpowerSetBy: AuthorRow | null;
  },
  projectInstallManagerId: string | null,
): FieldDailyReportDailyManpowerMetaDto | null {
  if (typeof row.dailyManpower !== "number") return null;
  if (!row.dailyManpowerSetAt || !row.dailyManpowerSetBy) return null;
  return {
    setAt: row.dailyManpowerSetAt.toISOString(),
    setBy: toFieldDailySectionNoteAuthorDto(row.dailyManpowerSetBy, projectInstallManagerId),
  };
}
