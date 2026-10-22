import { describe, it, expect } from "vitest";
import { safeRedirectPath, withRedirectParam, DEFAULT_AFTER_LOGIN } from "../safe-redirect";
import { loginRedirect } from "../login-redirect";
import type { ParsedLocation } from "@tanstack/react-router";

describe("safeRedirectPath (#341)", () => {
  it.each([
    ["/playlists/abc", "/playlists/abc"],
    ["/library/artists/6nfz/albums/0tjM", "/library/artists/6nfz/albums/0tjM"],
    ["/library/search?q=glaive", "/library/search?q=glaive"],
    ["/playlists/abc#top", "/playlists/abc#top"],
    ["/playlists/join/XYZ123", "/playlists/join/XYZ123"],
    ["  /dashboard/discover  ", "/dashboard/discover"],
  ])("keeps same-origin app path %s", (raw, expected) => {
    expect(safeRedirectPath(raw)).toBe(expected);
  });

  it.each([
    ["https://evil.example/phish"],
    ["http://evil.example"],
    ["//evil.example"],
    ["//evil.example/path"],
    ["/\\evil.example"],
    ["\\\\evil.example"],
    ["javascript:alert(1)"],
    ["data:text/html,hi"],
    ["evil.example"],
    ["/\u0000/evil"],
    ["/\t/evil.example"],
    [""],
    ["   "],
  ])("rejects off-site or malformed %j → default", (raw) => {
    expect(safeRedirectPath(raw)).toBe(DEFAULT_AFTER_LOGIN);
  });

  it.each([["/login"], ["/login?redirect=/x"], ["/signup"], ["/two-factor"], ["/reset-password?token=t"], ["/api/auth/sign-out"], ["/api"]])(
    "rejects auth/API page %s (no loops, no API hits)",
    (raw) => {
      expect(safeRedirectPath(raw)).toBe(DEFAULT_AFTER_LOGIN);
    },
  );

  it("rejects non-strings and very long values", () => {
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeRedirectPath(["/playlists/a"])).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeRedirectPath(`/${"a".repeat(3000)}`)).toBe(DEFAULT_AFTER_LOGIN);
  });

  it("honours a custom fallback", () => {
    expect(safeRedirectPath("//evil.example", "/")).toBe("/");
  });
});

describe("withRedirectParam", () => {
  it("adds an encoded redirect param for non-default targets", () => {
    expect(withRedirectParam("/two-factor", "/library/search?q=a b")).toBe(
      "/two-factor?redirect=%2Flibrary%2Fsearch%3Fq%3Da%20b",
    );
  });
  it("keeps the URL clean for the default target", () => {
    expect(withRedirectParam("/two-factor", DEFAULT_AFTER_LOGIN)).toBe("/two-factor");
  });
});

describe("loginRedirect", () => {
  it("sends to /login with the original href as ?redirect=", () => {
    const r = loginRedirect({ href: "/playlists/abc?x=1" } as ParsedLocation) as unknown as {
      options: { to: string; search: { redirect: string } };
    };
    expect(r.options.to).toBe("/login");
    expect(r.options.search).toEqual({ redirect: "/playlists/abc?x=1" });
  });
});
