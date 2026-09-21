import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("notification PWA", () => {
  it("provides an installable standalone manifest with PNG icons", () => {
    expect(manifest()).toMatchObject({ name: "Skill Compass", start_url: "/today", display: "standalone", icons: expect.arrayContaining([
      expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }),
    ]) });
  });

  it("service worker shows a fixed Today notification and does not cache pages", () => {
    const source = readFileSync("public/sw.js", "utf8");
    expect(source).toContain('url: "/today"');
    expect(source).toContain("showNotification");
    expect(source).toContain("notificationclick");
    expect(source).not.toMatch(/caches\.|cache\.put|fetch.*addEventListener/);
  });
});
