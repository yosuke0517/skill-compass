import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

type Marker = { name: string; column?: string };
type Migration = { file: string; markers: Marker[] };
export const interviewMigrations: Migration[] = [
  { file: "drizzle-d1/0002_interview_relay.sql", markers: ["interview_relay_allowance", "interview_relay_sessions", "interview_relay_expiry", "interview_reserve", "interview_supersede"].map(name => ({ name })) },
  { file: "drizzle-d1/0003_interview_developer.sql", markers: [
    { name: "interview_relay_developers" }, { name: "interview_developer_charge" },
    { name: "interview_relay_sessions", column: "usage_mode" }, { name: "interview_relay_sessions", column: "charged_until" },
  ] },
  { file: "drizzle-d1/0004_interview_learning.sql", markers: [
    { name: "interview_relay_sessions", column: "save_learning" },
    ...["interview_learning_sessions", "interview_learning_turns", "interview_learning_generations", "interview_learning_owner", "interview_learning_expiry", "interview_learning_turn_session", "interview_learning_generation_session", "interview_learning_consent"].map(name => ({ name })),
  ] },
  { file: "drizzle-d1/0005_interview_end_reason.sql", markers: [
    { name: "interview_learning_end" },
    ...["interview_relay_sessions", "interview_learning_sessions"].flatMap(name => ["ended_at", "end_reason"].map(column => ({ name, column }))),
  ] },
];

// Existing production was migrated manually. Inspect schema rather than replaying
// ALTER TABLE statements or fabricating entries in D1's migration journal.
export function migrationState(migration: Migration, rows: Array<Record<string, unknown>>) {
  const present = migration.markers.filter(marker => rows.some(row => row.name === marker.name &&
    (!marker.column || (row.type === "table" && new RegExp(`\\b${marker.column}\\b`, "i").test(String(row.sql)))))).length;
  if (present === migration.markers.length) return "applied";
  if (present === 0) return "missing";
  throw new Error(`Refusing partial interview schema: ${migration.file}`);
}

function main() {
  const [config, environment] = process.argv.slice(2);
  if (!config || !["staging", "production"].includes(environment)) throw new Error("Expected config path and staging|production");
  const wrangler = path.resolve("node_modules/wrangler/bin/wrangler.js");
  const run = (args: string[]) => execFileSync(process.execPath, [wrangler, "d1", "execute", "DB", "--remote", "--config", config, "--env", environment, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  const snapshot = () => {
    const replies = JSON.parse(run(["--command", "SELECT type,name,sql FROM sqlite_master WHERE name LIKE 'interview_%'", "--json"]));
    if (!Array.isArray(replies) || replies.some(r => r.success === false || !Array.isArray(r.results))) throw new Error("Unable to verify interview schema");
    return replies.flatMap(r => r.results) as Array<Record<string, unknown>>;
  };
  for (const migration of interviewMigrations) {
    if (migrationState(migration, snapshot()) === "missing") {
      run(["--file", migration.file]);
      if (migrationState(migration, snapshot()) !== "applied") throw new Error(`Migration not verified: ${migration.file}`);
    }
    console.log(`Verified ${migration.file}`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
