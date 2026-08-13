import { db } from "@/lib/db";

export async function findFieldDailyReportProjectRow(options: {
  projectId: string;
  reportDate: string;
  ownerUserIds: string[];
}) {
  const reportDateValue = new Date(`${options.reportDate}T00:00:00.000Z`);
  const ownerUserIds = [...new Set(options.ownerUserIds.filter(Boolean))];

  for (const installManagerUserId of ownerUserIds) {
    const report = await db.fieldDailyReport.findUnique({
      where: {
        installManagerUserId_reportDate: {
          installManagerUserId,
          reportDate: reportDateValue,
        },
      },
      include: {
        projects: {
          where: { projectId: options.projectId },
          take: 1,
        },
      },
    });
    const projectRow = report?.projects[0];
    if (projectRow) return projectRow;
  }

  return null;
}
