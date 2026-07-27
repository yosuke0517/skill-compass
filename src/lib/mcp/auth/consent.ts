type McpConsent = {
  summary: string;
  capabilities: string[];
};

export function getMcpConsent(
  resource: string,
  resources: {
    learningResourceUrl: string;
    architectureResourceUrl?: string;
  },
): McpConsent | null {
  if (
    resources.architectureResourceUrl &&
    resource === resources.architectureResourceUrl
  ) {
    return {
      summary:
        "This grants read-only access to reviewed Skill Compass technical architecture and interview guidance.",
      capabilities: [
        "Read reviewed architecture, data-flow, and deployment facts",
        "Explain security, privacy boundaries, tradeoffs, and planned improvements",
        "Prepare grounded technical interview answers",
      ],
    };
  }
  if (!resource || resource === resources.learningResourceUrl) {
    return {
      summary:
        "This grants access to your Skill Compass Today progress and Pro Podcast episodes.",
      capabilities: [
        "Read and submit Today answers",
        "Read Podcast episodes and ask grounded questions",
        "Read public X Posts and retrieve a bounded daily technical digest",
        "Use Personalized Trends signals to guide bounded recent public X searches",
      ],
    };
  }
  return null;
}
