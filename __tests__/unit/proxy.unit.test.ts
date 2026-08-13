import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  getForwardedPublicOrigin,
  getPublicOrigin,
  normalizeProxyRedirectLocation,
} from "@/proxy";

const ORIGINAL_AUTH_URL = process.env.AUTH_URL;
const ORIGINAL_NEXTAUTH_URL = process.env.NEXTAUTH_URL;

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://0.0.0.0/login", { headers });
}

describe("getPublicOrigin()", () => {
  beforeEach(() => {
    delete process.env.AUTH_URL;
    delete process.env.NEXTAUTH_URL;
  });

  afterEach(() => {
    if (ORIGINAL_AUTH_URL === undefined) {
      delete process.env.AUTH_URL;
    } else {
      process.env.AUTH_URL = ORIGINAL_AUTH_URL;
    }
    if (ORIGINAL_NEXTAUTH_URL === undefined) {
      delete process.env.NEXTAUTH_URL;
    } else {
      process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH_URL;
    }
  });

  it("uses the ngrok forwarded host when NEXTAUTH_URL is localhost", () => {
    process.env.NEXTAUTH_URL = "http://localhost:3002";
    const request = new NextRequest("http://localhost:3002/en/projects", {
      headers: {
        "x-forwarded-host": "viewing-definite-creative.ngrok-free.dev",
        "x-forwarded-proto": "https",
      },
    });

    expect(getPublicOrigin(request)).toBe("https://viewing-definite-creative.ngrok-free.dev");
  });

  it("uses a configured non-internal public origin", () => {
    process.env.NEXTAUTH_URL = "https://command-center-reboot-dev.up.railway.app";
    const request = new NextRequest("http://localhost:3002/en/projects", {
      headers: {
        "x-forwarded-host": "spoofed.example.com",
        "x-forwarded-proto": "https",
      },
    });

    expect(getPublicOrigin(request)).toBe("https://command-center-reboot-dev.up.railway.app");
  });

  it("strips non-standard HTTPS ports from the request URL fallback", () => {
    const request = new NextRequest("https://command-center-reboot-dev.up.railway.app:8080/en/login");

    expect(getPublicOrigin(request)).toBe("https://command-center-reboot-dev.up.railway.app");
  });

  it("strips :8080 from forwarded Host when building the public origin", () => {
    const request = new NextRequest("https://0.0.0.0:8080/en/login", {
      headers: {
        host: "command-center-reboot-dev.up.railway.app:8080",
        "x-forwarded-proto": "https",
      },
    });

    expect(getForwardedPublicOrigin(request)).toBe(
      "https://command-center-reboot-dev.up.railway.app",
    );
  });

  it("keeps HTTP dev ports when no forwarded headers are present", () => {
    const request = new NextRequest("http://localhost:3002/en/projects");

    expect(getPublicOrigin(request)).toBe("http://localhost:3002");
  });
});

describe("normalizeProxyRedirectLocation()", () => {
  beforeEach(() => {
    delete process.env.AUTH_URL;
    delete process.env.NEXTAUTH_URL;
  });

  afterEach(() => {
    if (ORIGINAL_AUTH_URL === undefined) {
      delete process.env.AUTH_URL;
    } else {
      process.env.AUTH_URL = ORIGINAL_AUTH_URL;
    }
    if (ORIGINAL_NEXTAUTH_URL === undefined) {
      delete process.env.NEXTAUTH_URL;
    } else {
      process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH_URL;
    }
  });

  it("rewrites Railway internal 0.0.0.0 redirects to the forwarded public host", () => {
    const request = makeRequest({
      "x-forwarded-host": "command-center-reboot-dev.up.railway.app",
      "x-forwarded-proto": "https",
    });

    expect(
      normalizeProxyRedirectLocation("https://0.0.0.0/en/login", request),
    ).toBe("https://command-center-reboot-dev.up.railway.app/en/login");
  });

  it("uses the current ngrok host for internal redirects during mobile PWA testing", () => {
    const request = makeRequest({
      "x-forwarded-host": "example-tunnel.ngrok-free.dev",
      "x-forwarded-proto": "https",
    });

    expect(
      normalizeProxyRedirectLocation("https://0.0.0.0/en/projects", request),
    ).toBe("https://example-tunnel.ngrok-free.dev/en/projects");
  });

  it("rewrites localhost redirects so installed mobile PWAs do not navigate to the phone itself", () => {
    const request = makeRequest({
      "x-forwarded-host": "example-tunnel.ngrok-free.dev",
      "x-forwarded-proto": "https",
    });

    expect(
      normalizeProxyRedirectLocation("https://localhost/en", request),
    ).toBe("https://example-tunnel.ngrok-free.dev/en");
  });

  it("rewrites IPv6 loopback redirects to the public host", () => {
    const request = makeRequest({
      "x-forwarded-host": "example-tunnel.ngrok-free.dev",
      "x-forwarded-proto": "https",
    });

    expect(
      normalizeProxyRedirectLocation("https://[::1]/en/login", request),
    ).toBe("https://example-tunnel.ngrok-free.dev/en/login");
  });

  it("prefers a configured public origin over forwarded headers", () => {
    process.env.AUTH_URL = "https://dev.cp-command-center.com";
    const request = makeRequest({
      "x-forwarded-host": "spoofed.example.com",
      "x-forwarded-proto": "https",
    });

    expect(
      normalizeProxyRedirectLocation("https://localhost/en/login", request),
    ).toBe("https://dev.cp-command-center.com/en/login");
  });

  it("rejects forwarded hosts with userinfo delimiters", () => {
    const request = makeRequest({
      host: "safe.example.com",
      "x-forwarded-host": "good.example.com@evil.example.com",
      "x-forwarded-proto": "https",
    });

    expect(
      normalizeProxyRedirectLocation("https://localhost/en/login", request),
    ).toBe("https://safe.example.com/en/login");
  });

  it("rejects Host header values with userinfo delimiters", () => {
    const request = makeRequest({
      host: "good.example.com@evil.example.com",
      "x-forwarded-proto": "https",
    });

    expect(
      normalizeProxyRedirectLocation("https://localhost/en/login", request),
    ).toBe("https://0.0.0.0/en/login");
  });

  it("strips Railway internal ports from https redirects", () => {
    const request = makeRequest({
      "x-forwarded-host": "command-center-reboot-dev.up.railway.app",
      "x-forwarded-proto": "https",
    });

    expect(
      normalizeProxyRedirectLocation("https://command-center-reboot-dev.up.railway.app:8080/en/login", request),
    ).toBe("https://command-center-reboot-dev.up.railway.app/en/login");
  });
});
