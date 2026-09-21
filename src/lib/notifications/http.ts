import type { NotificationRepository } from "./repository";
import { requestSchema, type BrowserSubscription } from "./validation";

type Dependencies = {
  repo: Pick<NotificationRepository, "status" | "save" | "disable" | "claimTest" | "complete">;
  send: (subscription: BrowserSubscription, test?: boolean) => Promise<number>;
  configured: boolean;
  userId: string | null;
  readOnly: boolean;
  now: Date;
};
export function notificationJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
export async function handleNotificationRequest(
  request: Request,
  deps: Dependencies,
): Promise<Response> {
  if (!deps.userId) return notificationJson({ error: "login_required" }, 401);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return notificationJson({ error: "invalid_origin" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return notificationJson({ error: "invalid_request" }, 400);
  if (Number(request.headers.get("content-length")) > 8192)
    return notificationJson({ error: "request_too_large" }, 413);
  const text = await request.text();
  if (text.length > 8192) return notificationJson({ error: "request_too_large" }, 413);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return notificationJson({ error: "invalid_request" }, 400);
  }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return notificationJson({ error: "invalid_request" }, 400);
  const data = parsed.data;
  try {
    if (data.action === "status")
      return notificationJson(await deps.repo.status(deps.userId, data.endpoint));
    if (deps.readOnly) return notificationJson({ error: "maintenance_read_only" }, 503);
    if (data.action === "disable") {
      await deps.repo.disable(deps.userId, data.endpoint);
      return notificationJson({ ok: true });
    }
    if (!deps.configured) return notificationJson({ error: "push_not_configured" }, 503);
    if (data.action === "save") {
      await deps.repo.save(deps.userId, data.subscription, data.time, deps.now);
      return notificationJson(await deps.repo.status(deps.userId, data.subscription.endpoint));
    }
    const row = await deps.repo.claimTest(deps.userId, data.endpoint, deps.now);
    if (!row) return notificationJson({ error: "test_unavailable_or_rate_limited" }, 429);
    let status = 0;
    try {
      status = await deps.send(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        true,
      );
    } catch {
      /* The endpoint and encryption keys must never enter logs or responses. */
    }
    const gone = status === 404 || status === 410;
    const error = gone
      ? "subscription_expired"
      : status >= 200 && status < 300
        ? null
        : "push_unavailable";
    await deps.repo.complete(row, error, gone);
    return error ? notificationJson({ error }, gone ? 410 : 502) : notificationJson({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "subscription_conflict")
      return notificationJson({ error: "subscription_conflict" }, 409);
    return notificationJson({ error: "notification_unavailable" }, 503);
  }
}
