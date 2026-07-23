import { describe, expect, it } from "vitest";
import {
  auditLogs,
  categories,
  concepts,
  conceptTags,
  entitlements,
  mcpAccessTokens,
  mcpAuthorizationCodes,
  mcpOauthClients,
  planEntitlements,
  sourceTrustTierEnum,
  tags,
  translationCache,
  userEntitlementOverrides,
  users,
} from "@/db/schema";

describe("schema", () => {
  it("supports many-to-many concepts and tags", () => {
    expect(conceptTags).toBeDefined();
    expect(categories).toBeDefined();
    expect(tags).toBeDefined();
    expect(concepts).toBeDefined();
    expect(translationCache).toBeDefined();
  });

  it("defines source trust tiers", () => {
    expect(sourceTrustTierEnum.enumValues).toEqual(["tier1", "tier2", "tier3", "tier4"]);
  });

  it("defines extensible access control tables", () => {
    expect(users.role).toBeDefined();
    expect(users.plan).toBeDefined();
    expect(entitlements).toBeDefined();
    expect(planEntitlements).toBeDefined();
    expect(userEntitlementOverrides).toBeDefined();
    expect(auditLogs).toBeDefined();
  });

  it("defines persisted MCP OAuth tables", () => {
    expect(mcpOauthClients).toBeDefined();
    expect(mcpAuthorizationCodes).toBeDefined();
    expect(mcpAccessTokens).toBeDefined();
  });
});
