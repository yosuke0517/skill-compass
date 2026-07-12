import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalAudioStorage } from "@/lib/podcast/providers/local-audio-storage";

describe("local audio storage", () => {
  it("writes audio under the configured root", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "skill-compass-audio-"));
    try {
      const storage = createLocalAudioStorage(root);
      const result = await storage.save({ key: "user/episode.wav", audio: Buffer.from("audio"), mediaType: "audio/wav" });
      await expect(readFile(path.join(root, "user/episode.wav"), "utf8")).resolves.toBe("audio");
      expect(result).toMatchObject({ key: "user/episode.wav", sizeBytes: 5, mediaType: "audio/wav" });
      await expect(storage.read("user/episode.wav")).resolves.toEqual(Buffer.from("audio"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
