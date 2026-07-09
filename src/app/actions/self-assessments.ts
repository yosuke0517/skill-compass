"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { selfAssessments } from "@/db/schema";

export async function saveSelfAssessmentAction(formData: FormData) {
  const subjectId = String(formData.get("subjectId") ?? "");
  const rating = Number(formData.get("rating") ?? Number.NaN);

  if (!subjectId || Number.isNaN(rating) || rating < 0 || rating > 1) {
    redirect("/skills?error=invalid-rating");
  }

  const { db } = await import("@/db/client");
  const assessedOn = new Date();

  await db.insert(selfAssessments).values({
    id: `self_${subjectId}_${assessedOn.toISOString().slice(0, 10)}_${Date.now().toString(36)}`,
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
