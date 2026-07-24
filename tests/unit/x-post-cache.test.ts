import { describe, expect, it, vi } from "vitest";

import {
  getXPostWithReferences,
  type XPostCacheDependencies,
} from "@/lib/x/post-cache";
import type { PublicXPost } from "@/lib/x/types";

const now = new Date("2026-07-24T00:00:00.000Z");
const post = (id: string, references: Partial<PublicXPost> = {}): PublicXPost => ({
  id,
  url: `https://x.com/alice/status/${id}`,
  text: `Post ${id}`,
  author: { id: "1", username: "alice", name: "Alice" },
  createdAt: "2026-07-23T23:00:00.000Z",
  canonicalLinks: [],
  metrics: { likes: 1, reposts: 0, replies: 0, quotes: 0 },
  media: [],
  ...references,
});

function dependencies(
  overrides: Partial<XPostCacheDependencies> = {},
): XPostCacheDependencies {
  return {
    now: () => now,
    ttlSeconds: 86_400,
    getCachedPost: vi.fn().mockResolvedValue(null),
    saveCachedPost: vi.fn().mockResolvedValue(undefined),
    createClient: vi.fn().mockResolvedValue({
      getPost: vi.fn().mockResolvedValue(post("123")),
      getPosts: vi.fn().mockResolvedValue([]),
    }),
    ...overrides,
  };
}

describe("getXPostWithReferences", () => {
  it("returns an unexpired public cache entry without calling X", async () => {
    const deps = dependencies({
      getCachedPost: vi.fn().mockResolvedValue({
        snapshot: post("123"),
        expiresAt: new Date("2026-07-25T00:00:00.000Z"),
      }),
    });

    await expect(
      getXPostWithReferences(
        "user-1",
        "https://x.com/alice/status/123",
        deps,
      ),
    ).resolves.toMatchObject({ post: { id: "123" } });
    expect(deps.createClient).not.toHaveBeenCalled();
  });

  it("ignores expired rows and caches the main post and public references", async () => {
    const main = post("123", { quotedPostId: "100", parentPostId: "120" });
    const quoted = post("100");
    const parent = post("120");
    const saveCachedPost = vi.fn().mockResolvedValue(undefined);
    const deps = dependencies({
      getCachedPost: vi.fn().mockResolvedValue({
        snapshot: post("stale"),
        expiresAt: new Date("2026-07-23T23:59:59.000Z"),
      }),
      saveCachedPost,
      createClient: vi.fn().mockResolvedValue({
        getPost: vi.fn().mockResolvedValue(main),
        getPosts: vi.fn().mockResolvedValue([quoted, parent]),
      }),
    });

    await expect(
      getXPostWithReferences(
        "user-1",
        "https://x.com/alice/status/123",
        deps,
      ),
    ).resolves.toEqual({
      post: main,
      quotedPost: quoted,
      parentPost: parent,
      unavailableReferences: [],
    });
    expect(saveCachedPost).toHaveBeenCalledTimes(3);
    for (const [snapshot] of saveCachedPost.mock.calls) {
      expect(JSON.stringify(snapshot)).not.toContain("user-1");
      expect(JSON.stringify(snapshot)).not.toContain("token");
      expect(JSON.stringify(snapshot)).not.toContain("timeline");
    }
  });

  it("keeps the main post when a reference is unavailable", async () => {
    const main = post("123", { quotedPostId: "100" });
    const deps = dependencies({
      createClient: vi.fn().mockResolvedValue({
        getPost: vi.fn().mockResolvedValue(main),
        getPosts: vi.fn().mockRejectedValue(new Error("unavailable")),
      }),
    });

    await expect(
      getXPostWithReferences(
        "user-1",
        "https://x.com/alice/status/123",
        deps,
      ),
    ).resolves.toMatchObject({
      post: main,
      unavailableReferences: ["quoted_post"],
    });
  });
});
