import { describe, expect, it } from "vitest";
import {
  calculateAssistantDefaultPosition,
  clampAssistantPosition,
} from "@/components/assistant/today-assistant-widget";

describe("Today assistant viewport positioning", () => {
  it("uses the visual viewport when Safari browser chrome changes the visible area", () => {
    const position = calculateAssistantDefaultPosition({
      width: 390,
      height: 620,
      offsetLeft: 0,
      offsetTop: 96,
    });

    expect(position).toEqual({ x: 310, y: 562 });
  });

  it("clamps dragged positions inside the visual viewport", () => {
    const position = clampAssistantPosition(
      { x: 360, y: 900 },
      {
        width: 390,
        height: 620,
        offsetLeft: 0,
        offsetTop: 96,
      },
    );

    expect(position).toEqual({ x: 310, y: 636 });
  });
});
