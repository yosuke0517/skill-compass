import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

import { getEnv } from "@/lib/env";
import * as schema from "./mysql-schema";

export function getMySqlExportDb() {
  const databaseUrl = getEnv().DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for MySQL export.");
  const pool = mysql.createPool(databaseUrl);
  return {
    db: drizzle(pool, { schema, mode: "default" }),
    close: () => pool.end(),
  };
}
