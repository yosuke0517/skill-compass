import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const stringColumn = (name: string) => text(name);
const booleanColumn = (name: string) => integer(name, { mode: "boolean" });
const timestampColumn = (name: string) => integer(name, { mode: "timestamp" });
const dateColumn = (name: string) => integer(name, { mode: "timestamp" });
const jsonColumn = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

export const difficultyValues = ["beginner", "intermediate", "advanced"] as const;
export const questionCaseTypeValues = [
  "basic_application",
  "common_failure",
  "design_tradeoff",
  "debugging_performance",
  "maintainability_safety",
] as const;
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

export const categories = sqliteTable("categories", {
  id: stringColumn("id").primaryKey(),
  name: stringColumn("name").notNull().unique(),
  description: text("description"),
  displayOrder: integer("display_order").notNull(),
  createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const tags = sqliteTable(
  "tags",
  {
    id: stringColumn("id").primaryKey(),
    categoryId: stringColumn("category_id")
      .notNull()
      .references(() => categories.id),
    name: stringColumn("name").notNull(),
    description: text("description"),
    createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [index("tags_category_idx").on(table.categoryId)],
);

export const translationCache = sqliteTable(
  "translation_cache",
  {
    id: stringColumn("id").primaryKey(),
    sourceHash: stringColumn("source_hash").notNull(),
    sourceText: text("source_text").notNull(),
    sourceLocale: stringColumn("source_locale").notNull(),
    targetLocale: stringColumn("target_locale").notNull(),
    purpose: stringColumn("purpose").notNull(),
    translatedText: text("translated_text").notNull(),
    provider: stringColumn("provider").notNull(),
    createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    lastUsedAt: timestampColumn("last_used_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [uniqueIndex("translation_cache_source_hash_idx").on(table.sourceHash)],
);

export const users = sqliteTable(
  "users",
  {
    id: stringColumn("id").primaryKey(),
    email: stringColumn("email").notNull(),
    displayName: stringColumn("display_name"),
    passwordHash: stringColumn("password_hash").notNull(),
    status: text("status", { enum: userStatusValues }).default("active").notNull(),
    role: stringColumn("role").default("normal").notNull(),
    plan: stringColumn("plan").default("free").notNull(),
    createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestampColumn("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

export const invites = sqliteTable(
  "invites",
  {
    id: stringColumn("id").primaryKey(),
    email: stringColumn("email").notNull(),
    tokenHash: stringColumn("token_hash").notNull(),
    invitedByUserId: stringColumn("invited_by_user_id").references(() => users.id),
    expiresAt: timestampColumn("expires_at").notNull(),
    usedAt: timestampColumn("used_at"),
    createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [
    uniqueIndex("invites_token_hash_idx").on(table.tokenHash),
    index("invites_email_idx").on(table.email),
  ],
);

export const entitlements = sqliteTable("entitlements", {
  id: stringColumn("id").primaryKey(),
  description: stringColumn("description").notNull(),
  createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const planEntitlements = sqliteTable(
  "plan_entitlements",
  {
    planId: stringColumn("plan_id").notNull(),
    entitlementId: stringColumn("entitlement_id")
      .notNull()
      .references(() => entitlements.id),
    enabled: booleanColumn("enabled").default(true).notNull(),
  },
  (table) => [primaryKey({ columns: [table.planId, table.entitlementId] })],
);

export const userEntitlementOverrides = sqliteTable(
  "user_entitlement_overrides",
  {
    userId: stringColumn("user_id")
      .notNull()
      .references(() => users.id),
    entitlementId: stringColumn("entitlement_id")
      .notNull()
      .references(() => entitlements.id),
    enabled: booleanColumn("enabled").notNull(),
    updatedAt: timestampColumn("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.entitlementId] })],
);

export type AuditMetadata = Record<string, string | number | boolean | null>;

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: stringColumn("id").primaryKey(),
    actorUserId: stringColumn("actor_user_id")
      .notNull()
      .references(() => users.id),
    action: stringColumn("action").notNull(),
    targetType: stringColumn("target_type").notNull(),
    targetId: stringColumn("target_id").notNull(),
    metadata: jsonColumn<AuditMetadata>("metadata").notNull(),
    createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [
    index("audit_logs_actor_idx").on(table.actorUserId),
    index("audit_logs_target_idx").on(table.targetType, table.targetId),
  ],
);

export const podcastFrequencyValues = ["daily", "weekdays", "weekly", "manual"] as const;
export const podcastLanguageValues = ["ja", "en"] as const;
export const podcastSourceFrequencyValues = ["daily", "every_3_days", "weekly", "every_14_days", "monthly"] as const;

export const podcastSettings = sqliteTable(
  "podcast_settings",
  {
    userId: stringColumn("user_id").primaryKey().references(() => users.id),
    generationFrequency: stringColumn("generation_frequency").default("daily").notNull(),
    timezone: stringColumn("timezone").default("Asia/Tokyo").notNull(),
    durationMinutes: integer("duration_minutes").default(10).notNull(),
    language: stringColumn("language").default("ja").notNull(),
    useSources: booleanColumn("use_sources").default(true).notNull(),
    includeNews: booleanColumn("include_news").default(true).notNull(),
    includeCalendar: booleanColumn("include_calendar").default(false).notNull(),
    includeXPublic: booleanColumn("include_x_public").default(false).notNull(),
    includeXPersonal: booleanColumn("include_x_personal").default(false).notNull(),
    calendarReadMode: stringColumn("calendar_read_mode").default("time_title").notNull(),
    createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestampColumn("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
);

export const sourcePodcastSettings = sqliteTable(
  "source_podcast_settings",
  {
    userId: stringColumn("user_id").notNull().references(() => users.id),
    sourceId: stringColumn("source_id").notNull().references(() => sources.id),
    enabled: booleanColumn("enabled").default(true).notNull(),
    frequency: stringColumn("frequency").default("daily").notNull(),
    updatedAt: timestampColumn("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.sourceId] })],
);

export const podcastEpisodeStatusValues = ["queued", "collecting", "scripting", "synthesizing", "ready", "failed"] as const;
export const podcastJobStatusValues = ["queued", "running", "succeeded", "failed"] as const;

export const podcastEpisodes = sqliteTable(
  "podcast_episodes",
  {
    id: stringColumn("id").primaryKey(),
    userId: stringColumn("user_id").notNull().references(() => users.id),
    localDate: dateColumn("local_date").notNull(),
    title: stringColumn("title").notNull(),
    language: stringColumn("language").notNull(),
    status: stringColumn("status").notNull(),
    sourceSnapshot: jsonColumn<unknown>("source_snapshot").$type<Array<{ id: string; title: string; url: string }>>().notNull(),
    script: jsonColumn<unknown>("script").$type<{ language: "ja" | "en"; speakers: Array<{ speaker: "host_a" | "host_b"; text: string }> } | null>(),
    createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestampColumn("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [index("podcast_episodes_user_idx").on(table.userId, table.localDate)],
);

export const podcastJobs = sqliteTable(
  "podcast_jobs",
  {
    id: stringColumn("id").primaryKey(),
    episodeId: stringColumn("episode_id").notNull().references(() => podcastEpisodes.id),
    userId: stringColumn("user_id").notNull().references(() => users.id),
    kind: stringColumn("kind").notNull(),
    status: stringColumn("status").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    idempotencyKey: stringColumn("idempotency_key").notNull(),
    nextRunAt: timestampColumn("next_run_at").notNull(),
    leaseOwner: stringColumn("lease_owner"),
    leaseExpiresAt: timestampColumn("lease_expires_at"),
    errorCode: stringColumn("error_code"),
    createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestampColumn("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [uniqueIndex("podcast_jobs_idempotency_idx").on(table.idempotencyKey), index("podcast_jobs_claim_idx").on(table.status, table.nextRunAt)],
);

export const podcastAssets = sqliteTable(
  "podcast_assets",
  {
    id: stringColumn("id").primaryKey(),
    episodeId: stringColumn("episode_id").notNull().references(() => podcastEpisodes.id),
    userId: stringColumn("user_id").notNull().references(() => users.id),
    language: stringColumn("language").notNull(),
    storageProvider: stringColumn("storage_provider").notNull(),
    storageKey: stringColumn("storage_key").notNull(),
    mediaType: stringColumn("media_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    durationSeconds: integer("duration_seconds"),
    createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [index("podcast_assets_episode_idx").on(table.episodeId)],
);

export const podcastAudioChunks = sqliteTable(
  "podcast_audio_chunks",
  {
    episodeId: stringColumn("episode_id").notNull().references(() => podcastEpisodes.id),
    chunkIndex: integer("chunk_index").notNull(),
    status: stringColumn("status").notNull(),
    storageProvider: stringColumn("storage_provider"),
    storageKey: stringColumn("storage_key"),
    mediaType: stringColumn("media_type"),
    sizeBytes: integer("size_bytes"),
    attempts: integer("attempts").default(0).notNull(),
    errorCode: stringColumn("error_code"),
    createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestampColumn("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [primaryKey({ columns: [table.episodeId, table.chunkIndex] })],
);

export const podcastChatMessages = sqliteTable(
  "podcast_chat_messages",
  {
    id: stringColumn("id").primaryKey(),
    episodeId: stringColumn("episode_id").notNull().references(() => podcastEpisodes.id),
    userId: stringColumn("user_id").notNull().references(() => users.id),
    role: stringColumn("role").notNull(),
    text: text("text").notNull(),
    provider: stringColumn("provider"),
    createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [index("podcast_chat_messages_episode_idx").on(table.episodeId, table.createdAt)],
);

export const concepts = sqliteTable("concepts", {
  id: stringColumn("id").primaryKey(),
  title: stringColumn("title").notNull(),
  summary: text("summary"),
  currentUnderstanding: text("current_understanding"),
  createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestampColumn("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const conceptTags = sqliteTable(
  "concept_tags",
  {
    conceptId: stringColumn("concept_id")
      .notNull()
      .references(() => concepts.id),
    tagId: stringColumn("tag_id")
      .notNull()
      .references(() => tags.id),
  },
  (table) => [primaryKey({ columns: [table.conceptId, table.tagId] })],
);

export const sources = sqliteTable("sources", {
  id: stringColumn("id").primaryKey(),
  title: stringColumn("title").notNull(),
  url: stringColumn("url").notNull(),
  trustTier: text("trust_tier", { enum: sourceTrustTierValues }).notNull(),
  official: booleanColumn("official").default(false).notNull(),
  status: text("status", { enum: sourceStatusValues }).default("pending").notNull(),
  lastFetchedAt: timestampColumn("last_fetched_at"),
  failureReason: text("failure_reason"),
  createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const conceptSources = sqliteTable(
  "concept_sources",
  {
    conceptId: stringColumn("concept_id")
      .notNull()
      .references(() => concepts.id),
    sourceId: stringColumn("source_id")
      .notNull()
      .references(() => sources.id),
  },
  (table) => [primaryKey({ columns: [table.conceptId, table.sourceId] })],
);

export type QuestionCaseType = (typeof questionCaseTypeValues)[number];

export type QuestionArtifact = {
  kind: "code" | "sql" | "schema" | "api" | "config" | "diagram";
  title: string;
  language?: string;
  content: string;
};

export type QuestionChoice = {
  id: "a" | "b" | "c" | "d";
  label: string;
  correct: boolean;
  explanation: string;
  consequence: string;
};

export const questions = sqliteTable(
  "questions",
  {
    id: stringColumn("id").primaryKey(),
    conceptId: stringColumn("concept_id")
      .notNull()
      .references(() => concepts.id),
    sourceId: stringColumn("source_id").references(() => sources.id),
    scenario: text("scenario").notNull(),
    artifacts: jsonColumn<QuestionArtifact[]>("artifacts").notNull(),
    caseType: text("case_type", { enum: questionCaseTypeValues }).notNull(),
    decisionCriteria: jsonColumn<string[]>("decision_criteria").notNull(),
    practicalNotes: jsonColumn<string[]>("practical_notes").notNull(),
    checkQuestion: text("check_question").notNull(),
    prompt: text("prompt").notNull(),
    choices: jsonColumn<QuestionChoice[]>("choices").notNull(),
    difficulty: text("difficulty", { enum: difficultyValues }).notNull(),
    rationale: text("rationale").notNull(),
    active: booleanColumn("active").default(true).notNull(),
    createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [index("questions_concept_idx").on(table.conceptId)],
);

export const quizDays = sqliteTable("quiz_days", {
  id: stringColumn("id").primaryKey(),
  userId: stringColumn("user_id")
    .notNull()
    .references(() => users.id),
  quizDate: dateColumn("quiz_date").notNull(),
  preparedAt: timestampColumn("prepared_at").notNull(),
}, (table) => [uniqueIndex("quiz_days_user_date_idx").on(table.userId, table.quizDate)]);

export const quizDayQuestions = sqliteTable(
  "quiz_day_questions",
  {
    quizDayId: stringColumn("quiz_day_id")
      .notNull()
      .references(() => quizDays.id),
    questionId: stringColumn("question_id")
      .notNull()
      .references(() => questions.id),
    slot: integer("slot").notNull(),
    reason: stringColumn("reason").notNull(),
  },
  (table) => [primaryKey({ columns: [table.quizDayId, table.questionId] })],
);

export const answers = sqliteTable(
  "answers",
  {
    id: stringColumn("id").primaryKey(),
    userId: stringColumn("user_id")
      .notNull()
      .references(() => users.id),
    quizDayId: stringColumn("quiz_day_id")
      .notNull()
      .references(() => quizDays.id),
    questionId: stringColumn("question_id")
      .notNull()
      .references(() => questions.id),
    selectedChoiceId: stringColumn("selected_choice_id").notNull(),
    confidence: integer("confidence"),
    reasoning: text("reasoning").notNull(),
    correct: booleanColumn("correct"),
    reasoningQuality: stringColumn("reasoning_quality"),
    feedback: text("feedback"),
    scoreDelta: real("score_delta"),
    nextReviewOn: dateColumn("next_review_on"),
    answeredAt: timestampColumn("answered_at").notNull(),
  },
  (table) => [
    index("answers_user_quiz_day_idx").on(table.userId, table.quizDayId),
    index("answers_user_question_idx").on(table.userId, table.questionId),
  ],
);

export const scores = sqliteTable(
  "scores",
  {
    id: stringColumn("id").primaryKey(),
    userId: stringColumn("user_id")
      .notNull()
      .references(() => users.id),
    subjectType: text("subject_type", { enum: scoreSubjectTypeValues }).notNull(),
    subjectId: stringColumn("subject_id").notNull(),
    value: real("value").notNull(),
    updatedAt: timestampColumn("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [uniqueIndex("scores_user_subject_idx").on(table.userId, table.subjectType, table.subjectId)],
);

export const selfAssessments = sqliteTable(
  "self_assessments",
  {
    id: stringColumn("id").primaryKey(),
    userId: stringColumn("user_id")
      .notNull()
      .references(() => users.id),
    subjectType: text("subject_type", { enum: selfAssessmentSubjectTypeValues }).notNull(),
    subjectId: stringColumn("subject_id").notNull(),
    rating: real("rating").notNull(),
    note: text("note"),
    assessedOn: dateColumn("assessed_on").notNull(),
  },
  (table) => [index("self_assessments_user_subject_idx").on(table.userId, table.subjectType, table.subjectId)],
);

export const sessions = sqliteTable("sessions", {
  id: stringColumn("id").primaryKey(),
  expiresAt: timestampColumn("expires_at").notNull(),
  createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const oauthConnections = sqliteTable(
  "oauth_connections",
  {
    id: stringColumn("id").primaryKey(),
    userId: stringColumn("user_id").notNull().references(() => users.id),
    provider: stringColumn("provider").notNull(),
    accessTokenCiphertext: text("access_token_ciphertext").notNull(),
    refreshTokenCiphertext: text("refresh_token_ciphertext"),
    tokenType: stringColumn("token_type"),
    scope: text("scope"),
    expiresAt: timestampColumn("expires_at"),
    createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestampColumn("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [uniqueIndex("oauth_connections_user_provider_idx").on(table.userId, table.provider)],
);

export const xPublicPostCache = sqliteTable(
  "x_public_post_cache",
  {
    postId: stringColumn("post_id").primaryKey(),
    snapshot: jsonColumn<unknown>("snapshot").notNull(),
    fetchedAt: timestampColumn("fetched_at").notNull(),
    expiresAt: timestampColumn("expires_at").notNull(),
  },
  (table) => [index("x_public_post_cache_expires_idx").on(table.expiresAt)],
);

export const xDailyTechDigestCache = sqliteTable(
  "x_daily_tech_digest_cache",
  {
    userId: stringColumn("user_id")
      .notNull()
      .references(() => users.id),
    localDate: dateColumn("local_date").notNull(),
    digest: jsonColumn<unknown>("digest").notNull(),
    generatedAt: timestampColumn("generated_at").notNull(),
    expiresAt: timestampColumn("expires_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.localDate] }),
    index("x_daily_tech_digest_cache_expires_idx").on(table.expiresAt),
  ],
);

export const mcpOauthClients = sqliteTable("mcp_oauth_clients", {
  id: stringColumn("id").primaryKey(),
  redirectUris: jsonColumn<string[]>("redirect_uris").notNull(),
  clientName: stringColumn("client_name").notNull(),
  createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const mcpAuthorizationCodes = sqliteTable(
  "mcp_authorization_codes",
  {
    codeHash: stringColumn("code_hash").primaryKey(),
    clientId: stringColumn("client_id")
      .notNull()
      .references(() => mcpOauthClients.id),
    userId: stringColumn("user_id")
      .notNull()
      .references(() => users.id),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: stringColumn("code_challenge").notNull(),
    expiresAt: timestampColumn("expires_at").notNull(),
    usedAt: timestampColumn("used_at"),
  },
  (table) => [index("mcp_authorization_codes_user_idx").on(table.userId)],
);

export const mcpAccessTokens = sqliteTable(
  "mcp_access_tokens",
  {
    tokenHash: stringColumn("token_hash").primaryKey(),
    familyId: stringColumn("family_id"),
    clientId: stringColumn("client_id")
      .notNull()
      .references(() => mcpOauthClients.id),
    userId: stringColumn("user_id")
      .notNull()
      .references(() => users.id),
    expiresAt: timestampColumn("expires_at").notNull(),
    revokedAt: timestampColumn("revoked_at"),
    createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [index("mcp_access_tokens_user_idx").on(table.userId)],
);

export const mcpRefreshTokens = sqliteTable(
  "mcp_refresh_tokens",
  {
    tokenHash: stringColumn("token_hash").primaryKey(),
    familyId: stringColumn("family_id").notNull(),
    clientId: stringColumn("client_id")
      .notNull()
      .references(() => mcpOauthClients.id),
    userId: stringColumn("user_id")
      .notNull()
      .references(() => users.id),
    familyExpiresAt: timestampColumn("family_expires_at").notNull(),
    expiresAt: timestampColumn("expires_at").notNull(),
    consumedAt: timestampColumn("consumed_at"),
    replacementTokenHash: stringColumn("replacement_token_hash"),
    revokedAt: timestampColumn("revoked_at"),
    createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [
    index("mcp_refresh_tokens_family_idx").on(table.familyId),
    index("mcp_refresh_tokens_user_idx").on(table.userId),
  ],
);

export const exportRuns = sqliteTable("export_runs", {
  id: stringColumn("id").primaryKey(),
  status: text("status", { enum: jobStatusValues }).notNull(),
  outputPath: stringColumn("output_path"),
  error: text("error"),
  createdAt: timestampColumn("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  finishedAt: timestampColumn("finished_at"),
});

export const jobRuns = sqliteTable("job_runs", {
  id: stringColumn("id").primaryKey(),
  name: stringColumn("name").notNull(),
  status: text("status", { enum: jobStatusValues }).notNull(),
  error: text("error"),
  startedAt: timestampColumn("started_at").notNull(),
  finishedAt: timestampColumn("finished_at"),
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
