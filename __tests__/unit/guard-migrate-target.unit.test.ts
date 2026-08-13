import { describe, expect, it } from "vitest";
import {
  assertSafeMigrateTarget,
  assessMigrateTarget,
  postgresFingerprint,
  resolveMigrateConnectionUrl,
} from "@/lib/db/guard-migrate-target";

const PROD_FP = "mainline.proxy.rlwy.net:23429/railway";
const DEV_FP = "devbox.proxy.rlwy.net:12345/railway";
const LOCAL_FP = "127.0.0.1:5433/commandcenter";

describe("postgresFingerprint()", () => {
  it("fingerprints host port and database without credentials", () => {
    expect(
      postgresFingerprint("postgresql://postgres:secret@mainline.proxy.rlwy.net:23429/railway"),
    ).toBe(PROD_FP);
  });

  it("prefers explicit port in URL", () => {
    expect(postgresFingerprint("postgresql://u:p@127.0.0.1:5433/commandcenter")).toBe(LOCAL_FP);
  });

  it("uses last @ as host boundary when password contains @ (fallback parser)", () => {
    expect(
      postgresFingerprint("postgresql://user:p@ss@word@mainline.proxy.rlwy.net:23429/railway"),
    ).toBe(PROD_FP);
  });
});

describe("resolveMigrateConnectionUrl()", () => {
  it("uses DIRECT_URL when set for migrate", () => {
    expect(
      resolveMigrateConnectionUrl({
        databaseUrl: "postgresql://pooler/dev",
        directUrl: "postgresql://direct/dev",
      }),
    ).toBe("postgresql://direct/dev");
  });
});

describe("assessMigrateTarget()", () => {
  it("blocks when fingerprint matches prod blocklist", () => {
    const result = assessMigrateTarget(
      "postgresql://postgres:secret@mainline.proxy.rlwy.net:23429/railway",
      [PROD_FP],
    );
    expect(result.blocked).toBe(true);
    expect(result.matchedProd).toBe(true);
  });

  it("allows dev railway when prod fingerprint differs", () => {
    const result = assessMigrateTarget(
      "postgresql://postgres:secret@devbox.proxy.rlwy.net:12345/railway",
      [PROD_FP],
    );
    expect(result.blocked).toBe(false);
    expect(result.matchedProd).toBe(false);
  });

  it("blocks postgres.railway.internal from laptop", () => {
    const result = assessMigrateTarget(
      "postgresql://postgres:secret@postgres.railway.internal:5432/railway",
      [],
    );
    expect(result.blocked).toBe(true);
  });
});

describe("assertSafeMigrateTarget()", () => {
  const prodUrl = "postgresql://u:p@mainline.proxy.rlwy.net:23429/railway";
  const localUrl = "postgresql://u:p@127.0.0.1:5433/commandcenter";

  it("honours ALLOW_PROD_MIGRATE override", () => {
    const result = assertSafeMigrateTarget({
      databaseUrl: prodUrl,
      prodFingerprints: [PROD_FP],
      allowProdMigrate: true,
    });
    expect(result.blocked).toBe(false);
  });

  it("blocks when direct URL matches prod even if DATABASE_URL is local", () => {
    const result = assertSafeMigrateTarget({
      databaseUrl: localUrl,
      directUrl: prodUrl,
      prodFingerprints: [PROD_FP],
      allowProdMigrate: false,
    });
    expect(result.blocked).toBe(true);
    expect(result.matchedProd).toBe(true);
  });

  it("allows local docker target", () => {
    const result = assertSafeMigrateTarget({
      databaseUrl: localUrl,
      prodFingerprints: [PROD_FP, DEV_FP],
      allowProdMigrate: false,
    });
    expect(result.blocked).toBe(false);
  });
});
