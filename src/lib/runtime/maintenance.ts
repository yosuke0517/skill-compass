import { getRuntimeBindings } from "@/lib/runtime/bindings";

export type MaintenanceMode = "off" | "read_only";

export class MaintenanceReadOnlyError extends Error {
  readonly code = "maintenance_read_only";
  readonly status = 503;

  constructor(readonly operation: string) {
    super("Skill Compass is temporarily read-only.");
    this.name = "MaintenanceReadOnlyError";
  }
}

export function resolveMaintenanceMode(value: string | undefined): MaintenanceMode {
  return value === "read_only" ? "read_only" : "off";
}

export function getMaintenanceMode(): MaintenanceMode {
  const runtimeValue = getRuntimeBindings().MAINTENANCE_MODE;
  return resolveMaintenanceMode(
    typeof runtimeValue === "string" ? runtimeValue : process.env.MAINTENANCE_MODE,
  );
}

export function assertWritesAllowed(
  operation: string,
  mode: MaintenanceMode = getMaintenanceMode(),
): void {
  if (mode === "read_only") throw new MaintenanceReadOnlyError(operation);
}
