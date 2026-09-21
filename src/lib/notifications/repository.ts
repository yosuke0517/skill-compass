import type { BrowserSubscription } from "./validation";
import { japanDate, nextNotificationAt } from "./schedule";

export type SubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  enabled: number;
  time: string;
  next_run_at: number;
  last_error: string | null;
  last_sent_date: string | null;
  last_test_at: number | null;
};

const columns = "id,user_id,endpoint,p256dh,auth,enabled,time,next_run_at,last_error,last_sent_date,last_test_at";

export class NotificationRepository {
  constructor(private readonly db: CloudflareEnv["DB"]) {}

  async status(userId: string, endpoint: string) {
    const row = await this.db.prepare("SELECT enabled,time,last_error FROM push_subscriptions WHERE user_id=? AND endpoint=?")
      .bind(userId, endpoint).first<{ enabled: number; time: string; last_error: string | null }>();
    return row ? { enabled: row.enabled === 1, time: row.time, lastError: row.last_error } : { enabled: false, time: "09:00", lastError: null };
  }

  async save(userId: string, subscription: BrowserSubscription, time: string, now: Date): Promise<void> {
    const existing = await this.db.prepare("SELECT user_id FROM push_subscriptions WHERE endpoint=?").bind(subscription.endpoint).first<{ user_id: string }>();
    if (existing && existing.user_id !== userId) throw new Error("subscription_conflict");
    try {
      const result = await this.db.prepare(`INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,enabled,time,next_run_at,last_error,updated_at)
        VALUES (?,?,?,?,?,1,?,?,NULL,?) ON CONFLICT(endpoint) DO UPDATE SET
        p256dh=excluded.p256dh,auth=excluded.auth,enabled=1,time=excluded.time,next_run_at=excluded.next_run_at,last_error=NULL,updated_at=excluded.updated_at
        WHERE push_subscriptions.user_id=excluded.user_id`)
        .bind(crypto.randomUUID(), userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, time, nextNotificationAt(time, now), Math.floor(now.getTime() / 1000)).run();
      if ((result.meta.changes ?? 0) === 0) throw new Error("subscription_conflict");
    } catch (error) {
      const owner = await this.db.prepare("SELECT user_id FROM push_subscriptions WHERE endpoint=?").bind(subscription.endpoint).first<{ user_id: string }>();
      if (owner && owner.user_id !== userId) throw new Error("subscription_conflict");
      throw error;
    }
  }

  async disable(userId: string, endpoint: string): Promise<void> {
    await this.db.prepare("UPDATE push_subscriptions SET enabled=0,updated_at=unixepoch() WHERE user_id=? AND endpoint=?").bind(userId, endpoint).run();
  }

  async claimTest(userId: string, endpoint: string, now: Date): Promise<SubscriptionRow | null> {
    const nowSec = Math.floor(now.getTime() / 1000);
    return this.db.prepare(`UPDATE push_subscriptions SET last_test_at=?,updated_at=?
      WHERE user_id=? AND endpoint=? AND enabled=1 AND (last_test_at IS NULL OR last_test_at<=?) RETURNING ${columns}`)
      .bind(nowSec, nowSec, userId, endpoint, nowSec - 60).first<SubscriptionRow>();
  }

  async due(now: Date): Promise<SubscriptionRow[]> {
    const result = await this.db.prepare(`SELECT ${columns.split(",").map((c) => `s.${c}`).join(",")}
      FROM push_subscriptions s JOIN users u ON u.id=s.user_id
      WHERE s.enabled=1 AND s.next_run_at<=? AND u.status='active' ORDER BY s.next_run_at LIMIT 100`)
      .bind(Math.floor(now.getTime() / 1000)).all<SubscriptionRow>();
    return result.results;
  }

  async claim(row: SubscriptionRow, now: Date): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE push_subscriptions SET last_sent_date=?,next_run_at=?,updated_at=?
      WHERE id=? AND enabled=1 AND next_run_at=? AND (last_sent_date IS NULL OR last_sent_date<>?)
      AND EXISTS (SELECT 1 FROM users WHERE users.id=push_subscriptions.user_id AND users.status='active')`)
      .bind(japanDate(now), nextNotificationAt(row.time, now), Math.floor(now.getTime() / 1000), row.id, row.next_run_at, japanDate(now)).run();
    return (result.meta.changes ?? 0) === 1;
  }

  async advanceStale(row: SubscriptionRow, now: Date): Promise<boolean> {
    const result = await this.db.prepare(`UPDATE push_subscriptions SET next_run_at=?,updated_at=?
      WHERE id=? AND enabled=1 AND next_run_at=?
      AND EXISTS (SELECT 1 FROM users WHERE users.id=push_subscriptions.user_id AND users.status='active')`)
      .bind(nextNotificationAt(row.time, now), Math.floor(now.getTime() / 1000), row.id, row.next_run_at).run();
    return (result.meta.changes ?? 0) === 1;
  }

  async complete(row: SubscriptionRow, error: string | null, gone: boolean): Promise<void> {
    await this.db.prepare("UPDATE push_subscriptions SET last_error=?,enabled=CASE WHEN ? THEN 0 ELSE enabled END,updated_at=unixepoch() WHERE id=? AND user_id=?")
      .bind(error, gone ? 1 : 0, row.id, row.user_id).run();
  }

  async isTodayComplete(userId: string, date: string): Promise<boolean> {
    const row = await this.db.prepare(`SELECT EXISTS (
      SELECT 1 FROM quiz_days qd JOIN quiz_day_questions qdq ON qdq.quiz_day_id=qd.id
      JOIN questions q ON q.id=qdq.question_id AND q.active=1
      WHERE qd.user_id=? AND date(qd.quiz_date,'unixepoch')=?
    ) AS has_questions, NOT EXISTS (
      SELECT 1 FROM quiz_days qd JOIN quiz_day_questions qdq ON qdq.quiz_day_id=qd.id
      JOIN questions q ON q.id=qdq.question_id AND q.active=1
      WHERE qd.user_id=? AND date(qd.quiz_date,'unixepoch')=? AND NOT EXISTS (
        SELECT 1 FROM answers a WHERE a.user_id=qd.user_id AND a.quiz_day_id=qd.id
        AND a.question_id=q.id AND a.correct IS NOT NULL
      )
    ) AS all_answered`).bind(userId, date, userId, date).first<{ has_questions: number; all_answered: number }>();
    return row?.has_questions === 1 && row.all_answered === 1;
  }
}
