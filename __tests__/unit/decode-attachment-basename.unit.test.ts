import { describe, expect, it } from "vitest";
import { decodeAttachmentBasename } from "@/lib/pdf/observations-pdf";

describe("decodeAttachmentBasename()", () => {
  it("decodes valid percent-encoding", () => {
    expect(decodeAttachmentBasename("photo%20one.jpg")).toBe("photo one.jpg");
  });

  it("returns raw basename when decodeURIComponent throws", () => {
    expect(decodeAttachmentBasename("photo%ZZ.jpg")).toBe("photo%ZZ.jpg");
  });
});
