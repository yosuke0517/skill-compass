import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("quiz result viewport motion", () => {
  it("anchors the result overlay to the visible viewport", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const overlayRule = css.match(/\.result-motion-overlay\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(overlayRule).toContain("position: fixed");
    expect(overlayRule).toContain("inset: 0");
  });
});
