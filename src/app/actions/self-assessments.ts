"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";

import { selfAssessments } from "@/db/schema";
import { requireCurrentUser } from "@/lib/access/current-user";
import { getMaintenanceMode } from "@/lib/runtime/maintenance";

export async function saveSelfAssessmentAction(formData: FormData) {
  const user = await requireCurrentUser();
  if (getMaintenanceMode() === "read_only") redirect("/maintenance");
  const subjectId = String(formData.get("subjectId") ?? "");
  const rating = Number(formData.get("rating") ?? Number.NaN);

  if (!subjectId || Number.isNaN(rating) || rating < 0 || rating > 1) {
    redirect("/skills?error=invalid-rating");
  }

  const { db } = await import("@/db/client");
  const assessedOn = new Date();
  const owner = createHash("sha256").update(user.id).digest("hex").slice(0, 12);
  const event = createHash("sha256")
    .update(`${user.id}:${subjectId}:${assessedOn.toISOString()}:${Date.now()}`)
    .digest("hex")
    .slice(0, 24);

  await db.insert(selfAssessments).values({
    id: `self_${owner}_${event}`,
    userId: user.id,
    subjectType: "category",
    subjectId,
    rating,
    note: null,
    assessedOn,
  });

  revalidatePath("/skills");
  revalidatePath("/dashboard");
  redirect("/skills");
}
