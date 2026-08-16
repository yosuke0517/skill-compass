import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export type D1DatabaseClient = ReturnType<typeof createDb>;

export async function getDb(): Promise<D1DatabaseClient> {
  const { env } = await getCloudflareContext({ async: true });
  return createDb(env.DB);
}

function createDb(binding: Parameters<typeof drizzle>[0]) {
  return drizzle(binding, { schema });
}

// Transitional compatibility for Task 3. Resolve the binding on every property
// access so no request-specific D1 client is retained at module scope.
export const db = new Proxy({} as D1DatabaseClient, {
  get(_target, property) {
    const { env } = getCloudflareContext();
    const client = createDb(env.DB);
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
