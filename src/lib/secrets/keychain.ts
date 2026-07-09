import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(nodeExecFile) as ExecFile;

export type ExecFile = (
  command: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>;

export type KeychainSecretOptions = {
  service: string;
  account?: string;
  execFile?: ExecFile;
};

export type KeychainSecretResolver = () => Promise<string | undefined>;

export function createKeychainSecretResolver(options: KeychainSecretOptions): KeychainSecretResolver {
  const execFile = options.execFile ?? execFileAsync;

  return async () => {
    const args = ["find-generic-password", "-s", options.service];
    if (options.account) {
      args.push("-a", options.account);
    }
    args.push("-w");

    try {
      const result = await execFile("security", args);
      return result.stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  };
}
