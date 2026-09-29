import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationSettings } from "@/components/notifications/notification-settings";
const key = "key",
  endpoint = "https://updates.push.services.mozilla.com/wpush/v2/device";
const response = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: async () => body } as Response);
function browser(existing = false, permission: NotificationPermission = "default", ios = false) {
  const order: string[] = [];
  const unsubscribe = vi.fn(async () => true);
  const subscription = {
    endpoint,
    unsubscribe,
    toJSON: () => ({ endpoint, keys: { p256dh: "p", auth: "a" } }),
  };
  const subscribe = vi.fn(async () => subscription);
  const registration = {
    active: {},
    pushManager: {
      getSubscription: vi.fn(async () => (existing ? subscription : null)),
      subscribe,
    },
  };
  const register = vi.fn(async () => {
    order.push("registered");
    return registration;
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register, ready: Promise.resolve(registration) },
  });
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: ios ? "iPhone" : "Chrome",
  });
  Object.defineProperty(navigator, "platform", { configurable: true, value: "Linux" });
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 0 });
  Object.defineProperty(navigator, "standalone", { configurable: true, value: false });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal(
    "atob",
    vi.fn(() => String.fromCharCode(4, 5, 6)),
  );
  vi.stubGlobal("Notification", {
    permission,
    requestPermission: vi.fn(async () => {
      order.push("permission");
      return permission === "denied" ? "denied" : "granted";
    }),
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  return { order, register, subscribe, unsubscribe };
}
describe("NotificationSettings", () => {
  beforeEach(() =>
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementationOnce(() => response({ configured: true, publicKey: key })),
    ),
  );
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it("starts off with no subscription and never requests permission on mount", async () => {
    const b = browser();
    render(<NotificationSettings />);
    await screen.findByText("Off");
    expect(b.register).toHaveBeenCalledWith("/sw.js");
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("loads endpoint status even when sending is not configured", async () => {
    browser(true);
    const f = vi.mocked(fetch);
    f.mockReset()
      .mockImplementationOnce(() => response({ configured: false, publicKey: null }))
      .mockImplementationOnce(() => response({ enabled: true, time: "08:15", lastError: null }));
    render(<NotificationSettings />);
    await screen.findByText("On");
    expect(JSON.parse(String(f.mock.calls[1][1]?.body))).toEqual({ action: "status", endpoint });
    expect(screen.getByRole("button", { name: "Turn off reminders" })).toBeTruthy();
  });
  it("shows iPhone installation guidance when push is unavailable", async () => {
    browser(false, "default", true);
    Reflect.deleteProperty(navigator, "serviceWorker");
    render(<NotificationSettings />);
    expect(await screen.findByRole("note")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Enable reminders" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it("explains why reminders are disabled in an iPhone browser tab even if push APIs exist", async () => {
    browser(false, "default", true);
    render(<NotificationSettings />);
    const warning = await screen.findByRole("note");
    expect(warning.textContent).toContain("Home Screen app required");
    expect(warning.textContent).toContain("Add to Home Screen");
    expect(warning.textContent).toContain("Open Skill Compass from its Home Screen icon");
    const button = screen.getByRole("button", { name: "Enable reminders" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-describedby")).toBe(warning.id);
    fireEvent.click(button);
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });
  it.each(["navigator", "display-mode"])(
    "hides the installation warning in an installed iPhone app (%s)",
    async (mode) => {
      browser(false, "default", true);
      if (mode === "navigator")
        Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
      else vi.mocked(matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
      render(<NotificationSettings />);
      await screen.findByText("Off");
      expect(screen.queryByRole("note")).toBeNull();
      expect(
        (screen.getByRole("button", { name: "Enable reminders" }) as HTMLButtonElement).disabled,
      ).toBe(false);
    },
  );
  it("does not require installation in a supported desktop browser", async () => {
    browser();
    render(<NotificationSettings />);
    await screen.findByText("Off");
    expect(screen.queryByRole("note")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Enable reminders" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
  it("recognizes iPadOS using its desktop user agent", async () => {
    browser();
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Macintosh)",
    });
    Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" });
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
    Reflect.deleteProperty(navigator, "serviceWorker");
    render(<NotificationSettings />);
    expect(await screen.findByText(/On iPhone or iPad/)).toBeTruthy();
  });
  it("enables only after worker readiness and a successful save", async () => {
    const b = browser();
    const f = vi.mocked(fetch);
    f.mockReset()
      .mockImplementationOnce(() => response({ configured: true, publicKey: key }))
      .mockImplementationOnce(() => response({ enabled: true, time: "18:30", lastError: null }));
    render(<NotificationSettings />);
    await screen.findByText("Off");
    fireEvent.change(screen.getByLabelText("Reminder time"), { target: { value: "18:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Enable reminders" }));
    expect(b.order).toContain("permission");
    await screen.findByText("On");
    expect(b.order.indexOf("registered")).toBeLessThan(b.order.indexOf("permission"));
    expect(b.subscribe).toHaveBeenCalled();
    expect(JSON.parse(String(f.mock.calls[1][1]?.body))).toMatchObject({
      action: "save",
      time: "18:30",
      subscription: { endpoint },
    });
  });
  it("shows progress immediately and times out a silent permission request without saving", async () => {
    const b = browser(false, "default", true);
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
    let resolvePermission!: (value: NotificationPermission) => void;
    vi.mocked(Notification.requestPermission).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePermission = resolve;
        }),
    );
    render(<NotificationSettings />);
    await screen.findByText("Off");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Enable reminders" }));
    expect(Notification.requestPermission).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toMatch(/Waiting for notification permission/i);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(screen.getByRole("alert").textContent).toMatch(/permission request did not respond/i);
    expect(
      (screen.getByRole("button", { name: "Enable reminders" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    await act(async () => {
      resolvePermission("granted");
    });
    expect(b.subscribe).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("reports stalled subscription registration rather than staying silently busy", async () => {
    const b = browser();
    b.subscribe.mockImplementation(() => new Promise(() => {}));
    render(<NotificationSettings />);
    await screen.findByText("Off");
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enable reminders" }));
    });
    expect(screen.getByRole("status").textContent).toMatch(/Registering this device/i);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(screen.getByRole("alert").textContent).toMatch(/device registration did not respond/i);
    expect(screen.getByText("Off")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not describe a dismissed permission prompt as blocked", async () => {
    browser();
    vi.mocked(Notification.requestPermission).mockResolvedValue("default");
    render(<NotificationSettings />);
    await screen.findByText("Off");
    fireEvent.click(screen.getByRole("button", { name: "Enable reminders" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/permission was not granted/i);
  });
  it("updates an enabled time without requesting permission again", async () => {
    browser(true);
    const f = vi.mocked(fetch);
    f.mockReset()
      .mockImplementationOnce(() => response({ configured: true, publicKey: key }))
      .mockImplementationOnce(() => response({ enabled: true, time: "09:00", lastError: null }))
      .mockImplementationOnce(() => response({ enabled: true, time: "17:45", lastError: null }));
    render(<NotificationSettings />);
    await screen.findByText("On");
    fireEvent.change(screen.getByLabelText("Reminder time"), { target: { value: "17:45" } });
    fireEvent.click(screen.getByRole("button", { name: "Save reminder time" }));
    await screen.findByText("Reminder time saved.");
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    expect(JSON.parse(String(f.mock.calls[2][1]?.body))).toMatchObject({
      action: "save",
      time: "17:45",
      subscription: { endpoint },
    });
  });
  it("includes the endpoint in test and disable requests", async () => {
    browser(true);
    const f = vi.mocked(fetch);
    f.mockReset()
      .mockImplementationOnce(() => response({ configured: true, publicKey: key }))
      .mockImplementationOnce(() => response({ enabled: true, time: "09:00", lastError: null }))
      .mockImplementationOnce(() => response({ ok: true }))
      .mockImplementationOnce(() => response({ ok: true }));
    render(<NotificationSettings />);
    await screen.findByText("On");
    fireEvent.click(screen.getByRole("button", { name: "Send test notification" }));
    await screen.findByText("Test notification sent.");
    fireEvent.click(screen.getByRole("button", { name: "Turn off reminders" }));
    await waitFor(() => expect(screen.getByText("Off")).toBeTruthy());
    expect(JSON.parse(String(f.mock.calls[2][1]?.body))).toEqual({ action: "test", endpoint });
    expect(JSON.parse(String(f.mock.calls[3][1]?.body))).toEqual({ action: "disable", endpoint });
  });
  it("does not describe an expired subscription as active", async () => {
    browser(true);
    const f = vi.mocked(fetch);
    f.mockReset()
      .mockImplementationOnce(() => response({ configured: true, publicKey: key }))
      .mockImplementationOnce(() =>
        response({ enabled: false, time: "09:00", lastError: "subscription_expired" }),
      );
    render(<NotificationSettings />);
    expect(await screen.findByText(/expired/)).toBeTruthy();
    expect(screen.queryByText(/remains active/)).toBeNull();
  });
  it("turns off after a 410 and replaces the expired browser subscription when re-enabled", async () => {
    const b = browser(true);
    const replacement = {
      endpoint: `${endpoint}/replacement`,
      unsubscribe: vi.fn(),
      toJSON: () => ({ endpoint: `${endpoint}/replacement`, keys: { p256dh: "new", auth: "new" } }),
    };
    b.subscribe.mockResolvedValue(replacement);
    const f = vi.mocked(fetch);
    f.mockReset()
      .mockImplementationOnce(() => response({ configured: true, publicKey: key }))
      .mockImplementationOnce(() => response({ enabled: true, time: "09:00", lastError: null }))
      .mockImplementationOnce(() => response({ error: "subscription_expired" }, false))
      .mockImplementationOnce(() => response({ enabled: true, time: "09:00", lastError: null }));
    render(<NotificationSettings />);
    await screen.findByText("On");
    fireEvent.click(screen.getByRole("button", { name: "Send test notification" }));
    await screen.findByText("Off");
    fireEvent.click(screen.getByRole("button", { name: "Enable reminders" }));
    await screen.findByText("Daily reminder enabled on this device.");
    expect(b.unsubscribe).toHaveBeenCalled();
    expect(b.subscribe).toHaveBeenCalled();
    expect(JSON.parse(String(f.mock.calls[3][1]?.body))).toMatchObject({
      action: "save",
      subscription: { endpoint: `${endpoint}/replacement` },
    });
  });
});
