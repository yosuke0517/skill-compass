import type { AppEnv } from "@/lib/env";
import { getEnv } from "@/lib/env";
import { createKeychainSecretResolver } from "@/lib/secrets/keychain";

type LoginPasswordEnv = Pick<
  AppEnv,
  | "SKILL_COMPASS_PASSWORD"
  | "SKILL_COMPASS_PASSWORD_SOURCE"
  | "SKILL_COMPASS_PASSWORD_KEYCHAIN_SERVICE"
  | "SKILL_COMPASS_PASSWORD_KEYCHAIN_ACCOUNT"
>;

type LoginPasswordResolver = (options: {
  service: string;
  account?: string;
}) => Promise<string | undefined>;

export function verifyFixedPassword(expected: string, actual: string): boolean {
  return expected.length > 0 && actual === expected;
}

export async function getLoginPassword(
  env: LoginPasswordEnv = getEnv(),
  resolveKeychainPassword: LoginPasswordResolver = (options) =>
    createKeychainSecretResolver(options)(),
): Promise<string | undefined> {
  if (env.SKILL_COMPASS_PASSWORD_SOURCE === "keychain") {
    if (!env.SKILL_COMPASS_PASSWORD_KEYCHAIN_SERVICE) {
      return undefined;
    }

    return resolveKeychainPassword({
      service: env.SKILL_COMPASS_PASSWORD_KEYCHAIN_SERVICE,
      account: env.SKILL_COMPASS_PASSWORD_KEYCHAIN_ACCOUNT,
    });
  }

  return env.SKILL_COMPASS_PASSWORD;
}

export async function verifyConfiguredPassword(
  actual: string,
  env: LoginPasswordEnv = getEnv(),
  resolveKeychainPassword?: LoginPasswordResolver,
): Promise<boolean> {
  const expected = await getLoginPassword(env, resolveKeychainPassword);
  return verifyFixedPassword(expected ?? "", actual);
}
