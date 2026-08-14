export type CloudMigrationArchitecture = {
  id: "current" | "target";
  title: string;
  description: string;
  flowLabel: string;
  nodes: readonly string[];
};

export type CloudMigrationResponsibility = {
  owner: string;
  summary: string;
  responsibilities: readonly string[];
};

export type CloudMigrationPhase = {
  id: "phase-0" | "phase-1" | "phase-2";
  label: string;
  title: string;
  status: "In progress" | "Planned";
  scope: string;
  completion: string;
};

export type CloudMigrationDocument = {
  status: {
    phase: string;
    label: string;
    production: string;
    detail: string;
  };
  architectures: readonly CloudMigrationArchitecture[];
  responsibilities: readonly CloudMigrationResponsibility[];
  deployment: {
    summary: string;
    pullRequest: readonly string[];
    staging: readonly string[];
  };
  phases: readonly CloudMigrationPhase[];
  stagingChecks: readonly string[];
  productionApproval: {
    summary: string;
    steps: readonly string[];
  };
  rollback: {
    beforeWrites: string;
    afterWrites: string;
  };
  security: readonly string[];
  cost: readonly string[];
};

export function getCloudMigrationDocument(): CloudMigrationDocument {
  return {
    status: {
      phase: "Phase 0",
      label: "Foundation in progress",
      production: "Production traffic remains on the Mac mini.",
      detail:
        "This page documents the approved migration path. It does not mean the production application has moved to Cloudflare.",
    },
    architectures: [
      {
        id: "current",
        title: "Current architecture",
        description:
          "The Mac-hosted application remains the live system while the Cloudflare foundation is built and verified.",
        flowLabel: "Current architecture flow",
        nodes: [
          "Web and ChatGPT clients",
          "agent.finegate.xyz",
          "Cloudflare Tunnel",
          "Mac mini: Next.js, Web, MCP and OAuth",
          "MySQL, local workers and macOS Keychain",
          "Cloudflare R2 and external providers",
        ],
      },
      {
        id: "target",
        title: "Target architecture",
        description:
          "Cloudflare becomes the production request and job path; the Mac returns to development and temporary read-only fallback duty.",
        flowLabel: "Target architecture flow",
        nodes: [
          "Web and ChatGPT clients",
          "Cloudflare DNS and Worker routing",
          "OpenNext Worker: Web, MCP and OAuth",
          "Cloudflare D1 relational state",
          "Cloudflare Queues, dead-letter queue and Cron Triggers",
          "Existing production R2 Podcast assets",
          "Workers Secrets and external providers",
        ],
      },
    ],
    responsibilities: [
      {
        owner: "Terraform",
        summary: "Infrastructure lifecycle and non-secret configuration.",
        responsibilities: [
          "D1, R2, Queues, Cron Triggers, DNS and Worker routing",
          "Environment names, lifecycle protection, observability and supported security settings",
          "Import existing production resources instead of recreating them",
        ],
      },
      {
        owner: "Wrangler",
        summary: "Application deployment and Cloudflare operational commands.",
        responsibilities: [
          "OpenNext Worker deploys and local Workers-compatible preview",
          "Bindings to Terraform-created resources and D1 migration execution",
          "Workers Secret registration, rotation, logs and diagnostics",
        ],
      },
      {
        owner: "HCP Terraform",
        summary: "Remote state only; it does not run plan or apply.",
        responsibilities: [
          "Encrypted, versioned state history",
          "State locking for skill-compass-staging and skill-compass-production",
        ],
      },
      {
        owner: "GitHub Actions",
        summary: "Reproducible checks, infrastructure execution and deployment.",
        responsibilities: [
          "Runs terraform init, plan and apply",
          "Deploys the exact verified commit to staging and, after approval, production",
          "Keeps staging and production credentials in separate GitHub Environments",
        ],
      },
      {
        owner: "Workers Secrets",
        summary: "Runtime application secret values.",
        responsibilities: [
          "Session signing, token encryption and provider credentials",
          "Values stay out of Terraform configuration, state, logs and committed files",
        ],
      },
    ],
    deployment: {
      summary:
        "main is the only long-lived branch. Pull requests verify change safety; merging deploys the exact commit to staging, never directly to production.",
      pullRequest: [
        "Node, OpenNext, migration and infrastructure checks",
        "Speculative staging and production Terraform plans",
        "No apply, migration, secret update or deployment",
      ],
      staging: [
        "Apply staging Terraform and D1 migrations",
        "Build and deploy with Wrangler",
        "Run smoke and integration checks, then publish the SHA and URL",
      ],
    },
    phases: [
      {
        id: "phase-0",
        label: "Phase 0",
        title: "Cloudflare foundation",
        status: "In progress",
        scope:
          "Authenticated guide, OpenNext baseline, staging infrastructure, CI, remote state and deployment workflows.",
        completion: "Staging is reproducible and verified without changing production routing.",
      },
      {
        id: "phase-1",
        label: "Phase 1",
        title: "Web, learning and integrations",
        status: "Planned",
        scope:
          "Web, Today, MCP, OAuth, X news, and listing, chat and playback for the five ready R2-backed Podcast episodes.",
        completion:
          "These services remain available with the Mac unavailable; Cloudflare does not generate new Podcast audio yet.",
      },
      {
        id: "phase-2",
        label: "Phase 2",
        title: "Podcast generation",
        status: "Planned",
        scope: "Idempotent Cron and Queue-based script, audio chunk and finalization work.",
        completion: "Daily and manual Podcast generation work with the Mac turned off.",
      },
    ],
    stagingChecks: [
      "Log in on mobile and open this migration guide through its return path.",
      "Display Today, submit an answer, score it and verify history.",
      "Connect ChatGPT temporarily to the staging MCP.",
      "Exercise get_today, submit_today_answer, get_x_post and get_daily_tech_posts.",
      "Verify OAuth callbacks and token refresh.",
      "Play and download existing Podcast assets.",
      "Confirm staging exposes no production secrets or data.",
    ],
    productionApproval: {
      summary:
        "Merging to main never updates production. A manual dispatch selects a commit SHA that has passed staging, then the protected production GitHub Environment requires approval.",
      steps: [
        "Verify the selected SHA has a successful staging deployment.",
        "Display and review a fresh production Terraform plan.",
        "Apply production Terraform.",
        "Verify a D1 recovery point or export.",
        "Apply backward-compatible D1 migrations.",
        "Build and deploy the selected SHA with Wrangler.",
        "Run public, non-mutating smoke tests.",
        "Record a GitHub Deployment referencing the exact SHA.",
      ],
    },
    rollback: {
      beforeWrites:
        "Before Cloudflare accepts new writes, restore routing to the unchanged, read-only Mac application and MySQL.",
      afterWrites:
        "After Cloudflare accepts writes, require an explicit data reconciliation decision; never silently route traffic back to stale MySQL data.",
    },
    security: [
      "Give each Cloudflare API Token only the permissions its workflow needs.",
      "Keep staging and production credentials, data and GitHub Environments separate.",
      "Keep secret values out of Terraform, state, logs, artifacts and committed files.",
      "Protect production D1 and R2 resources from deletion in Terraform.",
      "Keep OAuth tokens encrypted at rest and preserve MCP user scoping and owner checks.",
      "Redact credentials, tokens, answer reasoning and personal data from migration logs.",
      "Pin dependency and OpenNext versions and review security updates before promotion.",
    ],
    cost: [
      "Use Cloudflare free allowances where practical and observe usage before increasing capacity.",
      "Reuse the existing production R2 bucket instead of duplicating Podcast assets.",
      "Keep the first Terraform structure small and explicit; add modules only for complete duplicated resources.",
      "Track metered Workers, D1, R2, Queue and external-provider usage as staging load grows.",
    ],
  };
}
