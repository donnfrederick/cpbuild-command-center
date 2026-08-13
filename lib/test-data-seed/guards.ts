import { db } from "@/lib/db";
import { normalizeRoleCode } from "@/lib/production-project-access";

export class TestSeedForbiddenError extends Error {
  constructor(message = "Forbidden — only Admin may seed test data") {
    super(message);
    this.name = "TestSeedForbiddenError";
  }
}

export class TestSeedNotTestProjectError extends Error {
  constructor(message = "Test data seeding is only allowed on test projects") {
    super(message);
    this.name = "TestSeedNotTestProjectError";
  }
}

export class TestSeedValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestSeedValidationError";
  }
}

export async function assertAdminTestProject(
  projectId: string,
  role: string | undefined
): Promise<void> {
  if (normalizeRoleCode(role ?? "MEMBER") !== "ADMIN") {
    throw new TestSeedForbiddenError();
  }

  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { isTestProject: true },
  });

  if (!project?.isTestProject) {
    throw new TestSeedNotTestProjectError();
  }
}

export async function validateActiveUserIds(userIds: string[]): Promise<void> {
  if (userIds.length === 0) {
    throw new TestSeedValidationError("At least one user must be selected for attribution");
  }

  const users = await db.user.findMany({
    where: { id: { in: userIds }, status: "ACTIVE" },
    select: { id: true },
  });

  if (users.length !== userIds.length) {
    throw new TestSeedValidationError("One or more selected users are invalid or inactive");
  }
}
