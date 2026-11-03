// @vitest-environment node
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { getCurrentUserFromDb } from "@/lib/access/current-user-data";
import { hasAdminAccess } from "@/lib/access/guards";
import { interviewD1 } from "../helpers/interview-d1";

describe("explicit D1 current-user authorization", () => {
  it("uses the current active account and canonical entitlements without a Next request context", async () => {
    const { db, sql } = interviewD1(), client = drizzle(db, { schema });
    expect(hasAdminAccess((await getCurrentUserFromDb(client, "owner"))!)).toBe(true);
    sql.exec("UPDATE users SET role='normal',plan='pro' WHERE id='owner'");
    expect(hasAdminAccess((await getCurrentUserFromDb(client, "owner"))!)).toBe(false);
    sql.exec("INSERT INTO user_entitlement_overrides(user_id,entitlement_id,enabled) VALUES('owner','access.manage',1)");
    expect(hasAdminAccess((await getCurrentUserFromDb(client, "owner"))!)).toBe(false);
    sql.exec("UPDATE users SET role='admin',status='disabled' WHERE id='owner'");
    expect(await getCurrentUserFromDb(client, "owner")).toBeNull();
    expect(await getCurrentUserFromDb(client, "missing")).toBeNull();
    sql.close();
  });
});
