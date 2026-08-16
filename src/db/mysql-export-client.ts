import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

import { getEnv } from "@/lib/env";
import * as schema from "./mysql-schema";

export function getMySqlExportDb() {
  const pool = mysql.createPool(getEnv().DATABASE_URL);
  return {
    db: drizzle(pool, { schema, mode: "default" }),
    close: () => pool.end(),
  };
}
