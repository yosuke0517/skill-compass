import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  datetime,
  double,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const difficultyValues = ["beginner", "intermediate", "advanced"] as const;
export const sourceTrustTierValues = ["tier1", "tier2", "tier3", "tier4"] as const;
export const sourceStatusValues = ["active", "failed", "pending"] as const;
export const jobStatusValues = ["pending", "running", "succeeded", "failed"] as const;
export const scoreSubjectTypeValues = ["category", "tag", "concept"] as const;
export const selfAssessmentSubjectTypeValues = ["category", "tag"] as const;

export const sourceTrustTierEnum = {
  enumValues: sourceTrustTierValues,
};

export const categories = mysqlTable("categories", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  description: text("description"),
  displayOrder: int("display_order").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const tags = mysqlTable(
  "tags",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    categoryId: varchar("category_id", { length: 64 })
      .notNull()
      .references(() => categories.id),
    name: varchar("name", { length: 96 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [index("tags_category_idx").on(table.categoryId)],
);

export const concepts = mysqlTable("concepts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  summary: text("summary"),
  currentUnderstanding: text("current_understanding"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
});

export const conceptTags = mysqlTable(
  "concept_tags",
  {
    conceptId: varchar("concept_id", { length: 64 })
      .notNull()
      .references(() => concepts.id),
    tagId: varchar("tag_id", { length: 64 })
      .notNull()
      .references(() => tags.id),
  },
  (table) => [primaryKey({ columns: [table.conceptId, table.tagId] })],
);

export const sources = mysqlTable("sources", {
  id: varchar("id", { length: 64 }).primaryKey(),
  title: varchar("title", { length: 240 }).notNull(),
  url: varchar("url", { length: 1024 }).notNull(),
  trustTier: mysqlEnum("trust_tier", sourceTrustTierValues).notNull(),
  official: boolean("official").default(false).notNull(),
  status: mysqlEnum("status", sourceStatusValues).default("pending").notNull(),
  lastFetchedAt: datetime("last_fetched_at"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const conceptSources = mysqlTable(
  "concept_sources",
  {
    conceptId: varchar("concept_id", { length: 64 })
      .notNull()
      .references(() => concepts.id),
    sourceId: varchar("source_id", { length: 64 })
      .notNull()
      .references(() => sources.id),
  },
  (table) => [primaryKey({ columns: [table.conceptId, table.sourceId] })],
);

export type QuestionChoice = {
  id: string;
  label: string;
  correct: boolean;
};

export const questions = mysqlTable(
  "questions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    conceptId: varchar("concept_id", { length: 64 })
      .notNull()
      .references(() => concepts.id),
    sourceId: varchar("source_id", { length: 64 }).references(() => sources.id),
    prompt: text("prompt").notNull(),
    choices: json("choices").$type<QuestionChoice[]>().notNull(),
    difficulty: mysqlEnum("difficulty", difficultyValues).notNull(),
    rationale: text("rationale").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [index("questions_concept_idx").on(table.conceptId)],
);

export const quizDays = mysqlTable("quiz_days", {
  id: varchar("id", { length: 64 }).primaryKey(),
  quizDate: date("quiz_date").notNull(),
  preparedAt: datetime("prepared_at").notNull(),
}, (table) => [uniqueIndex("quiz_days_quiz_date_idx").on(table.quizDate)]);

export const quizDayQuestions = mysqlTable(
  "quiz_day_questions",
  {
    quizDayId: varchar("quiz_day_id", { length: 64 })
      .notNull()
      .references(() => quizDays.id),
    questionId: varchar("question_id", { length: 64 })
      .notNull()
      .references(() => questions.id),
    slot: int("slot").notNull(),
    reason: varchar("reason", { length: 64 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.quizDayId, table.questionId] })],
);

export const answers = mysqlTable(
  "answers",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    quizDayId: varchar("quiz_day_id", { length: 64 })
      .notNull()
      .references(() => quizDays.id),
    questionId: varchar("question_id", { length: 64 })
      .notNull()
      .references(() => questions.id),
    selectedChoiceId: varchar("selected_choice_id", { length: 16 }).notNull(),
    confidence: int("confidence").notNull(),
    reasoning: text("reasoning").notNull(),
    correct: boolean("correct"),
    reasoningQuality: varchar("reasoning_quality", { length: 32 }),
    feedback: text("feedback"),
    scoreDelta: double("score_delta"),
    nextReviewOn: date("next_review_on"),
    answeredAt: datetime("answered_at").notNull(),
  },
  (table) => [
    index("answers_quiz_day_idx").on(table.quizDayId),
    index("answers_question_idx").on(table.questionId),
  ],
);

export const scores = mysqlTable(
  "scores",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    subjectType: mysqlEnum("subject_type", scoreSubjectTypeValues).notNull(),
    subjectId: varchar("subject_id", { length: 64 }).notNull(),
    value: double("value").notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
  },
  (table) => [index("scores_subject_idx").on(table.subjectType, table.subjectId)],
);

export const selfAssessments = mysqlTable(
  "self_assessments",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    subjectType: mysqlEnum("subject_type", selfAssessmentSubjectTypeValues).notNull(),
    subjectId: varchar("subject_id", { length: 64 }).notNull(),
    rating: double("rating").notNull(),
    note: text("note"),
    assessedOn: date("assessed_on").notNull(),
  },
  (table) => [index("self_assessments_subject_idx").on(table.subjectType, table.subjectId)],
);

export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  expiresAt: datetime("expires_at").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const exportRuns = mysqlTable("export_runs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  status: mysqlEnum("status", jobStatusValues).notNull(),
  outputPath: varchar("output_path", { length: 1024 }),
  error: text("error"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  finishedAt: datetime("finished_at"),
});

export const jobRuns = mysqlTable("job_runs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 96 }).notNull(),
  status: mysqlEnum("status", jobStatusValues).notNull(),
  error: text("error"),
  startedAt: datetime("started_at").notNull(),
  finishedAt: datetime("finished_at"),
});

export const categoryRelations = relations(categories, ({ many }) => ({
  tags: many(tags),
}));

export const tagRelations = relations(tags, ({ one, many }) => ({
  category: one(categories, {
    fields: [tags.categoryId],
    references: [categories.id],
  }),
  conceptTags: many(conceptTags),
}));

export const conceptRelations = relations(concepts, ({ many }) => ({
  conceptTags: many(conceptTags),
  conceptSources: many(conceptSources),
  questions: many(questions),
}));

export const conceptTagRelations = relations(conceptTags, ({ one }) => ({
  concept: one(concepts, {
    fields: [conceptTags.conceptId],
    references: [concepts.id],
  }),
  tag: one(tags, {
    fields: [conceptTags.tagId],
    references: [tags.id],
  }),
}));

export const sourceRelations = relations(sources, ({ many }) => ({
  conceptSources: many(conceptSources),
  questions: many(questions),
}));

export const questionRelations = relations(questions, ({ one }) => ({
  concept: one(concepts, {
    fields: [questions.conceptId],
    references: [concepts.id],
  }),
  source: one(sources, {
    fields: [questions.sourceId],
    references: [sources.id],
  }),
}));
