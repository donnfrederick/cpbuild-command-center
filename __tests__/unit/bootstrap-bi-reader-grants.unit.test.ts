import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  applyBiReaderGrants,
  SENSITIVE_TABLES,
  USER_SELECT_COLUMNS,
  type SqlRunner,
} from "@/scripts/bootstrap-bi-reader-grants";

/**
 * Unit tests for the BI-reader grant re-application logic.
 *
 * The bootstrap script is executed on every Railway container start, so its
 * contract matters: it must (1) skip cleanly when the role doesn't exist,
 * (2) re-apply the full grant set when it does, (3) tolerate individual
 * failures without throwing, and (4) not treat "table does not exist" revokes
 * as failures — they can legitimately occur in fresh environments.
 */

interface MockRunnerOptions {
  roleExists: boolean;
  executeError?: (sql: string) => string | null;
}

function createRunner(opts: MockRunnerOptions) {
  const executedSql: string[] = [];
  const runner: SqlRunner = {
    $queryRawUnsafe: vi.fn(async <T,>(): Promise<T> => {
      return [{ exists: opts.roleExists }] as unknown as T;
    }),
    $executeRawUnsafe: vi.fn(async (sql: string) => {
      executedSql.push(sql);
      const err = opts.executeError?.(sql) ?? null;
      if (err) throw new Error(err);
      return 1;
    }),
  };
  return { runner, executedSql };
}

describe("applyBiReaderGrants()", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("skips cleanly when the bi_reader role does not exist", async () => {
    const { runner, executedSql } = createRunner({ roleExists: false });

    const result = await applyBiReaderGrants(runner);

    expect(result).toEqual({ skipped: true, failures: 0 });
    expect(executedSql).toHaveLength(0);
    expect(runner.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it("applies schema grants, sensitive-table revokes, User column grants, and drops legacy view when role exists", async () => {
    const { runner, executedSql } = createRunner({ roleExists: true });

    const result = await applyBiReaderGrants(runner);

    expect(result).toEqual({ skipped: false, failures: 0 });

    expect(executedSql.some((s) => /GRANT USAGE ON SCHEMA public TO bi_reader/i.test(s))).toBe(true);
    expect(
      executedSql.some((s) => /GRANT SELECT ON ALL TABLES IN SCHEMA public TO bi_reader/i.test(s))
    ).toBe(true);
    expect(
      executedSql.some((s) =>
        /ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO bi_reader/i.test(s)
      )
    ).toBe(true);

    for (const table of SENSITIVE_TABLES) {
      expect(
        executedSql.some((s) => s.includes(`REVOKE SELECT ON ${table} FROM bi_reader`))
      ).toBe(true);
    }

    expect(
      executedSql.some(
        (s) => s.includes('REVOKE SELECT ON "User" FROM bi_reader') && !s.includes("(")
      )
    ).toBe(true);

    for (const col of USER_SELECT_COLUMNS) {
      expect(
        executedSql.some((s) => s.includes("GRANT SELECT") && s.includes('"User"') && s.includes(col))
      ).toBe(true);
    }

    expect(executedSql.some((s) => /DROP VIEW IF EXISTS user_public_info/i.test(s))).toBe(true);
    expect(executedSql.some((s) => /CREATE OR REPLACE VIEW user_public_info/i.test(s))).toBe(false);
  });

  it("treats 'table does not exist' revoke errors as non-failures (fresh environments)", async () => {
    const { runner } = createRunner({
      roleExists: true,
      executeError: (sql) => {
        if (sql.includes("REVOKE SELECT ON") && sql.includes('"Session"')) {
          return 'relation "Session" does not exist';
        }
        return null;
      },
    });

    const result = await applyBiReaderGrants(runner);

    expect(result.skipped).toBe(false);
    expect(result.failures).toBe(0);
  });

  it("counts a real revoke error (not 'does not exist') as a failure", async () => {
    const { runner } = createRunner({
      roleExists: true,
      executeError: (sql) => {
        if (sql.includes("REVOKE SELECT ON") && sql.includes('"Session"')) {
          return "permission denied for table Session";
        }
        return null;
      },
    });

    const result = await applyBiReaderGrants(runner);

    expect(result.skipped).toBe(false);
    expect(result.failures).toBe(1);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("counts each failing grant step individually and continues through the remaining steps", async () => {
    const { runner } = createRunner({
      roleExists: true,
      executeError: (sql) => {
        if (sql.startsWith("GRANT USAGE")) return "permission denied";
        if (sql.includes("ALTER DEFAULT PRIVILEGES")) return "not role owner";
        return null;
      },
    });

    const result = await applyBiReaderGrants(runner);

    expect(result.failures).toBe(2);
  });

  it("counts a failed User column grant as a failure", async () => {
    const { runner } = createRunner({
      roleExists: true,
      executeError: (sql) => {
        if (/GRANT SELECT \(/.test(sql) && sql.includes('"User"')) return "permission denied";
        return null;
      },
    });

    const result = await applyBiReaderGrants(runner);

    expect(result.failures).toBe(1);
  });

  it("does not throw when every single step fails — caller must still get a result", async () => {
    const { runner } = createRunner({
      roleExists: true,
      executeError: () => "permission denied",
    });

    await expect(applyBiReaderGrants(runner)).resolves.toMatchObject({
      skipped: false,
      failures: expect.any(Number),
    });
  });
});

describe("SENSITIVE_TABLES", () => {
  it("covers auth tables but not User — keep in sync with create-bi-reader.sql", () => {
    expect(SENSITIVE_TABLES).toEqual([
      '"Session"',
      '"Account"',
      '"VerificationToken"',
      "password_reset_tokens",
    ]);
    expect(SENSITIVE_TABLES).not.toContain('"User"');
  });
});

describe("USER_SELECT_COLUMNS", () => {
  it("excludes passwordHash", () => {
    expect(USER_SELECT_COLUMNS.join(" ")).not.toMatch(/passwordHash/i);
    expect(USER_SELECT_COLUMNS).toContain('"roleId"');
  });
});
