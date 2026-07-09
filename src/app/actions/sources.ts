"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { sources } from "@/db/schema";

const trustTiers = new Set(["tier1", "tier2", "tier3", "tier4"]);

export async function saveSourceAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const trustTier = String(formData.get("trustTier") ?? "tier3");
  const official = formData.get("official") === "on";

  if (!title || !url || !trustTiers.has(trustTier)) {
    redirect("/sources?error=invalid-source");
  }

  const { db } = await import("@/db/client");
  const id = `source_${slugify(title)}_${Date.now().toString(36)}`;

  await db.insert(sources).values({
    id,
    title,
    url,
    trustTier: trustTier as "tier1" | "tier2" | "tier3" | "tier4",
    official,
    status: "pending",
  });

  revalidatePath("/sources");
  redirect("/sources");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "source";
}
