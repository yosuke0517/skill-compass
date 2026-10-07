"use client";
import { useEffect, useRef, useState } from "react";
const permissionDismissed =
  "Notification permission was not granted. Tap Enable reminders again and allow notifications when prompted.";
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
  if (error === "permission_timeout")
    return "The notification permission request did not respond. Close and reopen the Home Screen app, then try again.";
  if (error === "worker_timeout")
    return "The notification service did not become ready. Close and reopen the app, then try again.";
  if (error === "subscription_timeout")
    return "Device registration did not respond. Check your connection, reopen the app, and try again.";
  if (error === "request_timeout")
    return "The server did not respond. Your notification setting could not be confirmed. Reload Settings to check it before trying again.";
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
function withDeadline<T>(promise: PromiseLike<T>, code: string, milliseconds = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(code)), milliseconds);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}
async function post(body: Record<string, unknown>) {
  return withDeadline(send(body), "request_timeout");
}
async function send(body: Record<string, unknown>) {
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
  const [progress, setProgress] = useState<string | null>(null);
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
    const refreshPermission = () => {
      if (!active || document.visibilityState === "hidden") return;
      setCapability({
        supported,
        ios,
        standalone,
        denied: supported && Notification.permission === "denied",
      });
      if (supported && Notification.permission === "granted") {
        setError((current) => (current === permissionDismissed ? null : current));
      }
    };
    queueMicrotask(refreshPermission);
    window.addEventListener("focus", refreshPermission);
    window.addEventListener("pageshow", refreshPermission);
    document.addEventListener("visibilitychange", refreshPermission);
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
      window.removeEventListener("focus", refreshPermission);
      window.removeEventListener("pageshow", refreshPermission);
      document.removeEventListener("visibilitychange", refreshPermission);
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
    setProgress("Waiting for notification permission…");
    try {
      // Keep the permission request in the click handler's user activation.
      const permissionPromise = Notification.requestPermission();
      const permission = await withDeadline(permissionPromise, "permission_timeout", 30000);
      setCapability((current) =>
        current ? { ...current, denied: permission === "denied" } : current,
      );
      if (permission !== "granted") {
        if (permission === "default") setError(permissionDismissed);
        return;
      }
      setProgress("Preparing notifications…");
      const worker = await withDeadline(Promise.resolve(registration.current), "worker_timeout");
      if (!worker || !config?.publicKey) throw new Error("push_unavailable");
      setProgress("Registering this device…");
      let current = await withDeadline(
        worker.pushManager.getSubscription(),
        "subscription_timeout",
      );
      if (current && status.lastError === "subscription_expired") {
        await withDeadline(current.unsubscribe(), "subscription_timeout");
        current = null;
        subscription.current = null;
      }
      current ??= await withDeadline(
        worker.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKeyBytes(config.publicKey),
        }),
        "subscription_timeout",
      );
      subscription.current = current;
      setProgress("Saving reminder settings…");
      await save(current, draftTime, "Daily reminder enabled on this device.");
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : "request_failed"));
    } finally {
      setProgress(null);
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
  const needsInstallation = Boolean(capability?.ios && !capability.standalone);
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
      {needsInstallation ? (
        <aside
          id="notification-install-warning"
          className="notification-install-warning"
          role="note"
          aria-labelledby="notification-install-heading"
        >
          <strong id="notification-install-heading">Home Screen app required</strong>
          <p>
            On iPhone or iPad, notifications only work when you open Skill Compass from your Home
            Screen. Reminders cannot be enabled in this browser tab.
          </p>
          <ol>
            <li>Open the browser’s Share menu and choose Add to Home Screen.</li>
            <li>Open Skill Compass from its Home Screen icon.</li>
            <li>Return to Settings and enable reminders.</li>
          </ol>
        </aside>
      ) : null}
      {capability && !supported && !(capability.ios && !capability.standalone) ? (
        <p className="notification-guidance">
          This browser does not support web push notifications. Try a current browser or install the
          app on a supported device.
        </p>
      ) : null}
      {denied ? (
        <p className="notification-guidance" role="alert" id="notification-permission-help">
          {capability?.ios
            ? "通知がオフになっています。iPhone／iPadの「設定 → 通知 → Skill Compass」で「通知を許可」をオンにして、この画面に戻ってください。リマインダーがOffの場合は「Enable reminders」を押してください。"
            : "Notifications are blocked in your browser settings. Allow notifications for Skill Compass, then return here. If reminders are Off, select Enable reminders."}
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
            <button type="button" disabled={busy || denied} onClick={() => void action("test")}>
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
            disabled={busy || unavailable || denied || needsInstallation}
            aria-describedby={
              needsInstallation
                ? "notification-install-warning"
                : denied
                  ? "notification-permission-help"
                  : undefined
            }
            onClick={() => void enable()}
          >
            {progress ? "Enabling reminders…" : "Enable reminders"}
          </button>
        )}
        <button
          type="button"
          className="ghost-button"
          disabled={busy}
          onClick={() => {
            if (
              draftTime !== status.time &&
              !window.confirm("保存していない時刻の変更を破棄して再読み込みしますか？")
            )
              return;
            window.location.reload();
          }}
        >
          再読み込み
        </button>
      </div>
      {needsInstallation && !status.enabled ? (
        <p className="notification-install-reason">Add to Home Screen first to enable reminders.</p>
      ) : null}
      {progress ? <p role="status">{progress}</p> : null}
      {!progress && notice ? (
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
