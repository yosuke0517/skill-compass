import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalAudioStorage } from "@/lib/podcast/providers/local-audio-storage";
import {
  createCloudflareR2AudioStorage,
  type CloudflareR2AudioBucket,
} from "@/lib/podcast/providers/cloudflare-r2-audio-storage";

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

describe("Cloudflare R2 audio storage", () => {
  it("round-trips audio through the native binding with HTTP metadata", async () => {
    const objects = new Map<string, { audio: Buffer; mediaType?: string }>();
    const bucket = {
      async put(
        key: string,
        value: unknown,
        options?: { httpMetadata?: { contentType?: string } },
      ) {
        if (!ArrayBuffer.isView(value)) throw new Error("expected bytes");
        objects.set(key, {
          audio: Buffer.from(value.buffer, value.byteOffset, value.byteLength),
          mediaType: options?.httpMetadata?.contentType,
        });
      },
      async get(key: string) {
        const object = objects.get(key);
        if (!object) return null;
        return {
          arrayBuffer: async () =>
            object.audio.buffer.slice(
              object.audio.byteOffset,
              object.audio.byteOffset + object.audio.byteLength,
            ),
        };
      },
    } as CloudflareR2AudioBucket;
    const storage = createCloudflareR2AudioStorage(bucket);

    await expect(
      storage.save({
        key: "users/staging/episode.wav",
        audio: Buffer.from("staging-audio"),
        mediaType: "audio/wav",
      }),
    ).resolves.toEqual({
      key: "users/staging/episode.wav",
      sizeBytes: 13,
      mediaType: "audio/wav",
    });
    expect(objects.get("users/staging/episode.wav")?.mediaType).toBe("audio/wav");
    await expect(storage.read("users/staging/episode.wav")).resolves.toEqual(
      Buffer.from("staging-audio"),
    );
  });

  it("fails closed when the native binding has no object", async () => {
    const bucket = {
      get: async () => null,
      put: async () => undefined,
    } as CloudflareR2AudioBucket;

    await expect(
      createCloudflareR2AudioStorage(bucket).read("missing.wav"),
    ).rejects.toThrow("R2 object not found.");
  });
});
