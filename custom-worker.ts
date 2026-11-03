// The OpenNext fetch handler is generated during build:cloudflare.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- generated module is absent before the build
import handler from "./.open-next/worker.js";
import { dispatchNotifications } from "./src/lib/notifications/dispatch";
import { purgeInterviewLearning } from "./src/lib/interview/learning-store";
import { routeInterviewRelay, type InterviewRelayEnvironment } from "./src/lib/interview/cloudflare-relay";
export { InterviewRelay } from "./src/lib/interview/cloudflare-relay";
import {
  createPushSender,
  pushConfiguration,
  type PushEnvironment,
} from "./src/lib/notifications/sender";

type Env = CloudflareEnv & PushEnvironment & InterviewRelayEnvironment;
const worker = {
  fetch(request: Request, env: Env, context: unknown) {
    return routeInterviewRelay(request, env) ?? handler.fetch(request, env, context);
  },
  async scheduled(_controller: unknown, env: Env) {
    if (env.MAINTENANCE_MODE === "read_only") return;
    await purgeInterviewLearning(env.DB);
    const config = pushConfiguration(env);
    if (!config) return;
    const result = await dispatchNotifications(env.DB, createPushSender(config), new Date());
    // Counts only: subscriptions, provider responses, and keys never enter logs.
    console.info("today_notifications", result);
  },
};

export default worker;
