import { and, eq } from "drizzle-orm";

import { xDailyTechDigestCache } from "@/db/schema";
import type { DailyTechDigest } from "@/lib/x/daily-digest";

export async function getCachedDailyDigest(userId: string, localDate: string) {
  const { db } = await import("@/db/client");
  const localDateValue = new Date(`${localDate}T00:00:00.000Z`);
  const [row] = await db
    .select()
    .from(xDailyTechDigestCache)
    .where(
      and(
        eq(xDailyTechDigestCache.userId, userId),
        eq(xDailyTechDigestCache.localDate, localDateValue),
      ),
    )
    .limit(1);
  return row
    ? {
        digest: row.digest as DailyTechDigest,
        expiresAt: row.expiresAt,
      }
    : null;
}

export async function saveCachedDailyDigest(
  userId: string,
  localDate: string,
  digest: DailyTechDigest,
  expiresAt: Date,
) {
  const { db } = await import("@/db/client");
  const localDateValue = new Date(`${localDate}T00:00:00.000Z`);
  await db
    .insert(xDailyTechDigestCache)
    .values({
      userId,
      localDate: localDateValue,
      digest,
      generatedAt: new Date(digest.generatedAt),
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [xDailyTechDigestCache.userId, xDailyTechDigestCache.localDate],
      set: {
        digest,
        generatedAt: new Date(digest.generatedAt),
        expiresAt,
      },
    });
}
