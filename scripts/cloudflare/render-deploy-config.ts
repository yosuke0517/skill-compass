import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type TerraformOutput = {
  sensitive: boolean;
  type: unknown;
  value: unknown;
};

type TerraformOutputs = Record<string, TerraformOutput>;

type WranglerEnvironment = {
  name?: string;
  assets?: {
    directory?: string;
    [key: string]: unknown;
  };
  d1_databases?: Array<Record<string, unknown>>;
  r2_buckets?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

type WranglerConfig = {
  $schema?: string;
  main?: string;
  assets?: WranglerEnvironment["assets"];
  env: Record<string, WranglerEnvironment>;
  [key: string]: unknown;
};

function argumentValue(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function parseJsonc(source: string): WranglerConfig {
  const withoutFullLineComments = source.replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(withoutFullLineComments) as WranglerConfig;
}

function relocatePath(
  configuredPath: string,
  sourceConfigPath: string,
  outputPath: string,
): string {
  const sourceDirectory = path.dirname(path.resolve(sourceConfigPath));
  const outputDirectory = path.dirname(path.resolve(outputPath));
  const target = path.resolve(sourceDirectory, configuredPath);
  return path.relative(outputDirectory, target).split(path.sep).join("/");
}

function relocateConfigPaths(
  config: WranglerConfig,
  sourceConfigPath: string,
  outputPath: string,
): void {
  if (config.$schema) {
    config.$schema = relocatePath(config.$schema, sourceConfigPath, outputPath);
  }
  if (config.main) {
    config.main = relocatePath(config.main, sourceConfigPath, outputPath);
  }
  if (config.assets?.directory) {
    config.assets.directory = relocatePath(config.assets.directory, sourceConfigPath, outputPath);
  }

  for (const environment of Object.values(config.env)) {
    if (environment.assets?.directory) {
      environment.assets.directory = relocatePath(
        environment.assets.directory,
        sourceConfigPath,
        outputPath,
      );
    }
  }
}

function terraformString(outputs: TerraformOutputs, name: string): string {
  const output = outputs[name];
  if (!output) {
    throw new Error(`missing required Terraform output "${name}"`);
  }
  if (output.sensitive !== false) {
    throw new Error(`Terraform output "${name}" must not be sensitive`);
  }
  if (typeof output.value !== "string" || output.value.trim().length === 0) {
    throw new Error(`Terraform output "${name}" must be a non-empty string`);
  }

  return output.value;
}

function environmentResourceName(
  outputs: TerraformOutputs,
  name: string,
  environment: "staging" | "production",
): string {
  const value = terraformString(outputs, name);
  const namesStaging = /(^|[-_])staging($|[-_])/.test(value);
  const namesProduction = /(^|[-_])production($|[-_])/.test(value);
  const valid = environment === "staging"
    ? namesStaging && !namesProduction
    : name === "r2_bucket_name"
      ? value === "skill-compass-podcast-dev"
      : namesProduction && !namesStaging;
  if (!valid) {
    throw new Error(`Terraform output "${name}" must name a ${environment} resource`);
  }

  return value;
}

function d1DatabaseId(outputs: TerraformOutputs): string {
  const value = terraformString(outputs, "d1_database_id");
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Terraform output "d1_database_id" must be a UUID');
  }
  if (/^00000000-0000-0000-0000-00000000000[0-9a-f]$/i.test(value)) {
    throw new Error(
      'Terraform output "d1_database_id" must not be a placeholder UUID',
    );
  }

  return value;
}

function main(): void {
  const wranglerConfigPath = argumentValue("--wrangler-config", "wrangler.jsonc");
  const outputPath = argumentValue("--output", ".cloudflare/deploy-values.json");
  const environmentArgument = argumentValue("--environment", "staging");
  if (environmentArgument !== "staging" && environmentArgument !== "production") {
    throw new Error("environment must be staging or production");
  }
  const environment = environmentArgument;
  const outputs = JSON.parse(readFileSync(0, "utf8")) as TerraformOutputs;
  const config = parseJsonc(readFileSync(wranglerConfigPath, "utf8"));
  relocateConfigPaths(config, wranglerConfigPath, outputPath);
  const selected = config.env[environment];
  if (!selected) throw new Error(`Wrangler environment "${environment}" is missing`);
  config.env = { [environment]: selected };

  selected.name = environmentResourceName(outputs, "worker_name", environment);
  selected.d1_databases = [
    {
      binding: "DB",
      database_name: environmentResourceName(outputs, "d1_database_name", environment),
      database_id: d1DatabaseId(outputs),
      migrations_dir: relocatePath("drizzle-d1", wranglerConfigPath, outputPath),
    },
  ];
  selected.r2_buckets = [
    {
      binding: "PODCAST_AUDIO",
      bucket_name: environmentResourceName(outputs, "r2_bucket_name", environment),
    },
  ];

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

main();
