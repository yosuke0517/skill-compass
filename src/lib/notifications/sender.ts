import { buildPushPayload } from "@block65/webcrypto-web-push";
import { subscriptionSchema, type BrowserSubscription } from "./validation";

export type PushConfiguration = { publicKey: string; privateKey: string; subject: string };
export type PushEnvironment = {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};
export function pushConfiguration(env: PushEnvironment): PushConfiguration | null {
  const {
    VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: privateKey,
    VAPID_SUBJECT: subject,
  } = env;
  if (
    !publicKey ||
    !/^[A-Za-z0-9_-]{87}$/.test(publicKey) ||
    !privateKey ||
    !/^[A-Za-z0-9_-]{43}$/.test(privateKey) ||
    !subject
  )
    return null;
  try {
    if (!["https:", "mailto:"].includes(new URL(subject).protocol)) return null;
  } catch {
    return null;
  }
  return { publicKey, privateKey, subject };
}
export function createPushSender(config: PushConfiguration, fetcher: typeof fetch = fetch) {
  return async (subscription: BrowserSubscription, test = false): Promise<number> => {
    const safeSubscription = subscriptionSchema.parse(subscription);
    const payload = await buildPushPayload(
      {
        data: JSON.stringify({
          title: test ? "Today通知のテスト" : "今日の学習を始めましょう",
          body: test
            ? "通知を押すとTodayが開きます。"
            : "Todayの問題が待っています。タップして始めましょう。",
          url: "/today",
          tag: test ? "today-test" : "today-reminder",
        }),
        options: { ttl: 900 },
      },
      { ...safeSubscription, expirationTime: null },
      config,
    );
    const response = await fetcher(safeSubscription.endpoint, {
      ...payload,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
    return response.status;
  };
}
