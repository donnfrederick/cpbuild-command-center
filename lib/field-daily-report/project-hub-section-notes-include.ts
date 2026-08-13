/** Shared Prisma include for field daily report section notes + replies. */
export const FIELD_DAILY_SECTION_NOTES_INCLUDE = {
  where: { deletedAt: null },
  orderBy: { createdAt: "desc" as const },
  include: {
    author: {
      select: { id: true, name: true, email: true, role: { select: { code: true } } },
    },
    replies: {
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" as const },
      include: {
        author: {
          select: { id: true, name: true, email: true, role: { select: { code: true } } },
        },
      },
    },
  },
} as const;
