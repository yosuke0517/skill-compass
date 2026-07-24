import { eq } from "drizzle-orm";

import { xPublicPostCache } from "@/db/schema";
import { createXApiClient } from "@/lib/x/client";
import { parseXPostUrl } from "@/lib/x/post-url";
import { getValidXAccessToken } from "@/lib/x/token-provider";
import type { PublicXPost } from "@/lib/x/types";

type CachedPublicPost = {
  snapshot: PublicXPost;
  expiresAt: Date;
};

type PostClient = Pick<
  ReturnType<typeof createXApiClient>,
  "getPost" | "getPosts"
>;

export type XPostCacheDependencies = {
  now: () => Date;
  ttlSeconds: number;
  getCachedPost: (postId: string) => Promise<CachedPublicPost | null>;
  saveCachedPost: (post: PublicXPost, expiresAt: Date) => Promise<void>;
  createClient: (userId: string) => Promise<PostClient>;
};

export async function getCachedPublicPost(
  postId: string,
): Promise<CachedPublicPost | null> {
  const { db } = await import("@/db/client");
  const [row] = await db
    .select()
    .from(xPublicPostCache)
    .where(eq(xPublicPostCache.postId, postId))
    .limit(1);
  if (!row) return null;
  return {
    snapshot: row.snapshot as PublicXPost,
    expiresAt: row.expiresAt,
  };
}

export async function saveCachedPublicPost(
  post: PublicXPost,
  expiresAt: Date,
) {
  const { db } = await import("@/db/client");
  await db
    .insert(xPublicPostCache)
    .values({
      postId: post.id,
      snapshot: post,
      fetchedAt: new Date(),
      expiresAt,
    })
    .onDuplicateKeyUpdate({
      set: { snapshot: post, fetchedAt: new Date(), expiresAt },
    });
}

const defaultDependencies: XPostCacheDependencies = {
  now: () => new Date(),
  ttlSeconds: 86_400,
  getCachedPost: getCachedPublicPost,
  saveCachedPost: saveCachedPublicPost,
  createClient: async (userId) =>
    createXApiClient(await getValidXAccessToken(userId)),
};

export async function getXPostWithReferences(
  userId: string,
  value: string,
  dependencies: XPostCacheDependencies = defaultDependencies,
) {
  const { postId } = parseXPostUrl(value);
  const now = dependencies.now();
  const expiresAt = new Date(
    now.getTime() + dependencies.ttlSeconds * 1000,
  );
  let client: PostClient | undefined;
  const getClient = async () =>
    (client ??= await dependencies.createClient(userId));

  async function validCached(id: string) {
    const cached = await dependencies.getCachedPost(id);
    return cached &&
      cached.snapshot.id === id &&
      cached.expiresAt.getTime() > now.getTime()
      ? cached.snapshot
      : null;
  }

  let post = await validCached(postId);
  if (!post) {
    post = await (await getClient()).getPost(postId);
    await dependencies.saveCachedPost(post, expiresAt);
  }

  const references = [
    post.quotedPostId
      ? ({ type: "quoted_post", id: post.quotedPostId } as const)
      : null,
    post.parentPostId
      ? ({ type: "parent_post", id: post.parentPostId } as const)
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const found = new Map<string, PublicXPost>();
  const missing: typeof references = [];
  for (const reference of references) {
    const cached = await validCached(reference.id);
    if (cached) found.set(reference.id, cached);
    else missing.push(reference);
  }

  let unavailableReferences: Array<"quoted_post" | "parent_post"> = [];
  if (missing.length > 0) {
    try {
      const fetched = await (
        await getClient()
      ).getPosts([...new Set(missing.map((item) => item.id))]);
      for (const item of fetched) {
        found.set(item.id, item);
        await dependencies.saveCachedPost(item, expiresAt);
      }
      unavailableReferences = missing
        .filter((item) => !found.has(item.id))
        .map((item) => item.type);
    } catch {
      unavailableReferences = missing.map((item) => item.type);
    }
  }

  return {
    post,
    quotedPost: post.quotedPostId
      ? found.get(post.quotedPostId)
      : undefined,
    parentPost: post.parentPostId
      ? found.get(post.parentPostId)
      : undefined,
    unavailableReferences,
  };
}
