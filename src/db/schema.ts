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
export const userStatusValues = ["active", "invited", "disabled"] as const;
export const userRoleValues = ["admin", "normal"] as const;
export const userPlanValues = ["free", "pro"] as const;
export const oauthProviderValues = ["google-calendar", "x"] as const;

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

export const translationCache = mysqlTable(
  "translation_cache",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    sourceHash: varchar("source_hash", { length: 64 }).notNull(),
    sourceText: text("source_text").notNull(),
    sourceLocale: varchar("source_locale", { length: 8 }).notNull(),
    targetLocale: varchar("target_locale", { length: 8 }).notNull(),
    purpose: varchar("purpose", { length: 64 }).notNull(),
    translatedText: text("translated_text").notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    lastUsedAt: timestamp("last_used_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
  },
  (table) => [uniqueIndex("translation_cache_source_hash_idx").on(table.sourceHash)],
);

export const users = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 120 }),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    status: mysqlEnum("status", userStatusValues).default("active").notNull(),
    role: varchar("role", { length: 32 }).default("normal").notNull(),
    plan: varchar("plan", { length: 32 }).default("free").notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

export const invites = mysqlTable(
  "invites",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    invitedByUserId: varchar("invited_by_user_id", { length: 64 }).references(() => users.id),
    expiresAt: datetime("expires_at").notNull(),
    usedAt: datetime("used_at"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [
    uniqueIndex("invites_token_hash_idx").on(table.tokenHash),
    index("invites_email_idx").on(table.email),
  ],
);

export const entitlements = mysqlTable("entitlements", {
  id: varchar("id", { length: 96 }).primaryKey(),
  description: varchar("description", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const planEntitlements = mysqlTable(
  "plan_entitlements",
  {
    planId: varchar("plan_id", { length: 32 }).notNull(),
    entitlementId: varchar("entitlement_id", { length: 96 })
      .notNull()
      .references(() => entitlements.id),
    enabled: boolean("enabled").default(true).notNull(),
  },
  (table) => [primaryKey({ columns: [table.planId, table.entitlementId] })],
);

export const userEntitlementOverrides = mysqlTable(
  "user_entitlement_overrides",
  {
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id),
    entitlementId: varchar("entitlement_id", { length: 96 })
      .notNull()
      .references(() => entitlements.id),
    enabled: boolean("enabled").notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.entitlementId] })],
);

export type AuditMetadata = Record<string, string | number | boolean | null>;

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    actorUserId: varchar("actor_user_id", { length: 64 })
      .notNull()
      .references(() => users.id),
    action: varchar("action", { length: 96 }).notNull(),
    targetType: varchar("target_type", { length: 48 }).notNull(),
    targetId: varchar("target_id", { length: 96 }).notNull(),
    metadata: json("metadata").$type<AuditMetadata>().notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [
    index("audit_logs_actor_idx").on(table.actorUserId),
    index("audit_logs_target_idx").on(table.targetType, table.targetId),
  ],
);

export const podcastFrequencyValues = ["daily", "weekdays", "weekly", "manual"] as const;
export const podcastLanguageValues = ["ja", "en"] as const;
export const podcastSourceFrequencyValues = ["daily", "every_3_days", "weekly", "every_14_days", "monthly"] as const;

export const podcastSettings = mysqlTable(
  "podcast_settings",
  {
    userId: varchar("user_id", { length: 64 }).primaryKey().references(() => users.id),
    generationFrequency: varchar("generation_frequency", { length: 32 }).default("daily").notNull(),
    timezone: varchar("timezone", { length: 64 }).default("Asia/Tokyo").notNull(),
    durationMinutes: int("duration_minutes").default(10).notNull(),
    language: varchar("language", { length: 8 }).default("ja").notNull(),
    useSources: boolean("use_sources").default(true).notNull(),
    includeNews: boolean("include_news").default(true).notNull(),
    includeCalendar: boolean("include_calendar").default(false).notNull(),
    includeXPublic: boolean("include_x_public").default(false).notNull(),
    includeXPersonal: boolean("include_x_personal").default(false).notNull(),
    calendarReadMode: varchar("calendar_read_mode", { length: 32 }).default("time_title").notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
  },
);

export const sourcePodcastSettings = mysqlTable(
  "source_podcast_settings",
  {
    userId: varchar("user_id", { length: 64 }).notNull().references(() => users.id),
    sourceId: varchar("source_id", { length: 64 }).notNull().references(() => sources.id),
    enabled: boolean("enabled").default(true).notNull(),
    frequency: varchar("frequency", { length: 32 }).default("daily").notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.sourceId] })],
);

export const podcastEpisodeStatusValues = ["queued", "collecting", "scripting", "synthesizing", "ready", "failed"] as const;
export const podcastJobStatusValues = ["queued", "running", "succeeded", "failed"] as const;

export const podcastEpisodes = mysqlTable(
  "podcast_episodes",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 64 }).notNull().references(() => users.id),
    localDate: date("local_date").notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    language: varchar("language", { length: 8 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    sourceSnapshot: json("source_snapshot").$type<Array<{ id: string; title: string; url: string }>>().notNull(),
    script: json("script").$type<{ language: "ja" | "en"; speakers: Array<{ speaker: "host_a" | "host_b"; text: string }> } | null>(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
  },
  (table) => [index("podcast_episodes_user_idx").on(table.userId, table.localDate)],
);

export const podcastJobs = mysqlTable(
  "podcast_jobs",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    episodeId: varchar("episode_id", { length: 64 }).notNull().references(() => podcastEpisodes.id),
    userId: varchar("user_id", { length: 64 }).notNull().references(() => users.id),
    kind: varchar("kind", { length: 48 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    attempts: int("attempts").default(0).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    nextRunAt: datetime("next_run_at").notNull(),
    leaseOwner: varchar("lease_owner", { length: 96 }),
    leaseExpiresAt: datetime("lease_expires_at"),
    errorCode: varchar("error_code", { length: 96 }),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
  },
  (table) => [uniqueIndex("podcast_jobs_idempotency_idx").on(table.idempotencyKey), index("podcast_jobs_claim_idx").on(table.status, table.nextRunAt)],
);

export const podcastAssets = mysqlTable(
  "podcast_assets",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    episodeId: varchar("episode_id", { length: 64 }).notNull().references(() => podcastEpisodes.id),
    userId: varchar("user_id", { length: 64 }).notNull().references(() => users.id),
    language: varchar("language", { length: 8 }).notNull(),
    storageProvider: varchar("storage_provider", { length: 32 }).notNull(),
    storageKey: varchar("storage_key", { length: 1024 }).notNull(),
    mediaType: varchar("media_type", { length: 96 }).notNull(),
    sizeBytes: int("size_bytes").notNull(),
    durationSeconds: int("duration_seconds"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [index("podcast_assets_episode_idx").on(table.episodeId)],
);

export const podcastAudioChunks = mysqlTable(
  "podcast_audio_chunks",
  {
    episodeId: varchar("episode_id", { length: 64 }).notNull().references(() => podcastEpisodes.id),
    chunkIndex: int("chunk_index").notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    storageProvider: varchar("storage_provider", { length: 32 }),
    storageKey: varchar("storage_key", { length: 1024 }),
    mediaType: varchar("media_type", { length: 96 }),
    sizeBytes: int("size_bytes"),
    attempts: int("attempts").default(0).notNull(),
    errorCode: varchar("error_code", { length: 96 }),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.episodeId, table.chunkIndex] })],
);

export const podcastChatMessages = mysqlTable(
  "podcast_chat_messages",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    episodeId: varchar("episode_id", { length: 64 }).notNull().references(() => podcastEpisodes.id),
    userId: varchar("user_id", { length: 64 }).notNull().references(() => users.id),
    role: varchar("role", { length: 16 }).notNull(),
    text: text("text").notNull(),
    provider: varchar("provider", { length: 32 }),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [index("podcast_chat_messages_episode_idx").on(table.episodeId, table.createdAt)],
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

export const oauthConnections = mysqlTable(
  "oauth_connections",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 64 }).notNull().references(() => users.id),
    provider: varchar("provider", { length: 32 }).notNull(),
    accessTokenCiphertext: text("access_token_ciphertext").notNull(),
    refreshTokenCiphertext: text("refresh_token_ciphertext"),
    tokenType: varchar("token_type", { length: 32 }),
    scope: text("scope"),
    expiresAt: datetime("expires_at"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
  },
  (table) => [uniqueIndex("oauth_connections_user_provider_idx").on(table.userId, table.provider)],
);

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
