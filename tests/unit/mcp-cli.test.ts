import { describe, expect, it } from "vitest";

import { formatSmokeSummary } from "@/lib/mcp/cli";

describe("MCP smoke summary", () => {
  it("prints server and tool names without token material", () => {
    expect(
      formatSmokeSummary({
        serverName: "skill-compass",
        tools: ["get_today", "submit_today_answer"],
        today: { complete: false },
      }),
    ).toBe(
      [
        "Server: skill-compass",
        "Tools: get_today, submit_today_answer",
        'Today: {"complete":false}',
      ].join("\n"),
    );
  });
});
