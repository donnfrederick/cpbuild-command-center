import { describe, it, expect } from "vitest";
import {
  parseOptionalBoolean,
  parseOptionalEnumStringArray,
  parseOptionalPositiveInt,
  parseOptionalStringArray,
} from "@/lib/pdf/parse-export-filter-body";

describe("parseOptionalStringArray()", () => {
  it("returns empty array for undefined and null", () => {
    expect(parseOptionalStringArray(undefined, "obsTypes")).toEqual({ ok: true, value: [] });
    expect(parseOptionalStringArray(null, "obsTypes")).toEqual({ ok: true, value: [] });
  });

  it("accepts a string array and drops empty entries", () => {
    expect(parseOptionalStringArray(["QUALITY", ""], "obsTypes")).toEqual({
      ok: true,
      value: ["QUALITY"],
    });
  });

  it("rejects a scalar string (malformed client payload)", () => {
    expect(parseOptionalStringArray("QUALITY", "obsTypes")).toEqual({
      ok: false,
      field: "obsTypes",
    });
  });

  it("rejects arrays with non-string elements", () => {
    expect(parseOptionalStringArray(["ok", 1], "authors")).toEqual({
      ok: false,
      field: "authors",
    });
  });

  it("parseOptionalEnumStringArray rejects unknown enum values", () => {
    expect(parseOptionalEnumStringArray(["QUALITY", "NOT_A_TYPE"], "obsTypes", ["QUALITY", "OTHER"])).toEqual({
      ok: false,
      field: "obsTypes",
    });
    expect(parseOptionalEnumStringArray(["QUALITY"], "obsTypes", ["QUALITY", "OTHER"])).toEqual({
      ok: true,
      value: ["QUALITY"],
    });
  });
});

describe("parseOptionalBoolean()", () => {
  it("defaults when omitted", () => {
    expect(parseOptionalBoolean(undefined, "includeCover", true)).toEqual({ ok: true, value: true });
    expect(parseOptionalBoolean(null, "includeCover", false)).toEqual({ ok: true, value: false });
  });

  it("accepts booleans and rejects string scalars", () => {
    expect(parseOptionalBoolean(false, "includeCover", true)).toEqual({ ok: true, value: false });
    expect(parseOptionalBoolean("false", "includeCover", true)).toEqual({
      ok: false,
      field: "includeCover",
    });
  });
});

describe("parseOptionalPositiveInt()", () => {
  it("returns undefined when omitted", () => {
    expect(parseOptionalPositiveInt(undefined, "coverObservationCount")).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("accepts positive numbers and rejects invalid shapes", () => {
    expect(parseOptionalPositiveInt(47.9, "coverObservationCount")).toEqual({
      ok: true,
      value: 47,
    });
    expect(parseOptionalPositiveInt("47", "coverObservationCount")).toEqual({
      ok: false,
      field: "coverObservationCount",
    });
    expect(parseOptionalPositiveInt(0, "coverObservationCount")).toEqual({
      ok: false,
      field: "coverObservationCount",
    });
  });
});
