import { z } from "zod";
import { TIME_PATTERN } from "./schedule";
export function isPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname;
    return (
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (host === "fcm.googleapis.com" ||
        host === "web.push.apple.com" ||
        host.endsWith(".push.services.mozilla.com") ||
        host.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export const endpointSchema = z.string().max(2048).refine(isPushEndpoint);
export const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }),
});
export type BrowserSubscription = z.infer<typeof subscriptionSchema>;
export const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), endpoint: endpointSchema }),
  z.object({
    action: z.literal("save"),
    subscription: subscriptionSchema,
    time: z.string().regex(TIME_PATTERN),
  }),
  z.object({ action: z.literal("disable"), endpoint: endpointSchema }),
  z.object({ action: z.literal("test"), endpoint: endpointSchema }),
]);
