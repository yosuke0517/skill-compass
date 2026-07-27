import { db } from "@/db/client";
import {
  buildConceptSeedRows,
  learningSourceRows,
} from "@/db/learning-seed-data";
import { createQuestionSeedPlan, toQuestionUpdate } from "@/db/seed-question-bank";
import { eq, inArray } from "drizzle-orm";
import {
  categories,
  conceptSources,
  concepts,
  conceptTags,
  entitlements,
  planEntitlements,
  questions,
  scores,
  selfAssessments,
  sources,
  tags,
  users,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { learningCatalog } from "@/lib/quiz/content/catalog";
import { reviewedQuestionBank } from "@/lib/quiz/content/question-bank";
import { validateQuestionBank } from "@/lib/quiz/content/validate-question-bank";

const categoryRows = learningCatalog.map((category, index) => ({
  id: category.id,
  name: category.name,
  description: `Practical ${category.name} decisions and production scenarios.`,
  displayOrder: index + 1,
}));

const tagRows = learningCatalog.flatMap((category) =>
  category.subtopics.map((subtopic) => ({
    id: tagId(category.id, subtopic.id),
    categoryId: category.id,
    name: subtopic.name,
    description: `${category.name}: ${subtopic.name} practical coverage.`,
  })),
);

const conceptRows = buildConceptSeedRows(reviewedQuestionBank);

const conceptTagRows = reviewedQuestionBank.map((question) => ({
  conceptId: question.conceptId,
  tagId: tagId(question.categoryId, question.subtopicId),
}));

const conceptSourceRows = reviewedQuestionBank.map((question) => ({
  conceptId: question.conceptId,
  sourceId: question.sourceId,
}));

const entitlementRows = [
  { id: "podcast.sample.view", description: "Podcast sampleを表示する" },
  { id: "podcast.generate", description: "個人Podcastを生成する" },
  { id: "podcast.download", description: "Podcast音声をdownloadする" },
  { id: "podcast.chat", description: "Podcast内容について質問する" },
  { id: "calendar.connect", description: "Google Calendarを接続する" },
  { id: "x.personal_sources", description: "個人X Sourceを利用する" },
  { id: "podcast.english.generate", description: "英語版Podcastを生成する" },
  { id: "x.publish", description: "承認済みPodcastをXへ投稿する" },
  { id: "integration.manage", description: "外部連携設定を管理する" },
  { id: "access.manage", description: "role、plan、entitlementを管理する" },
] as const;

const freeEntitlementIds = ["podcast.sample.view"] as const;
const proEntitlementIds = [
  "podcast.sample.view",
  "podcast.generate",
  "podcast.download",
  "podcast.chat",
  "calendar.connect",
  "x.personal_sources",
] as const;

function tagId(categoryId: string, subtopicId: string) {
  return `tag_${categoryId}_${subtopicId}`;
}

async function seedLearningCatalog() {
  // The starter catalog used this unique name under a legacy ID. Free the
  // canonical catalog name before inserting the stable taxonomy ID.
  await db
    .update(categories)
    .set({ name: "Infrastructure (legacy)" })
    .where(eq(categories.id, "cat_infrastructure"));

  for (const category of categoryRows) {
    await db
      .insert(categories)
      .values(category)
      .onDuplicateKeyUpdate({
        set: {
          name: category.name,
          description: category.description,
          displayOrder: category.displayOrder,
        },
      });
  }

  for (const tag of tagRows) {
    await db
      .insert(tags)
      .values(tag)
      .onDuplicateKeyUpdate({
        set: {
          categoryId: tag.categoryId,
          name: tag.name,
          description: tag.description,
        },
      });
  }

  for (const concept of conceptRows) {
    await db
      .insert(concepts)
      .values(concept)
      .onDuplicateKeyUpdate({
        set: {
          title: concept.title,
          summary: concept.summary,
          currentUnderstanding: concept.currentUnderstanding,
        },
      });
  }

  for (const source of learningSourceRows) {
    await db
      .insert(sources)
      .values(source)
      .onDuplicateKeyUpdate({
        set: {
          title: source.title,
          url: source.url,
          trustTier: source.trustTier,
          official: source.official,
          status: source.status,
        },
      });
  }

  await db
    .delete(conceptSources)
    .where(inArray(conceptSources.conceptId, conceptRows.map((concept) => concept.id)));
  await db.insert(conceptTags).ignore().values(conceptTagRows);
  await db.insert(conceptSources).ignore().values(conceptSourceRows);
}

async function seedReviewedQuestions() {
  validateQuestionBank(reviewedQuestionBank);
  const plan = createQuestionSeedPlan(reviewedQuestionBank);
  await db.update(questions).set({ active: false });

  for (const row of plan.rows) {
    await db
      .insert(questions)
      .values(row)
      .onDuplicateKeyUpdate({ set: toQuestionUpdate(row) });
  }
}

async function main() {
  validateQuestionBank(reviewedQuestionBank);

  await db
    .insert(users)
    .values({
      id: "user_local",
      email: "local@example.com",
      displayName: "Local User",
      passwordHash: await hashPassword("local-password"),
      status: "active",
      role: "admin",
      plan: "pro",
    })
    .onDuplicateKeyUpdate({ set: { role: "admin", plan: "pro", status: "active" } });

  await db.insert(users).ignore().values({
    id: "user_member",
    email: "member@example.com",
    displayName: "Local Member",
    passwordHash: await hashPassword("local-password"),
    status: "active",
    role: "normal",
    plan: "free",
  });

  await db.insert(entitlements).ignore().values([...entitlementRows]);
  await db.insert(planEntitlements).ignore().values([
    ...freeEntitlementIds.map((entitlementId) => ({ planId: "free", entitlementId, enabled: true })),
    ...proEntitlementIds.map((entitlementId) => ({ planId: "pro", entitlementId, enabled: true })),
  ]);

  await seedLearningCatalog();
  await seedReviewedQuestions();

  await db
    .insert(scores)
    .ignore()
    .values([
      ...categoryRows.map((category) => ({
        id: `score_${category.id}`,
        userId: "user_local",
        subjectType: "category" as const,
        subjectId: category.id,
        value: 0.45,
      })),
      ...tagRows.map((tag) => ({
        id: `score_${tag.id}`,
        userId: "user_local",
        subjectType: "tag" as const,
        subjectId: tag.id,
        value: 0.45,
      })),
      ...conceptRows.map((concept) => ({
        id: `score_${concept.id}`,
        userId: "user_local",
        subjectType: "concept" as const,
        subjectId: concept.id,
        value: 0.45,
      })),
    ]);

  await db
    .insert(selfAssessments)
    .ignore()
    .values(
      categoryRows.map((category) => ({
        id: `self_${category.id}_initial`,
        userId: "user_local",
        subjectType: "category" as const,
        subjectId: category.id,
        rating: 0.5,
        note: "Initial public-safe seed self assessment.",
        assessedOn: new Date("2026-07-08T00:00:00.000Z"),
      })),
    );
}

main()
  .then(() => {
    console.log("Seeded Skill Compass starter data.");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
