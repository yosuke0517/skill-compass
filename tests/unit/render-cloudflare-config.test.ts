import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

type TerraformOutput = {
  sensitive: boolean;
  type: string;
  value: unknown;
};

const repositoryRoot = process.cwd();
const rendererPath = path.join(repositoryRoot, "scripts/cloudflare/render-deploy-config.ts");
const temporaryDirectories: string[] = [];

function terraformOutput(value: unknown): TerraformOutput {
  return {
    sensitive: false,
    type: "string",
    value,
  };
}

function validTerraformOutputs(): Record<string, TerraformOutput> {
  return {
    worker_name: terraformOutput("skill-compass-cloudflare-staging"),
    d1_database_name: terraformOutput("skill-compass-staging"),
    d1_database_id: terraformOutput("11111111-1111-4111-8111-111111111111"),
    r2_bucket_name: terraformOutput("skill-compass-audio-staging"),
    unrelated_secret: {
      sensitive: true,
      type: "string",
      value: "must-not-leak",
    },
  };
}

function runRenderer(outputs: Record<string, TerraformOutput>, environment = "staging") {
  const directory = mkdtempSync(path.join(tmpdir(), "skill-compass-render-cloudflare-"));
  temporaryDirectories.push(directory);
  const outputPath = path.join(directory, "deploy-values.json");

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      rendererPath,
      "--wrangler-config",
      path.join(repositoryRoot, "wrangler.jsonc"),
      "--output",
      outputPath,
      "--environment",
      environment,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      input: JSON.stringify(outputs),
    },
  );

  return { outputPath, result };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("Cloudflare deploy-config renderer", () => {
  test("renders non-secret staging Terraform outputs into the Wrangler staging bindings", () => {
    const { outputPath, result } = runRenderer(validTerraformOutputs());

    expect(result.status, result.stderr).toBe(0);
    const renderedSource = readFileSync(outputPath, "utf8");
    const rendered = JSON.parse(renderedSource);

    expect(rendered.env.staging.name).toBe("skill-compass-cloudflare-staging");
    expect(rendered.env.staging.d1_databases).toEqual([
      {
        binding: "DB",
        database_name: "skill-compass-staging",
        database_id: "11111111-1111-4111-8111-111111111111",
        migrations_dir: expect.any(String),
      },
    ]);
    expect(path.resolve(path.dirname(outputPath), rendered.env.staging.d1_databases[0].migrations_dir)).toBe(
      path.join(repositoryRoot, "drizzle-d1"),
    );
    expect(rendered.env.staging.r2_buckets).toEqual([
      {
        binding: "PODCAST_AUDIO",
        bucket_name: "skill-compass-audio-staging",
      },
    ]);
    expect(rendered.env.staging.vars).toMatchObject({
      PUBLIC_APP_URL: "https://skill-compass-cloudflare-staging.yosuke-takeuchi-dev.workers.dev",
      MCP_ISSUER_URL: "https://skill-compass-cloudflare-staging.yosuke-takeuchi-dev.workers.dev",
      MCP_RESOURCE_URL: "https://skill-compass-cloudflare-staging.yosuke-takeuchi-dev.workers.dev/mcp",
      MCP_ARCHITECTURE_RESOURCE_URL: "https://skill-compass-cloudflare-staging.yosuke-takeuchi-dev.workers.dev/mcp/architecture",
      PODCAST_AUDIO_STORAGE: "r2",
    });
    expect(path.resolve(path.dirname(outputPath), rendered.main)).toBe(
      path.join(repositoryRoot, ".open-next/worker.js"),
    );
    expect(path.resolve(path.dirname(outputPath), rendered.env.staging.assets.directory)).toBe(
      path.join(repositoryRoot, ".open-next/assets"),
    );
    expect(path.resolve(path.dirname(outputPath), rendered.$schema)).toBe(
      path.join(repositoryRoot, "node_modules/wrangler/config-schema.json"),
    );
    expect(renderedSource).not.toContain("must-not-leak");
    expect(renderedSource).not.toContain("unrelated_secret");
    expect(renderedSource).not.toContain("production");
  });

  test("renders production bindings without including staging configuration", () => {
    const outputs = {
      worker_name: terraformOutput("skill-compass-cloudflare-production"),
      d1_database_name: terraformOutput("skill-compass-production"),
      d1_database_id: terraformOutput("22222222-2222-4222-8222-222222222222"),
      r2_bucket_name: terraformOutput("skill-compass-podcast-dev"),
    };

    const { outputPath, result } = runRenderer(outputs, "production");

    expect(result.status, result.stderr).toBe(0);
    const renderedSource = readFileSync(outputPath, "utf8");
    const rendered = JSON.parse(renderedSource);
    expect(Object.keys(rendered.env)).toEqual(["production"]);
    expect(rendered.env.production.name).toBe("skill-compass-cloudflare-production");
    expect(rendered.env.production.d1_databases[0]).toMatchObject({
      binding: "DB",
      database_name: "skill-compass-production",
      database_id: "22222222-2222-4222-8222-222222222222",
    });
    expect(path.resolve(path.dirname(outputPath), rendered.env.production.d1_databases[0].migrations_dir)).toBe(
      path.join(repositoryRoot, "drizzle-d1"),
    );
    expect(rendered.env.production.r2_buckets).toEqual([{
      binding: "PODCAST_AUDIO",
      bucket_name: "skill-compass-podcast-dev",
    }]);
    expect(renderedSource).not.toContain("skill-compass-staging");
  });

  test("rejects input when any required staging Terraform output is absent", () => {
    for (const missingName of [
      "worker_name",
      "d1_database_name",
      "d1_database_id",
      "r2_bucket_name",
    ]) {
      const outputs = validTerraformOutputs();
      delete outputs[missingName];

      const { outputPath, result } = runRenderer(outputs);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`missing required Terraform output "${missingName}"`);
      expect(existsSync(outputPath)).toBe(false);
    }
  });

  test("rejects required Terraform outputs marked sensitive", () => {
    for (const sensitiveName of [
      "worker_name",
      "d1_database_name",
      "d1_database_id",
      "r2_bucket_name",
    ]) {
      for (const sensitive of [true, undefined]) {
        const outputs = validTerraformOutputs();
        outputs[sensitiveName] = {
          ...outputs[sensitiveName],
          sensitive,
        } as unknown as TerraformOutput;

        const { outputPath, result } = runRenderer(outputs);

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain(
          `Terraform output "${sensitiveName}" must not be sensitive`,
        );
        expect(existsSync(outputPath)).toBe(false);
      }
    }
  });

  test("rejects production resource names in a staging deployment", () => {
    const productionNames: Record<string, string[]> = {
      worker_name: [
        "skill-compass-cloudflare-production",
        "skill-compass-cloudflare-staging-production",
      ],
      d1_database_name: ["skill-compass-production", "skill-compass-staging-production"],
      r2_bucket_name: ["skill-compass-audio-production", "skill-compass-audio-staging-production"],
    };

    for (const [outputName, names] of Object.entries(productionNames)) {
      for (const productionName of names) {
        const outputs = validTerraformOutputs();
        outputs[outputName] = terraformOutput(productionName);

        const { outputPath, result } = runRenderer(outputs);

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain(
          `Terraform output "${outputName}" must name a staging resource`,
        );
        expect(existsSync(outputPath)).toBe(false);
      }
    }
  });

  test("rejects required Terraform outputs that are not non-empty strings", () => {
    const invalidValues = [
      ["worker_name", ""],
      ["d1_database_name", null],
      ["d1_database_id", 123],
      ["r2_bucket_name", "   "],
    ] as const;

    for (const [outputName, invalidValue] of invalidValues) {
      const outputs = validTerraformOutputs();
      outputs[outputName] = terraformOutput(invalidValue);

      const { outputPath, result } = runRenderer(outputs);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        `Terraform output "${outputName}" must be a non-empty string`,
      );
      expect(existsSync(outputPath)).toBe(false);
    }
  });

  test("rejects a malformed D1 database ID", () => {
    const outputs = validTerraformOutputs();
    outputs.d1_database_id = terraformOutput("not-a-d1-uuid");

    const { outputPath, result } = runRenderer(outputs);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Terraform output "d1_database_id" must be a UUID');
    expect(existsSync(outputPath)).toBe(false);
  });

  test("rejects placeholder D1 database UUIDs", () => {
    for (const placeholderId of [
      "00000000-0000-0000-0000-000000000000",
      "00000000-0000-0000-0000-000000000002",
    ]) {
      const outputs = validTerraformOutputs();
      outputs.d1_database_id = terraformOutput(placeholderId);

      const { outputPath, result } = runRenderer(outputs);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'Terraform output "d1_database_id" must not be a placeholder UUID',
      );
      expect(existsSync(outputPath)).toBe(false);
    }
  });
});
