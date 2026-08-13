import { describe, expect, it } from "vitest";
import {
  inferFieldMediaMimeType,
  storageKeyFromFieldMediaUrl,
} from "@/lib/pdf/field-media-mime-infer";

describe("inferFieldMediaMimeType()", () => {
  it("maps URL extensions to the correct MIME type", () => {
    expect(
      inferFieldMediaMimeType({
        storageUrl: "https://app.example.com/field-media/abc/photo.png",
      }),
    ).toBe("image/png");
    expect(
      inferFieldMediaMimeType({
        storageUrl: "https://app.example.com/field-media/abc/photo.webp?token=1",
      }),
    ).toBe("image/webp");
  });

  it("prefers explicit mimeType when provided", () => {
    expect(
      inferFieldMediaMimeType({
        storageUrl: "https://app.example.com/field-media/abc/photo.png",
        mimeType: "image/jpeg",
      }),
    ).toBe("image/jpeg");
  });
});

describe("storageKeyFromFieldMediaUrl()", () => {
  it("returns raw key when query key has malformed percent-encoding", () => {
    expect(
      storageKeyFromFieldMediaUrl("https://app.example.com/api/field-media?key=bad%ZZ"),
    ).toBe("bad%ZZ");
  });
});
