import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, redirect } = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/app/actions/auth", () => ({ loginAction: vi.fn() }));

import LoginPage from "@/app/(auth)/login/page";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects an authenticated visitor to the dashboard", async () => {
    getSession.mockResolvedValue({
      authenticated: true,
      userId: "user_1",
      email: "person@example.com",
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    await LoginPage({});

    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("renders the login form for an unauthenticated visitor", async () => {
    getSession.mockResolvedValue({ authenticated: false });

    render(await LoginPage({}));

    expect(screen.getByRole("button", { name: "Log in" })).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});
