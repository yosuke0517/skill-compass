"use client";
import { useEffect, useRef, useState } from "react";
type Status = { enabled: boolean; time: string; lastError: string | null };
type Config = { configured: boolean; publicKey: string | null };
type Capability = { supported: boolean; ios: boolean; standalone: boolean; denied: boolean };
function isAppleMobile() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}
function publicKeyBytes(value: string) {
  const padded = `${value.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}
function messageFor(error: string) {
  if (error === "subscription_conflict")
    return "This browser subscription belongs to another account. Remove this site's notification permission, then enable it again while signed in to this account.";
  if (error === "test_unavailable_or_rate_limited")
    return "A test notification is unavailable right now. Wait a minute and confirm this device is still enabled.";
  if (error === "subscription_expired")
    return "This browser subscription has expired. Enable reminders again to create a new subscription.";
  if (error === "push_unavailable")
    return "The push service is temporarily unavailable. Please try again later.";
  if (error === "login_required")
    return "Your session has expired. Log in again before changing notification settings.";
  return "The notification setting could not be saved. Please try again.";
}
function deliveryError(error: string) {
  if (error === "subscription_expired" || error === "push_gone")
    return "The browser subscription expired and has been turned off. Enable reminders again to reconnect this device.";
  if (error === "push_unavailable")
    return "The last delivery could not reach the push service. The reminder will try again tomorrow.";
  return `The last delivery failed (${error}).`;
}
async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/notifications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(typeof result.error === "string" ? result.error : "request_failed");
  return result;
}
export function NotificationSettings() {
  const [status, setStatus] = useState<Status>({ enabled: false, time: "09:00", lastError: null });
  const [draftTime, setDraftTime] = useState("09:00");
  const [config, setConfig] = useState<Config | null>(null);
  const [capability, setCapability] = useState<Capability | null>(null);
  const [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null);
  const registration = useRef<Promise<ServiceWorkerRegistration> | null>(null);
  const subscription = useRef<PushSubscription | null>(null);
  useEffect(() => {
    let active = true;
    const supported =
      "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    const ios = isAppleMobile();
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    queueMicrotask(() => {
      if (active)
        setCapability({
          supported,
          ios,
          standalone,
          denied: supported && Notification.permission === "denied",
        });
    });
    if (supported) {
      const installed = navigator.serviceWorker.register("/sw.js");
      registration.current = installed.then(() => navigator.serviceWorker.ready);
      void registration.current.catch(() => {
        if (active) setError("The notification service could not start on this device.");
      });
    }
    void (async () => {
      try {
        const response = await fetch("/api/notifications"),
          nextConfig = (await response.json()) as Config;
        if (!response.ok)
          throw new Error((nextConfig as Config & { error?: string }).error ?? "load_failed");
        if (!active) return;
        setConfig(nextConfig);
        if (supported) {
          const worker = await registration.current;
          const current = (await worker?.pushManager.getSubscription()) ?? null;
          subscription.current = current;
          if (current) {
            const next = (await post({
              action: "status",
              endpoint: current.endpoint,
            })) as unknown as Status;
            if (active) {
              setStatus(next);
              setDraftTime(next.time);
            }
          }
        }
      } catch (cause) {
        if (active) setError(messageFor(cause instanceof Error ? cause.message : "load_failed"));
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  async function save(current: PushSubscription, time: string, success: string) {
    const next = (await post({
      action: "save",
      subscription: current.toJSON(),
      time,
    })) as unknown as Status;
    setStatus(next);
    setDraftTime(next.time);
    setNotice(success);
  }
  async function enable() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const permissionPromise = Notification.requestPermission();
      const permission = await permissionPromise;
      if (permission !== "granted") {
        setError(
          "Notifications are blocked in your browser settings. Allow them for this site, then try again.",
        );
        return;
      }
      const worker = await registration.current;
      if (!worker || !config?.publicKey) throw new Error("push_unavailable");
      let current = await worker.pushManager.getSubscription();
      if (current && status.lastError === "subscription_expired") {
        await current.unsubscribe();
        current = null;
        subscription.current = null;
      }
      current ??= await worker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKeyBytes(config.publicKey),
      });
      subscription.current = current;
      await save(current, draftTime, "Daily reminder enabled on this device.");
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : "request_failed"));
    } finally {
      setBusy(false);
    }
  }
  async function saveTime() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!subscription.current) throw new Error("subscription_expired");
      await save(subscription.current, draftTime, "Reminder time saved.");
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : "request_failed"));
    } finally {
      setBusy(false);
    }
  }
  async function action(kind: "disable" | "test") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const current = subscription.current;
      if (!current) throw new Error("subscription_expired");
      await post({ action: kind, endpoint: current.endpoint });
      if (kind === "disable") {
        setStatus((value) => ({ ...value, enabled: false }));
        setNotice("Daily reminder turned off on this device.");
      } else setNotice("Test notification sent.");
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "request_failed";
      if (code === "subscription_expired")
        setStatus((value) => ({ ...value, enabled: false, lastError: "subscription_expired" }));
      setError(messageFor(code));
    } finally {
      setBusy(false);
    }
  }
  const supported = capability?.supported ?? false,
    denied = capability?.denied ?? false;
  const unavailable = !supported || !config?.configured || !config.publicKey;
  return (
    <section
      className="management-card notification-settings"
      aria-labelledby="notification-heading"
    >
      <div className="management-card-heading">
        <div>
          <h2 id="notification-heading">Today reminder</h2>
          <p>A daily reminder at Japan time on this browser or device.</p>
        </div>
        <strong>{loaded ? (status.enabled ? "On" : "Off") : "Loading…"}</strong>
      </div>
      {capability?.ios && !capability.standalone ? (
        <p className="notification-guidance">
          On iPhone or iPad, use Share → Add to Home Screen, then open Skill Compass from your Home
          Screen to enable reminders.
        </p>
      ) : null}
      {capability && !supported && !(capability.ios && !capability.standalone) ? (
        <p className="notification-guidance">
          This browser does not support web push notifications. Try a current browser or install the
          app on a supported device.
        </p>
      ) : null}
      {denied ? (
        <p className="notification-guidance">
          Notifications are blocked in your browser settings. Allow notifications for Skill Compass,
          then return here.
        </p>
      ) : null}
      {config && !config.configured ? (
        <p className="notification-guidance">
          New notification subscriptions have not been configured for this environment. You can
          still turn off an existing reminder.
        </p>
      ) : null}
      {status.lastError ? (
        <p className="notification-guidance">{deliveryError(status.lastError)}</p>
      ) : null}
      <label className="notification-time">
        Reminder time{" "}
        <input
          aria-label="Reminder time"
          type="time"
          value={draftTime}
          disabled={busy}
          onChange={(event) => setDraftTime(event.target.value)}
        />
        <span>Japan time</span>
      </label>
      <div className="notification-actions">
        {status.enabled ? (
          <>
            <button
              type="button"
              disabled={busy || draftTime === status.time}
              onClick={() => void saveTime()}
            >
              Save reminder time
            </button>
            <button type="button" disabled={busy} onClick={() => void action("test")}>
              Send test notification
            </button>
            <button
              className="ghost-button"
              type="button"
              disabled={busy}
              onClick={() => void action("disable")}
            >
              Turn off reminders
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={
              busy || unavailable || denied || Boolean(capability?.ios && !capability.standalone)
            }
            onClick={() => void enable()}
          >
            Enable reminders
          </button>
        )}
      </div>
      {notice ? (
        <p className="notification-success" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="notification-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
