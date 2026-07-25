import { getValidXAccessToken } from "./token-provider";

type XPreflightDependencies = {
  getAccessToken: (userId: string) => Promise<string>;
};

const defaultDependencies: XPreflightDependencies = {
  getAccessToken: getValidXAccessToken,
};

export async function runXPreflight(
  userId: string,
  dependencies: XPreflightDependencies = defaultDependencies,
) {
  await dependencies.getAccessToken(userId);
  return { status: "ready" as const };
}
