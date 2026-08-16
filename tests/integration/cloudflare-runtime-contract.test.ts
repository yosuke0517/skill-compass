import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clientSecret } from "@/lib/integrations/oauth-client";
import { getAudioStorage } from "@/lib/podcast/audio-storage-provider";
import { createLocalAudioStorage } from "@/lib/podcast/providers/local-audio-storage";
import { createClaudeCliTranslationProvider } from "@/lib/translation/providers/claude-cli-provider";
import { createKeychainApiKeyResolver } from "@/lib/translation/providers/gemini-provider";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = path.join(projectRoot, "src");
const appRoot = path.join(sourceRoot, "app");
const sourceExtensions = [".ts", ".tsx"];

type RuntimeImport = {
  kind: "dynamic" | "require" | "static";
  moduleSpecifier: string;
};

vi.mock("@/lib/secrets/keychain", () => ({
  createKeychainSecretResolver: () => async () => "must-not-be-read",
}));

const forbiddenPackages = new Set([
  "@aws-sdk/client-s3",
  "child_process",
  "fs",
  "fs/promises",
  "drizzle-orm/mysql2",
  "mysql2",
  "mysql2/promise",
  "node:child_process",
  "node:fs",
  "node:fs/promises",
]);

const forbiddenSourceFiles = new Map([
  [path.join(sourceRoot, "db/mysql-export-client.ts"), "migration-only MySQL access"],
  [path.join(sourceRoot, "lib/secrets/keychain.ts"), "macOS Keychain access"],
  [
    path.join(sourceRoot, "lib/podcast/providers/local-audio-storage.ts"),
    "filesystem-backed audio storage",
  ],
]);

// Dynamic imports are allowed only at adapters that fail closed before loading
// the Mac-only module. Every entry must be reachable, and its guard is covered
// by a behavior test below so this list cannot become a generic escape hatch.
const guardedDynamicImportAllowlist = new Map([
  [
    "src/lib/integrations/oauth-client.ts::@/lib/secrets/keychain",
    "does not load OAuth client secrets from macOS Keychain in Workers",
  ],
  [
    "src/lib/translation/providers/claude-cli-provider.ts::node:child_process",
    "does not invoke a local CLI in the Workers runtime",
  ],
  [
    "src/lib/translation/providers/gemini-provider.ts::@/lib/secrets/keychain",
    "does not invoke macOS Keychain in the Workers runtime",
  ],
]);

describe("Cloudflare request runtime contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("keeps request import graphs free of Mac-only process and filesystem providers", () => {
    const { allowlistedImports, violations } = findViolations(findRequestEntrypoints());

    expect(violations, violations.join("\n")).toEqual([]);
    expect([...allowlistedImports].sort()).toEqual(
      [...guardedDynamicImportAllowlist.keys()].sort(),
    );
  });

  it("keeps the Phase 0 deploy interface scoped to staging", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(projectRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const wranglerConfig = parseJsonc<{ env?: Record<string, unknown> }>(
      path.join(projectRoot, "wrangler.jsonc"),
    );

    expect(packageJson.scripts?.["deploy:cloudflare"]).toBe(
      "opennextjs-cloudflare deploy --config .cloudflare/deploy-values.json --env staging",
    );
    expect(wranglerConfig.env).toHaveProperty("staging");
    expect(wranglerConfig.env).not.toHaveProperty("production");
    expect(JSON.stringify(wranglerConfig)).not.toContain("production");
  });

  it("does not invoke macOS Keychain in the Workers runtime", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    let invocations = 0;
    const resolveApiKey = createKeychainApiKeyResolver({
      service: "local-gemini-api-key",
      execFile: async () => {
        invocations += 1;
        return { stdout: "must-not-be-read", stderr: "" };
      },
    });

    await expect(resolveApiKey()).resolves.toBeUndefined();
    expect(invocations).toBe(0);
  });

  it("does not load OAuth client secrets from macOS Keychain in Workers", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });

    await expect(clientSecret("local-oauth-secret")()).resolves.toBeUndefined();
  });

  it("does not invoke a local CLI in the Workers runtime", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    let invocations = 0;
    const provider = createClaudeCliTranslationProvider({
      command: "claude",
      timeoutMs: 1_000,
      execFile: async () => {
        invocations += 1;
        return { stdout: "must-not-be-read", stderr: "" };
      },
    });

    await expect(
      provider.translate({
        sourceText: "API contract",
        sourceLocale: "en",
        targetLocale: "ja",
        purpose: "quiz_prompt",
      }),
    ).resolves.toMatchObject({ unavailable: true, provider: "claude_cli" });
    expect(invocations).toBe(0);
  });

  it("refuses filesystem-backed audio storage in the Workers runtime", () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });

    expect(() => createLocalAudioStorage("./var/audio")).toThrow(
      "Filesystem audio storage is unavailable in the Cloudflare Workers runtime.",
    );
  });

  it("does not load Podcast R2 credentials from macOS Keychain in Workers", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    vi.stubEnv("DATABASE_URL", "mysql://user:password@127.0.0.1:3306/skill_compass");
    vi.stubEnv("SESSION_SECRET", "12345678901234567890123456789012");
    vi.stubEnv("PODCAST_AUDIO_STORAGE", "r2");
    vi.stubEnv("PODCAST_R2_CREDENTIALS_SOURCE", "keychain");
    vi.stubEnv("PODCAST_R2_ACCOUNT_ID", "local-account");
    vi.stubEnv("PODCAST_R2_BUCKET_NAME", "local-bucket");

    await expect(getAudioStorage()).rejects.toThrow(
      "macOS Keychain is unavailable in the Cloudflare Workers runtime.",
    );
  });
});

function findRequestEntrypoints(): string[] {
  return [
    ...walkSourceFiles(appRoot).filter((file) =>
      /\/(?:layout|page|route)\.(?:ts|tsx)$/.test(file),
    ),
    ...walkSourceFiles(path.join(appRoot, "actions")),
    ...["middleware.ts", "proxy.ts"]
      .map((file) => path.join(sourceRoot, file))
      .filter(isFile),
  ];
}

function findViolations(entrypoints: string[]): {
  allowlistedImports: Set<string>;
  violations: string[];
} {
  const allowlistedImports = new Set<string>();
  const violations = new Set<string>();

  for (const entrypoint of entrypoints) {
    const pending: Array<{ file: string; chain: string[] }> = [
      { file: entrypoint, chain: [entrypoint] },
    ];
    const visited = new Set<string>();

    while (pending.length > 0) {
      const current = pending.shift();
      if (!current || visited.has(current.file)) continue;
      visited.add(current.file);

      for (const runtimeImport of readRuntimeImports(current.file)) {
        const { moduleSpecifier } = runtimeImport;
        if (forbiddenPackages.has(moduleSpecifier)) {
          const allowlistKey = guardedImportKey(current.file, moduleSpecifier);
          if (
            runtimeImport.kind === "dynamic" &&
            guardedDynamicImportAllowlist.has(allowlistKey)
          ) {
            allowlistedImports.add(allowlistKey);
            continue;
          }
          violations.add(
            formatViolation(
              entrypoint,
              [...current.chain, `${runtimeImport.kind}:${moduleSpecifier}`],
              moduleSpecifier,
            ),
          );
          continue;
        }

        const importedFile = resolveSourceImport(current.file, moduleSpecifier);
        if (!importedFile) continue;

        const forbiddenReason = forbiddenSourceFiles.get(importedFile);
        if (forbiddenReason) {
          const allowlistKey = guardedImportKey(current.file, moduleSpecifier);
          if (
            runtimeImport.kind === "dynamic" &&
            guardedDynamicImportAllowlist.has(allowlistKey)
          ) {
            allowlistedImports.add(allowlistKey);
            continue;
          }
          violations.add(
            formatViolation(
              entrypoint,
              [...current.chain, `${runtimeImport.kind}:${importedFile}`],
              forbiddenReason,
            ),
          );
          continue;
        }

        pending.push({ file: importedFile, chain: [...current.chain, importedFile] });
      }
    }
  }

  return { allowlistedImports, violations: [...violations].sort() };
}

function guardedImportKey(importer: string, moduleSpecifier: string): string {
  return `${path.relative(projectRoot, importer)}::${moduleSpecifier}`;
}

function readRuntimeImports(file: string): RuntimeImport[] {
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    false,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const runtimeImports = sourceFile.statements.flatMap<RuntimeImport>((statement) => {
    if (ts.isImportDeclaration(statement)) {
      if (statement.importClause?.isTypeOnly || !ts.isStringLiteral(statement.moduleSpecifier)) {
        return [];
      }

      const bindings = statement.importClause?.namedBindings;
      if (
        bindings &&
        ts.isNamedImports(bindings) &&
        !statement.importClause?.name &&
        bindings.elements.length > 0 &&
        bindings.elements.every((element) => element.isTypeOnly)
      ) {
        return [];
      }

      return [{ kind: "static", moduleSpecifier: statement.moduleSpecifier.text }];
    }

    if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      return [{ kind: "static", moduleSpecifier: statement.moduleSpecifier.text }];
    }

    return [];
  });

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteral(argument)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          runtimeImports.push({ kind: "dynamic", moduleSpecifier: argument.text });
        } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
          runtimeImports.push({ kind: "require", moduleSpecifier: argument.text });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return runtimeImports;
}

function parseJsonc<T>(file: string): T {
  const parsed = ts.parseConfigFileTextToJson(file, readFileSync(file, "utf8"));
  if (parsed.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"),
    );
  }
  return parsed.config as T;
}

function resolveSourceImport(importer: string, moduleSpecifier: string): string | undefined {
  const candidate = moduleSpecifier.startsWith("@/")
    ? path.join(sourceRoot, moduleSpecifier.slice(2))
    : moduleSpecifier.startsWith(".")
      ? path.resolve(path.dirname(importer), moduleSpecifier)
      : undefined;

  if (!candidate) return undefined;

  for (const sourceExtension of sourceExtensions) {
    const sourceFile = `${candidate}${sourceExtension}`;
    if (isFile(sourceFile)) return sourceFile;
  }

  for (const sourceExtension of sourceExtensions) {
    const indexFile = path.join(candidate, `index${sourceExtension}`);
    if (isFile(indexFile)) return indexFile;
  }

  return undefined;
}

function walkSourceFiles(directory: string): string[] {
  if (!isDirectory(directory)) return [];

  const entries = statSafe(directory) ? ts.sys.readDirectory(directory, sourceExtensions) : [];
  return entries.map((file) => path.resolve(file));
}

function formatViolation(entrypoint: string, chain: string[], reason: string): string {
  const relativeChain = chain.map((item) =>
    path.isAbsolute(item) ? path.relative(projectRoot, item) : item,
  );
  return `${path.relative(projectRoot, entrypoint)} reaches ${reason}: ${relativeChain.join(" -> ")}`;
}

function isFile(file: string): boolean {
  return statSafe(file)?.isFile() ?? false;
}

function isDirectory(directory: string): boolean {
  return statSafe(directory)?.isDirectory() ?? false;
}

function statSafe(target: string): ReturnType<typeof statSync> | undefined {
  try {
    return statSync(target);
  } catch {
    return undefined;
  }
}
