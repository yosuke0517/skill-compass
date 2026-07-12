import type { PodcastScript } from "@/lib/podcast/script-generator";

export type SpeechSynthesisResult =
  | { status: "ready"; provider: string; audio: Buffer; mimeType: string }
  | { status: "unavailable"; provider: string; reason: string };

export interface SpeechSynthesizer {
  synthesize(input: { script: PodcastScript; durationMinutes: number }): Promise<SpeechSynthesisResult>;
}
