# Podcast Studio Phase 1: Access基盤 実装計画

> **Agentic worker向け:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`（推奨）または`superpowers:executing-plans`を使用し、このplanをTask単位で実装する。進捗はcheckbox（`- [ ]`）で管理する。

**Goal:** Podcast Studioの前提となる`admin / normal` role、`free / pro` plan、entitlement解決、user個別override、admin向けAccess Control画面を実装する。

**Architecture:** roleとplanを`users`へ追加し、capability catalog、plan default、user overrideを独立tableで管理する。session tokenにはuser identityだけを保持し、role、plan、entitlementはDBから取得して即時反映する。admin UIは既存のmobile-first app shellから分離したdesktop-first 3ペイン構成とし、すべての管理mutationをaudit logへ記録する。

**Tech Stack:** Next.js App Router、TypeScript、React Server Components、Server Actions、MySQL、Drizzle ORM、Vitest、Playwright、Lucide React

## Global Constraints

- ToC向けUIの標準言語は英語、admin向けUIの標準言語は日本語とする。
- role、plan、entitlement IDにはMySQL enumを使わず、`varchar`とapplication validationを使う。
- `admin` roleは`access.manage`を常に持ち、user overrideで無効化できない。
- 最後のactive adminを`normal`へ変更できない。
- roleとplanをsession tokenへ保存せず、権限確認時にDBの最新値を読む。
- Secret、個人account、private path、非公開運用情報をsource、migration、seed、test、documentへ含めない。
- mutationはactor、action、target、秘密情報を含まないmetadataを`audit_logs`へ保存する。
- 各Taskはtestを先に書き、対象testのfailを確認してから最小実装を行う。

## File Structure

### Database

- `src/db/schema.ts`: access control tableとrelationの正本。
- `src/db/seed.ts`: 公開可能なcapability、plan default、local admin、local memberを投入する。
- `drizzle/0004_access_control.sql`: access control migration。
- `drizzle/meta/_journal.json`: migration順序を登録する。

### Access Domain

- `src/lib/access/catalog.ts`: role、plan、entitlement IDとadmin固定grant。
- `src/lib/access/types.ts`: access domainのshared type。
- `src/lib/access/resolve-entitlements.ts`: plan defaultとuser overrideを合成するpure function。
- `src/lib/access/guards.ts`: last-admin保護などのpure access rule。
- `src/lib/access/current-user.ts`: session userをDBから読み、active userと権限を返すserver-only境界。
- `src/lib/admin/access-control.ts`: admin画面用read modelとpure builder。

### Mutations and UI

- `src/app/actions/admin-access.ts`: role、plan、plan default、user overrideのmutationとaudit。
- `src/app/(admin)/admin/layout.tsx`: admin routeの認証とdesktop shell。
- `src/app/(admin)/admin/access/page.tsx`: Access Control server page。
- `src/components/admin/admin-shell.tsx`: admin共通navigation。
- `src/components/admin/access-control-view.tsx`: 3ペインAccess UI。
- `src/app/(app)/settings/page.tsx`: admin userだけに管理画面へのlinkを表示する。
- `src/proxy.ts`: `/admin`をsession保護対象へ追加する。
- `src/app/globals.css`: admin desktop/mobile layout。

### Tests

- `tests/unit/schema-shape.test.ts`: access tableとcolumn shape。
- `tests/unit/access-control.test.ts`: entitlement解決とlast-admin rule。
- `tests/unit/admin-access-control.test.ts`: admin read model。
- `tests/e2e/admin-access.spec.ts`: admin route、3ペイン、mutation、normal user拒否。

---

### Task 1: Access Control Schema、Migration、Seed

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/seed.ts`
- Create: `drizzle/0004_access_control.sql`
- Modify: `drizzle/meta/_journal.json`
- Modify: `tests/unit/schema-shape.test.ts`

**Interfaces:**
- Consumes: 既存の`users` tableとDrizzle MySQL schema pattern。
- Produces: `users.role`、`users.plan`、`entitlements`、`planEntitlements`、`userEntitlementOverrides`、`auditLogs`。

- [x] **Step 1: schema shape testを追加する**

`tests/unit/schema-shape.test.ts`のimportへaccess tableを追加し、次のtestを追加する。

```ts
import {
  auditLogs,
  entitlements,
  planEntitlements,
  userEntitlementOverrides,
  users,
} from "@/db/schema";

it("defines extensible access control tables", () => {
  expect(users.role).toBeDefined();
  expect(users.plan).toBeDefined();
  expect(entitlements).toBeDefined();
  expect(planEntitlements).toBeDefined();
  expect(userEntitlementOverrides).toBeDefined();
  expect(auditLogs).toBeDefined();
});
```

- [x] **Step 2: testがfailすることを確認する**

Run:

```bash
pnpm test -- tests/unit/schema-shape.test.ts
```

Expected: `entitlements`などが`@/db/schema`からexportされていないためFAIL。

- [x] **Step 3: schemaへaccess tableを追加する**

`src/db/schema.ts`へ以下の定数とtableを追加する。roleとplanは`mysqlEnum`にしない。

```ts
export const userRoleValues = ["admin", "normal"] as const;
export const userPlanValues = ["free", "pro"] as const;

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
```

`users`へ以下のcolumnを追加する。

```ts
role: varchar("role", { length: 32 }).default("normal").notNull(),
plan: varchar("plan", { length: 32 }).default("free").notNull(),
```

relationは`users`からoverrideとaudit、各join tableからparentへ辿れるように定義する。

- [x] **Step 4: migrationを追加する**

`drizzle/0004_access_control.sql`へ、schemaと同じcolumn、primary key、foreign key、indexを作るSQLを書く。

```sql
ALTER TABLE `users` ADD `role` varchar(32) NOT NULL DEFAULT 'normal';
--> statement-breakpoint
ALTER TABLE `users` ADD `plan` varchar(32) NOT NULL DEFAULT 'free';
--> statement-breakpoint
CREATE TABLE `entitlements` (
  `id` varchar(96) NOT NULL,
  `description` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `entitlements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plan_entitlements` (
  `plan_id` varchar(32) NOT NULL,
  `entitlement_id` varchar(96) NOT NULL,
  `enabled` boolean NOT NULL DEFAULT true,
  CONSTRAINT `plan_entitlements_plan_id_entitlement_id_pk` PRIMARY KEY(`plan_id`,`entitlement_id`),
  CONSTRAINT `plan_entitlements_entitlement_id_fk` FOREIGN KEY (`entitlement_id`) REFERENCES `entitlements`(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_entitlement_overrides` (
  `user_id` varchar(64) NOT NULL,
  `entitlement_id` varchar(96) NOT NULL,
  `enabled` boolean NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `user_entitlement_overrides_user_id_entitlement_id_pk` PRIMARY KEY(`user_id`,`entitlement_id`),
  CONSTRAINT `user_entitlement_overrides_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  CONSTRAINT `user_entitlement_overrides_entitlement_id_fk` FOREIGN KEY (`entitlement_id`) REFERENCES `entitlements`(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
  `id` varchar(64) NOT NULL,
  `actor_user_id` varchar(64) NOT NULL,
  `action` varchar(96) NOT NULL,
  `target_type` varchar(48) NOT NULL,
  `target_id` varchar(96) NOT NULL,
  `metadata` json NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`),
  CONSTRAINT `audit_logs_actor_user_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actor_user_id`);
--> statement-breakpoint
CREATE INDEX `audit_logs_target_idx` ON `audit_logs` (`target_type`,`target_id`);
```

`drizzle/meta/_journal.json`の`entries`末尾へ次を追加する。

```json
{
  "idx": 3,
  "version": "5",
  "when": 1783659000000,
  "tag": "0004_access_control",
  "breakpoints": true
}
```

- [x] **Step 5: public-safe seedを追加する**

`src/db/seed.ts`へ以下のcatalogを追加する。

```ts
const entitlementRows = [
  { id: "podcast.sample.view", description: "Podcast sampleを表示する" },
  { id: "podcast.generate", description: "個人Podcastを生成する" },
  { id: "podcast.download", description: "Podcast音声をdownloadする" },
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
  "calendar.connect",
  "x.personal_sources",
] as const;
```

`user_local`は`admin / pro`としてupsertし、公開用の`member@example.com`を`normal / free`で追加する。両accountのpasswordは既存のpublic-safe local passwordをhash化する。

```ts
await db
  .insert(users)
  .values({
    id: "user_local",
    email: "local@example.com",
    displayName: "Local Admin",
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

await db.insert(entitlements).ignore().values(entitlementRows);
await db.insert(planEntitlements).ignore().values([
  ...freeEntitlementIds.map((entitlementId) => ({ planId: "free", entitlementId, enabled: true })),
  ...proEntitlementIds.map((entitlementId) => ({ planId: "pro", entitlementId, enabled: true })),
]);
```

- [x] **Step 6: schema testとmigration適用を確認する**

Run:

```bash
pnpm test -- tests/unit/schema-shape.test.ts
pnpm db:migrate
pnpm db:seed
```

Expected: test PASS、migration成功、seed commandがexit 0。

- [ ] **Step 7: commitする**

```bash
git add src/db/schema.ts src/db/seed.ts drizzle/0004_access_control.sql drizzle/meta/_journal.json tests/unit/schema-shape.test.ts
git commit -m "feat: add access control data model"
```

---

### Task 2: Entitlement ResolverとCurrent User境界

**Files:**
- Create: `src/lib/access/catalog.ts`
- Create: `src/lib/access/types.ts`
- Create: `src/lib/access/resolve-entitlements.ts`
- Create: `src/lib/access/current-user.ts`
- Modify: `src/lib/auth/session.ts`
- Modify: `tests/unit/auth.test.ts`
- Create: `tests/unit/access-control.test.ts`

**Interfaces:**
- Consumes: `users`、`planEntitlements`、`userEntitlementOverrides`、`requireSession()`。
- Produces: `RoleId`、`PlanId`、`EntitlementId`、`CurrentUserAccess`、`resolveEntitlements()`、`requireCurrentUser()`、`requireAdmin()`。

- [x] **Step 1: resolverのfailing testを書く**

`tests/unit/access-control.test.ts`を作成する。

```ts
import { describe, expect, it } from "vitest";
import { resolveEntitlements } from "@/lib/access/resolve-entitlements";

describe("resolveEntitlements", () => {
  it("applies user overrides after plan defaults", () => {
    const result = resolveEntitlements({
      role: "normal",
      planDefaults: ["podcast.sample.view", "podcast.generate"],
      overrides: [
        { entitlementId: "podcast.generate", enabled: false },
        { entitlementId: "podcast.download", enabled: true },
      ],
    });

    expect([...result]).toEqual(["podcast.download", "podcast.sample.view"]);
  });

  it("always grants admin management capabilities", () => {
    const result = resolveEntitlements({
      role: "admin",
      planDefaults: [],
      overrides: [{ entitlementId: "access.manage", enabled: false }],
    });

    expect(result.has("access.manage")).toBe(true);
    expect(result.has("integration.manage")).toBe(true);
    expect(result.has("podcast.english.generate")).toBe(true);
    expect(result.has("x.publish")).toBe(true);
  });
});
```

- [x] **Step 2: testがfailすることを確認する**

Run: `pnpm test -- tests/unit/access-control.test.ts`

Expected: moduleが存在しないためFAIL。

- [x] **Step 3: catalogとtypeを実装する**

`src/lib/access/catalog.ts`:

```ts
export const ROLE_IDS = ["admin", "normal"] as const;
export const PLAN_IDS = ["free", "pro"] as const;
export const ENTITLEMENT_IDS = [
  "podcast.sample.view",
  "podcast.generate",
  "podcast.download",
  "calendar.connect",
  "x.personal_sources",
  "podcast.english.generate",
  "x.publish",
  "integration.manage",
  "access.manage",
] as const;

export const ADMIN_FIXED_ENTITLEMENTS = [
  "podcast.english.generate",
  "x.publish",
  "integration.manage",
  "access.manage",
] as const;
```

`src/lib/access/types.ts`:

```ts
import type { ENTITLEMENT_IDS, PLAN_IDS, ROLE_IDS } from "@/lib/access/catalog";

export type RoleId = (typeof ROLE_IDS)[number];
export type PlanId = (typeof PLAN_IDS)[number];
export type EntitlementId = (typeof ENTITLEMENT_IDS)[number];

export type EntitlementOverride = {
  entitlementId: EntitlementId;
  enabled: boolean;
};

export type CurrentUserAccess = {
  id: string;
  email: string;
  displayName: string | null;
  role: RoleId;
  plan: PlanId;
  entitlements: ReadonlySet<EntitlementId>;
};
```

- [x] **Step 4: pure resolverを実装する**

`src/lib/access/resolve-entitlements.ts`:

```ts
import { ADMIN_FIXED_ENTITLEMENTS } from "@/lib/access/catalog";
import type { EntitlementId, EntitlementOverride, RoleId } from "@/lib/access/types";

export function resolveEntitlements(input: {
  role: RoleId;
  planDefaults: EntitlementId[];
  overrides: EntitlementOverride[];
}): ReadonlySet<EntitlementId> {
  const resolved = new Set(input.planDefaults);

  for (const override of input.overrides) {
    if (override.enabled) resolved.add(override.entitlementId);
    else resolved.delete(override.entitlementId);
  }

  if (input.role === "admin") {
    for (const entitlement of ADMIN_FIXED_ENTITLEMENTS) resolved.add(entitlement);
  }

  return new Set([...resolved].sort());
}
```

- [x] **Step 5: authenticated sessionでuser identityを必須にする**

`createSessionToken()`の`user`引数を必須にし、`verifySessionToken()`は`userId`と`email`がstringでないtokenをunauthenticatedとして扱う。`tests/unit/auth.test.ts`のsession testは次のuserを渡す。

```ts
const user = { id: "user_test", email: "test@example.com" };
const session = await createSessionToken(
  "12345678901234567890123456789012",
  now,
  user,
);

expect(verified).toMatchObject({
  authenticated: true,
  userId: "user_test",
  email: "test@example.com",
});
```

- [x] **Step 6: current user server境界を実装する**

`src/lib/access/current-user.ts`は`requireSession()`で得た`userId`からactive user、plan default、overrideを読み、catalogに含まれないDB値を拒否する。

```ts
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { planEntitlements, userEntitlementOverrides, users } from "@/db/schema";
import { ENTITLEMENT_IDS, PLAN_IDS, ROLE_IDS } from "@/lib/access/catalog";
import { resolveEntitlements } from "@/lib/access/resolve-entitlements";
import type { CurrentUserAccess, EntitlementId, PlanId, RoleId } from "@/lib/access/types";
import { requireSession } from "@/lib/auth/session";

export async function requireCurrentUser(): Promise<CurrentUserAccess> {
  const session = await requireSession();
  const [user] = await db.select().from(users).where(and(eq(users.id, session.userId), eq(users.status, "active"))).limit(1);
  if (!user || !ROLE_IDS.includes(user.role as RoleId) || !PLAN_IDS.includes(user.plan as PlanId)) redirect("/login");

  const [defaults, overrides] = await Promise.all([
    db.select().from(planEntitlements).where(eq(planEntitlements.planId, user.plan)),
    db.select().from(userEntitlementOverrides).where(eq(userEntitlementOverrides.userId, user.id)),
  ]);
  const valid = new Set<string>(ENTITLEMENT_IDS);

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role as RoleId,
    plan: user.plan as PlanId,
    entitlements: resolveEntitlements({
      role: user.role as RoleId,
      planDefaults: defaults.filter((row) => row.enabled && valid.has(row.entitlementId)).map((row) => row.entitlementId as EntitlementId),
      overrides: overrides.filter((row) => valid.has(row.entitlementId)).map((row) => ({ entitlementId: row.entitlementId as EntitlementId, enabled: row.enabled })),
    }),
  };
}

export async function requireAdmin(): Promise<CurrentUserAccess> {
  const user = await requireCurrentUser();
  if (user.role !== "admin" || !user.entitlements.has("access.manage")) redirect("/settings?error=admin-required");
  return user;
}
```

- [x] **Step 7: accessとauth testを通す**

Run:

```bash
pnpm test -- tests/unit/access-control.test.ts tests/unit/auth.test.ts
pnpm typecheck
```

Expected: 全test PASS、type error 0。

- [ ] **Step 8: commitする**

```bash
git add src/lib/access src/lib/auth/session.ts tests/unit/access-control.test.ts tests/unit/auth.test.ts
git commit -m "feat: resolve user entitlements"
```

---

### Task 3: Admin Access Read Model

**Files:**
- Create: `src/lib/admin/access-control.ts`
- Create: `tests/unit/admin-access-control.test.ts`

**Interfaces:**
- Consumes: access catalog、`users`、`entitlements`、`planEntitlements`、`userEntitlementOverrides`、`auditLogs`。
- Produces: `AccessControlData`、`buildAccessControlData()`、`getAccessControlData()`。

- [x] **Step 1: read modelのfailing testを書く**

`tests/unit/admin-access-control.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAccessControlData } from "@/lib/admin/access-control";

describe("admin access read model", () => {
  it("combines plan defaults and user overrides for the selected user", () => {
    const data = buildAccessControlData({
      users: [
        { id: "u1", email: "admin@example.com", displayName: "Admin", role: "admin", plan: "pro", status: "active" },
        { id: "u2", email: "member@example.com", displayName: "Member", role: "normal", plan: "free", status: "active" },
      ],
      entitlements: [
        { id: "podcast.sample.view", description: "Sample" },
        { id: "podcast.generate", description: "Generate" },
      ],
      planDefaults: [{ planId: "free", entitlementId: "podcast.sample.view", enabled: true }],
      overrides: [{ userId: "u2", entitlementId: "podcast.generate", enabled: true }],
      auditLogs: [],
      selectedUserId: "u2",
    });

    expect(data.selectedUser?.email).toBe("member@example.com");
    expect(data.selectedUser?.capabilities).toEqual([
      { id: "podcast.generate", description: "Generate", source: "override_allow", enabled: true },
      { id: "podcast.sample.view", description: "Sample", source: "plan", enabled: true },
    ]);
  });
});
```

- [x] **Step 2: testがfailすることを確認する**

Run: `pnpm test -- tests/unit/admin-access-control.test.ts`

Expected: moduleが存在しないためFAIL。

- [x] **Step 3: read model typeとbuilderを実装する**

`src/lib/admin/access-control.ts`で次のpublic typeをexportする。

```ts
export type CapabilitySource = "admin" | "plan" | "override_allow" | "override_deny" | "none";

export type AccessControlData = {
  users: Array<{
    id: string;
    email: string;
    displayName: string | null;
    role: "admin" | "normal";
    plan: "free" | "pro";
    status: "active" | "invited" | "disabled";
  }>;
  plans: Array<{
    id: "free" | "pro";
    capabilities: Array<{ id: string; description: string; enabled: boolean }>;
  }>;
  selectedUser?: {
    id: string;
    email: string;
    displayName: string | null;
    role: "admin" | "normal";
    plan: "free" | "pro";
    capabilities: Array<{ id: string; description: string; source: CapabilitySource; enabled: boolean }>;
  };
  recentAudit: Array<{ id: string; action: string; targetType: string; targetId: string; createdAt: Date }>;
};
```

`buildAccessControlData()`はcatalog順を安定化し、selected userの各capabilityについてadmin固定grant、user override、plan defaultの順でsourceを決める。`override_deny`もUI表示のためrowを残す。

- [x] **Step 4: DB query wrapperを実装する**

`getAccessControlData(selectedUserId?: string)`は`requireAdmin()`を最初に呼び、5つのtableを`Promise.all()`で読む。selected IDがない場合はactor自身を選択し、auditは新しい順に50件まで返す。

- [x] **Step 5: testとtypecheckを通す**

Run:

```bash
pnpm test -- tests/unit/admin-access-control.test.ts
pnpm typecheck
```

Expected: PASS、type error 0。

- [ ] **Step 6: commitする**

```bash
git add src/lib/admin/access-control.ts tests/unit/admin-access-control.test.ts
git commit -m "feat: add admin access read model"
```

---

### Task 4: Admin Access MutationsとAudit

**Files:**
- Create: `src/app/actions/admin-access.ts`
- Create: `src/lib/access/guards.ts`
- Modify: `tests/unit/access-control.test.ts`

**Interfaces:**
- Consumes: `requireAdmin()`、access catalog、access control table。
- Produces: `updateUserRoleAndPlanAction()`、`updatePlanEntitlementAction()`、`updateUserEntitlementAction()`、`canDemoteAdmin()`。

- [x] **Step 1: last-admin ruleのfailing testを書く**

`tests/unit/access-control.test.ts`へ追加する。

```ts
import { canDemoteAdmin } from "@/lib/access/guards";

it("prevents demoting the final active admin", () => {
  expect(canDemoteAdmin({ targetRole: "admin", nextRole: "normal", activeAdminCount: 1 })).toBe(false);
  expect(canDemoteAdmin({ targetRole: "admin", nextRole: "normal", activeAdminCount: 2 })).toBe(true);
  expect(canDemoteAdmin({ targetRole: "normal", nextRole: "normal", activeAdminCount: 1 })).toBe(true);
});
```

- [x] **Step 2: testがfailすることを確認する**

Run: `pnpm test -- tests/unit/access-control.test.ts`

Expected: `canDemoteAdmin`が存在しないためFAIL。

- [x] **Step 3: validationとlast-admin ruleを実装する**

`src/lib/access/guards.ts`へ、Server Actionから独立したpure helperを追加する。

```ts
export function canDemoteAdmin(input: {
  targetRole: "admin" | "normal";
  nextRole: "admin" | "normal";
  activeAdminCount: number;
}): boolean {
  return !(input.targetRole === "admin" && input.nextRole !== "admin" && input.activeAdminCount <= 1);
}
```

`src/app/actions/admin-access.ts`は`"use server"`を宣言し、`canDemoteAdmin`をimportする。Server Action moduleから同期関数はexportしない。

FormDataから読むrole、plan、entitlementは`ROLE_IDS`、`PLAN_IDS`、`ENTITLEMENT_IDS`のmembershipで検証し、不正値は`/admin/access?error=invalid-input`へredirectする。

- [x] **Step 4: user roleとplanのmutationを実装する**

`updateUserRoleAndPlanAction(formData)`はadmin actorを取得し、transaction内でtarget userとactive admin数を読み、last-admin ruleを確認して`users.role`と`users.plan`を更新する。同じtransactionでaudit rowを追加する。

```ts
await tx.insert(auditLogs).values({
  id: `audit_${randomUUID()}`,
  actorUserId: actor.id,
  action: "access.user.updated",
  targetType: "user",
  targetId: userId,
  metadata: { previousRole: target.role, nextRole: role, previousPlan: target.plan, nextPlan: plan },
});
```

file先頭で`import { randomUUID } from "node:crypto";`を追加する。

成功後は`revalidatePath("/admin/access")`し、`/admin/access?user=<id>&saved=user`へredirectする。

- [x] **Step 5: plan default mutationを実装する**

`updatePlanEntitlementAction(formData)`は`planId`、`entitlementId`、checkboxの`enabled`を検証し、`planEntitlements`をupsertする。`access.manage`をplan defaultへ含めてもadmin固定grantの意味は変わらない。audit actionは`access.plan-entitlement.updated`とする。

- [x] **Step 6: user override mutationを実装する**

`updateUserEntitlementAction(formData)`は`mode`を`inherit | allow | deny`から検証する。

- `inherit`: 対象のoverride rowをdelete。
- `allow`: `enabled=true`でupsert。
- `deny`: `enabled=false`でupsert。

admin userに対する`access.manage`の`deny`は保存せず、`/admin/access?error=admin-fixed-entitlement`へredirectする。audit actionは`access.user-entitlement.updated`とし、metadataには`mode`だけを保存する。

- [x] **Step 7: testとtypecheckを通す**

Run:

```bash
pnpm test -- tests/unit/access-control.test.ts
pnpm typecheck
```

Expected: PASS、type error 0。

- [ ] **Step 8: commitする**

```bash
git add src/app/actions/admin-access.ts src/lib/access/guards.ts tests/unit/access-control.test.ts
git commit -m "feat: add audited access mutations"
```

---

### Task 5: Desktop-first Admin Access UI

**Files:**
- Create: `src/app/(admin)/admin/layout.tsx`
- Create: `src/app/(admin)/admin/access/page.tsx`
- Create: `src/components/admin/admin-shell.tsx`
- Create: `src/components/admin/access-control-view.tsx`
- Modify: `src/app/globals.css`
- Create: `tests/e2e/admin-access.spec.ts`

**Interfaces:**
- Consumes: `requireAdmin()`、`getAccessControlData()`、Task 4のServer Actions。
- Produces: `/admin/access`の日本語3ペイン管理画面。

- [x] **Step 1: admin UIのfailing E2Eを書く**

`tests/e2e/admin-access.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("admin can open the desktop access control workspace", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("local@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.goto("/admin/access");

  await expect(page.getByRole("heading", { name: "アクセス管理" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "管理メニュー" })).toBeVisible();
  await expect(page.getByText("member@example.com")).toBeVisible();
  await expect(page.getByRole("heading", { name: "ユーザー権限" })).toBeVisible();
});
```

- [x] **Step 2: E2Eがfailすることを確認する**

Run: `pnpm test:e2e -- tests/e2e/admin-access.spec.ts`

Expected: `/admin/access`が404のためFAIL。

- [x] **Step 3: admin layoutとshellを実装する**

`src/app/(admin)/admin/layout.tsx`は`requireAdmin()`を呼び、`AdminShell`へactorとchildrenを渡す。

```tsx
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireAdmin();
  return <AdminShell actor={{ displayName: actor.displayName, email: actor.email }}>{children}</AdminShell>;
}
```

`AdminShell`は日本語で、header、左navigation、main contentを持つ。左navigationはAccessだけactiveにし、Plans、Users、Integrations、Auditは同じ`/admin/access`内のsection anchorへlinkする。Settingsへ戻るlinkとlogout formを含める。

- [x] **Step 4: Access pageを実装する**

pageはNext.js 16のasync `searchParams`から`user`、`error`、`saved`を読み、`getAccessControlData(userId)`を呼ぶ。

```tsx
export default async function AdminAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const data = await getAccessControlData(params.user);
  return <AccessControlView data={data} feedback={{ error: params.error, saved: params.saved }} />;
}
```

- [x] **Step 5: 3ペインviewを実装する**

`AccessControlView`は次の3領域を同じpage section内に並べる。

1. 左: `Access / Plans / Users / Integrations / Audit`。
2. 中央: user search inputとuser一覧。各rowは`?user=<id>`へlinkする。
3. 右: selected userのrole、plan、capability override form。

plan default matrixとrecent auditは、3ペイン下のfull-width sectionとして表示する。form controlはcheckbox、select、buttonを使い、既存のcard内へ別cardを入れない。

- [x] **Step 6: responsive CSSを追加する**

`src/app/globals.css`へ`.admin-shell`、`.admin-sidebar`、`.admin-workspace`、`.admin-user-list`、`.admin-detail`、`.admin-access-grid`を追加する。

- `min-width: 900px`: `grid-template-columns: 220px minmax(280px, 0.9fr) minmax(360px, 1.1fr)`。
- `max-width: 899px`: 1 column。selected userがある場合はdetailをlistより先に表示する。
- panel radiusは8px以下。
- body textとcontrolがoverflowしないよう`min-width: 0`を設定する。
- admin shellはmobile app幅へ制限しない。

- [x] **Step 7: E2Eとvisual checkを通す**

Run:

```bash
pnpm test:e2e -- tests/e2e/admin-access.spec.ts
```

Expected: PASS。

Playwrightで1440x1000と390x844のscreenshotを`.evidence/`へ保存し、重なり、横overflow、文字切れがないことを確認する。

- [ ] **Step 8: commitする**

```bash
git add 'src/app/(admin)' src/components/admin src/app/globals.css tests/e2e/admin-access.spec.ts
git commit -m "feat: add admin access workspace"
```

---

### Task 6: Settings導線とAdmin Route保護

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`
- Modify: `src/proxy.ts`
- Modify: `tests/e2e/admin-access.spec.ts`
- Modify: `tests/e2e/mvp-navigation.spec.ts`

**Interfaces:**
- Consumes: `requireCurrentUser()`、`/admin/access`。
- Produces: adminだけに見えるSettings導線と、normal userを拒否するroute protection。

- [ ] **Step 1: access boundaryのfailing E2Eを追加する**

`tests/e2e/admin-access.spec.ts`へ追加する。

```ts
test("normal user cannot open admin access control", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("member@example.com");
  await page.getByLabel("Password").fill("local-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.goto("/admin/access");

  await expect(page).toHaveURL(/\/settings\?error=admin-required/);
  await expect(page.getByRole("link", { name: "管理画面" })).toHaveCount(0);
});
```

- [ ] **Step 2: E2Eがfailすることを確認する**

Run: `pnpm test:e2e -- tests/e2e/admin-access.spec.ts`

Expected: `/admin`がproxy matcher外、またはSettings link条件が未実装のためFAIL。

- [ ] **Step 3: Settingsへ条件付きlinkを追加する**

`SettingsPage`で`requireCurrentUser()`を呼ぶ。`currentUser.role === "admin"`の場合だけ、日本語の管理画面linkをProviders sectionの前へ表示する。

```tsx
{currentUser.role === "admin" ? (
  <section className="management-card">
    <h2>Administration</h2>
    <div className="settings-link-list">
      <Link href="/admin/access">
        <ShieldCheck size={18} aria-hidden="true" />
        <span>
          <strong>管理画面</strong>
          <small>role、plan、entitlementを管理</small>
        </span>
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  </section>
) : null}
```

ToC Settingsの既存copyは英語のまま維持する。

- [ ] **Step 4: proxy matcherへadminを追加する**

`src/proxy.ts`のmatcherへ`"/admin/:path*"`を追加する。proxyはsession有無だけを検証し、role checkはserver layoutの`requireAdmin()`へ委譲する。

- [ ] **Step 5: E2Eを通す**

Run:

```bash
pnpm test:e2e -- tests/e2e/admin-access.spec.ts tests/e2e/mvp-navigation.spec.ts
```

Expected: adminはlinkとpageを表示、normalはSettingsへredirect、既存navigation testもPASS。

- [ ] **Step 6: commitする**

```bash
git add 'src/app/(app)/settings/page.tsx' src/proxy.ts tests/e2e/admin-access.spec.ts tests/e2e/mvp-navigation.spec.ts
git commit -m "feat: protect admin access settings"
```

---

### Task 7: Phase 1 Full Verificationと進捗更新

**Files:**
- Modify: `docs/superpowers/progress/skill-compass-mvp.md`
- Modify: `docs/specs/skill-compass-podcast-studio-design.md` only when implementation status is updated precisely

**Interfaces:**
- Consumes: Task 1-6の完成状態。
- Produces: verification evidenceとpublic-safe handoff。

- [ ] **Step 1: databaseをfresh stateへ適用する**

Run:

```bash
docker compose up -d db
pnpm db:migrate
pnpm db:seed
```

Expected: DB container healthy、migrationとseedがexit 0。

- [ ] **Step 2: full automated verificationを実行する**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
DATABASE_URL='mysql://skill_compass:skill_compass@127.0.0.1:3306/skill_compass' \
SESSION_SECRET='12345678901234567890123456789012' \
pnpm build
pnpm test:e2e -- tests/e2e/admin-access.spec.ts tests/e2e/mvp-navigation.spec.ts
```

Expected: unit test、typecheck、lint、build、対象E2Eがすべてexit 0。

- [ ] **Step 3: public boundaryを検証する**

Run:

```bash
git diff --check
git status --short
git diff --cached
```

Expected: whitespace error 0。staged fileがTask対象だけであり、staged diffに認証情報、個人環境、非公開運用情報の実値が含まれないことを全行確認する。

- [ ] **Step 4: UIをPCとmobileで確認する**

Playwrightで以下を確認する。

- 1440x1000: 3ペインが同時表示される。
- 390x844: 横overflowがなく、selected user detailを操作できる。
- admin role/plan変更後、画面へ即時反映される。
- normal userはadmin routeへ入れない。
- 最後のadminを降格すると日本語errorが表示される。

screenshotは`.evidence/admin-access-desktop.png`と`.evidence/admin-access-mobile.png`へ保存し、commitしない。

- [ ] **Step 5: progress documentを更新する**

`docs/superpowers/progress/skill-compass-mvp.md`へ次を日本語で追記する。

```md
- Podcast Studio Phase 1: role、plan、entitlement、user override、audit log、desktop-first Access Controlを追加。
```

Podcast Studio全体は未実装のため、design documentの全体statusは「提案段階」のままにする。Phase 1 sectionだけを実装済みと記録してよい。

- [ ] **Step 6: final commitを作る**

```bash
git add docs/superpowers/progress/skill-compass-mvp.md docs/specs/skill-compass-podcast-studio-design.md
git commit -m "docs: record podcast access foundation"
```

## Plan Self-Review

- Spec coverage: role、plan、entitlement、user override、admin固定grant、last-admin guard、audit、PC 3ペイン、mobile fallback、Settings導線をTaskへ割り当てた。
- Scope boundary: Podcast生成、job pipeline、OAuth、Calendar、X、TTS、audio storage、private RSS、billing automationはPhase 1へ含めていない。
- Type consistency: `RoleId`、`PlanId`、`EntitlementId`、`CurrentUserAccess`、`AccessControlData`の名前を全Taskで統一した。
- 未確定表現のscan: 実装内容を曖昧にする未確定記述は含めず、Phase 1外の機能をscope boundaryとして明示した。
