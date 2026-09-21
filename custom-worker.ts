// The OpenNext fetch handler is generated during build:cloudflare.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- generated module is absent before the build
import handler from "./.open-next/worker.js";
import { dispatchNotifications } from "./src/lib/notifications/dispatch";
import {
  createPushSender,
  pushConfiguration,
  type PushEnvironment,
} from "./src/lib/notifications/sender";

type Env = CloudflareEnv & PushEnvironment & { MAINTENANCE_MODE?: string };
const worker = {
  fetch: handler.fetch,
  async scheduled(_controller: unknown, env: Env) {
    if (env.MAINTENANCE_MODE === "read_only") return;
    const config = pushConfiguration(env);
    if (!config) return;
    const result = await dispatchNotifications(env.DB, createPushSender(config), new Date());
    // Counts only: subscriptions, provider responses, and keys never enter logs.
    console.info("today_notifications", result);
  },
};

export default worker;
