import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { getEnv } from "@/lib/env";

const pool = mysql.createPool(getEnv().DATABASE_URL);

export const db = drizzle(pool, { mode: "default" });
