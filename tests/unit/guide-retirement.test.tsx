import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GET } from "@/app/docs/cloud-migration/route";
import { AppNav } from "@/components/app-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/today" }));

it("keeps application navigation without exposing the retired Guide", () => {
  render(<AppNav />);
  expect(screen.queryByRole("link", { name: "Guide" })).toBeNull();
  expect(screen.getByRole("link", { name: "Today" }).getAttribute("href")).toBe("/today");
  expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
});

it("returns a non-cacheable Gone response with no infrastructure content", async () => {
  const response = GET();
  expect(response.status).toBe(410);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).toBe("This page is no longer available.");
});
