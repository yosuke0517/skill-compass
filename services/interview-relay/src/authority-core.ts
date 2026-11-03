/** Runtime-neutral authority contract; no network identity SDK is loaded here. */
export type Grant = {
  id: string;
  owner: string;
  generation: number;
  nonce: string;
  expiresAt: number;
  leaseUntil: number;
  mode: "mock" | "google" | "openai";
  saveLearning?: boolean;
  resumeContext?: { id: string; source: "interviewer" | "self"; text: string }[];
};
export interface Authority {
  call(
    operation: "redeem" | "lease" | "hint" | "release" | "record" | "end",
    input: object,
    signal: AbortSignal,
  ): Promise<Grant>;
}
export class AuthorityError extends Error {
  constructor(public status: number) { super(`Authority HTTP ${status}`); }
}
export function retryableAuthority(error: unknown) {
  return error instanceof AuthorityError
    ? [502, 503, 504].includes(error.status)
    : error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError");
}
