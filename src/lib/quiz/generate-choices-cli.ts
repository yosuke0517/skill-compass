import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const { eq, like } = await import("drizzle-orm");
const { db } = await import("@/db/client");
const { concepts, questions } = await import("@/db/schema");
const { getEnv } = await import("@/lib/env");
const { createKeychainGeminiChoiceGenerator } = await import("./choice-generator");

async function main() {
  const env = getEnv();
  if (env.QUIZ_GENERATION_PROVIDER !== "gemini") {
    throw new Error("Set QUIZ_GENERATION_PROVIDER=gemini before generating quiz choices.");
  }

  const generator = createKeychainGeminiChoiceGenerator({
    service: env.GEMINI_KEYCHAIN_SERVICE ?? "claude-company/gemini-api-key",
    account: env.GEMINI_KEYCHAIN_ACCOUNT,
    model: env.GEMINI_QUIZ_MODEL,
  });

  const rows = await db
    .select({ id: questions.id, prompt: questions.prompt, rationale: questions.rationale, conceptTitle: concepts.title, conceptSummary: concepts.summary })
    .from(questions)
    .innerJoin(concepts, eq(questions.conceptId, concepts.id))
    .where(like(questions.id, "question_%"));

  for (let index = 0; index < rows.length; index += 4) {
    const batch = rows.slice(index, index + 4);
    await Promise.all(batch.map(async (row) => {
      try {
        const choices = await generator.generate({
          prompt: row.prompt,
          conceptTitle: row.conceptTitle,
          conceptSummary: row.conceptSummary ?? row.conceptTitle,
          rationale: row.rationale,
        });
        await db.update(questions).set({ choices }).where(eq(questions.id, row.id));
        console.log(`Generated choices for ${row.id}`);
      } catch (error) {
        console.error(`Skipped ${row.id}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }));
  }

  console.log(`Processed ${rows.length} questions.`);
}

await main();
