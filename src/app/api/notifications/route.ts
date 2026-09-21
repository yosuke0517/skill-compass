import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSession } from "@/lib/auth/session";
import { NotificationRepository } from "@/lib/notifications/repository";
import { handleNotificationRequest, notificationJson } from "@/lib/notifications/http";
import {
  createPushSender,
  pushConfiguration,
  type PushEnvironment,
} from "@/lib/notifications/sender";

type NotificationEnv = CloudflareEnv & PushEnvironment & { MAINTENANCE_MODE?: string };
async function context() {
  const session = await getSession();
  const { env: binding } = await getCloudflareContext({ async: true });
  const env = binding as NotificationEnv;
  const user =
    session.authenticated && session.userId
      ? await env.DB.prepare("SELECT id FROM users WHERE id = ? AND status = 'active'")
          .bind(session.userId)
          .first<{ id: string }>()
      : null;
  return { env, userId: user?.id ?? null, config: pushConfiguration(env) };
}
export async function GET() {
  try {
    const { userId, config } = await context();
    if (!userId) return notificationJson({ error: "login_required" }, 401);
    return notificationJson({ configured: !!config, publicKey: config?.publicKey ?? null });
  } catch {
    return notificationJson({ error: "notification_unavailable" }, 503);
  }
}
export async function POST(request: Request) {
  try {
    const { env, userId, config } = await context();
    return handleNotificationRequest(request, {
      repo: new NotificationRepository(env.DB),
      userId,
      configured: !!config,
      readOnly: env.MAINTENANCE_MODE === "read_only",
      now: new Date(),
      send: config
        ? createPushSender(config)
        : async () => {
            throw new Error("push_not_configured");
          },
    });
  } catch {
    return notificationJson({ error: "notification_unavailable" }, 503);
  }
}
