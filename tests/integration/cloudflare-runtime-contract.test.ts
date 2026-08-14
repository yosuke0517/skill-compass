import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLocalAudioStorage } from "@/lib/podcast/providers/local-audio-storage";
import { createClaudeCliTranslationProvider } from "@/lib/translation/providers/claude-cli-provider";
import { createKeychainApiKeyResolver } from "@/lib/translation/providers/gemini-provider";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = path.join(projectRoot, "src");
const appRoot = path.join(sourceRoot, "app");
const sourceExtensions = [".ts", ".tsx"];

const forbiddenPackages = new Set([
  "child_process",
  "fs",
  "fs/promises",
  "node:child_process",
  "node:fs",
  "node:fs/promises",
]);

const forbiddenSourceFiles = new Map([
  [path.join(sourceRoot, "lib/secrets/keychain.ts"), "macOS Keychain access"],
  [
    path.join(sourceRoot, "lib/podcast/providers/local-audio-storage.ts"),
    "filesystem-backed audio storage",
  ],
]);

describe("Cloudflare request runtime contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps request import graphs free of Mac-only process and filesystem providers", () => {
    const violations = findViolations(findRequestEntrypoints());

    expect(violations, violations.join("\n")).toEqual([]);
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

function findViolations(entrypoints: string[]): string[] {
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

      for (const moduleSpecifier of readRuntimeImports(current.file)) {
        if (forbiddenPackages.has(moduleSpecifier)) {
          violations.add(
            formatViolation(entrypoint, [...current.chain, moduleSpecifier], moduleSpecifier),
          );
          continue;
        }

        const importedFile = resolveSourceImport(current.file, moduleSpecifier);
        if (!importedFile) continue;

        const forbiddenReason = forbiddenSourceFiles.get(importedFile);
        if (forbiddenReason) {
          violations.add(
            formatViolation(entrypoint, [...current.chain, importedFile], forbiddenReason),
          );
          continue;
        }

        pending.push({ file: importedFile, chain: [...current.chain, importedFile] });
      }
    }
  }

  return [...violations].sort();
}

function readRuntimeImports(file: string): string[] {
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    false,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  return sourceFile.statements.flatMap((statement) => {
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

      return [statement.moduleSpecifier.text];
    }

    if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      return [statement.moduleSpecifier.text];
    }

    return [];
  });
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
