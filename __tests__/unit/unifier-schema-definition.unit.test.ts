import { describe, it, expect } from "vitest";
import {
  UNIFIER_SCHEMA,
  getTableDef,
  ALLOWLISTED_TABLE_NAMES,
} from "@/lib/unifier/schema-definition";

describe("UNIFIER_SCHEMA", () => {
  it("contains at least 25 table definitions", () => {
    expect(UNIFIER_SCHEMA.length).toBeGreaterThanOrEqual(25);
  });

  it("every table definition has required fields", () => {
    for (const table of UNIFIER_SCHEMA) {
      expect(table.tableName, `${table.tableName} missing tableName`).toBeTruthy();
      expect(table.displayName, `${table.tableName} missing displayName`).toBeTruthy();
      expect(table.description, `${table.tableName} missing description`).toBeTruthy();
      expect(Array.isArray(table.columns), `${table.tableName} columns not array`).toBe(true);
      expect(table.columns.length, `${table.tableName} has no columns`).toBeGreaterThan(0);
    }
  });

  it("every column has a code and label", () => {
    for (const table of UNIFIER_SCHEMA) {
      for (const col of table.columns) {
        expect(col.code, `${table.tableName} column missing code`).toBeTruthy();
        expect(col.label, `${table.tableName}.${col.code} missing label`).toBeTruthy();
      }
    }
  });

  it("includes UNIFIER_SYS_USER_INFO for user linking", () => {
    const def = UNIFIER_SCHEMA.find((t) => t.tableName === "UNIFIER_SYS_USER_INFO");
    expect(def).toBeDefined();
    const codes = def!.columns.map((c) => c.code);
    expect(codes).toContain("USERID");
    expect(codes).toContain("EMAIL");
    expect(codes).toContain("FULLNAME");
  });

  it("marks UNIFIER_US_XPRJ and UNIFIER_UXPT as integrated", () => {
    const xprj = UNIFIER_SCHEMA.find((t) => t.tableName === "UNIFIER_US_XPRJ");
    const uxpt = UNIFIER_SCHEMA.find((t) => t.tableName === "UNIFIER_UXPT");
    expect(xprj?.integrated).toBe(true);
    expect(uxpt?.integrated).toBe(true);
  });
});

describe("getTableDef()", () => {
  it("returns the table definition for a known table", () => {
    const def = getTableDef("UNIFIER_UXSUB");
    expect(def).toBeDefined();
    expect(def?.tableName).toBe("UNIFIER_UXSUB");
  });

  it("returns undefined for an unknown table", () => {
    expect(getTableDef("FAKE_TABLE_XYZ")).toBeUndefined();
  });
});

describe("ALLOWLISTED_TABLE_NAMES", () => {
  it("is a Set containing all table names from the schema", () => {
    expect(ALLOWLISTED_TABLE_NAMES).toBeInstanceOf(Set);
    for (const table of UNIFIER_SCHEMA) {
      expect(ALLOWLISTED_TABLE_NAMES.has(table.tableName)).toBe(true);
    }
  });

  it("does not contain arbitrary table names", () => {
    expect(ALLOWLISTED_TABLE_NAMES.has("DROP TABLE users")).toBe(false);
    expect(ALLOWLISTED_TABLE_NAMES.has("sys.tables")).toBe(false);
  });
});
