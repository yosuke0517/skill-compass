import type { BrowserSubscription } from "./validation";
import { isDueFresh, japanDate } from "./schedule";
import { NotificationRepository } from "./repository";

export async function dispatchNotifications(
  db: CloudflareEnv["DB"],
  send: (subscription: BrowserSubscription, test?: boolean) => Promise<number>,
  now = new Date(),
): Promise<{ sent: number; skipped: number; failed: number }> {
  const repository = new NotificationRepository(db);
  const result = { sent: 0, skipped: 0, failed: 0 };
  const nowSec = Math.floor(now.getTime() / 1000);
  for (const row of await repository.due(now)) {
    const dueDate = japanDate(new Date(row.next_run_at * 1000));
    if (dueDate !== japanDate(now) || !isDueFresh(row.next_run_at, nowSec)) {
      if (await repository.advanceStale(row, now)) result.skipped++;
      continue;
    }
    if (!await repository.claim(row, now)) continue;
    if (await repository.isTodayComplete(row.user_id, japanDate(now))) {
      result.skipped++;
      continue;
    }
    try {
      const status = await send({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } });
      if (status >= 200 && status < 300) {
        await repository.complete(row, null, false);
        result.sent++;
      } else {
        const gone = status === 404 || status === 410;
        await repository.complete(row, gone ? "subscription_expired" : "push_unavailable", gone);
        result.failed++;
      }
    } catch {
      await repository.complete(row, "push_unavailable", false);
      result.failed++;
    }
  }
  return result;
}
