import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const { getEnv } = await import("@/lib/env");
const { runXPreflight } = await import("./preflight");

async function main() {
  const userId = getEnv().MCP_ALLOWED_USER_ID;
  if (!userId) throw new Error("x_preflight_user_not_configured");
  const result = await runXPreflight(userId);
  console.log(`X preflight: ${result.status}`);
  process.exit(0);
}

main().catch((error: unknown) => {
  const code =
    error instanceof Error && error.message === "x_reconnect_required"
      ? "x_reconnect_required"
      : "x_preflight_failed";
  console.error(`X preflight: ${code}`);
  process.exitCode = 1;
});
