import type { AudioStorage } from "@/lib/podcast/audio-storage";

export type CloudflareR2AudioBucket = {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(
    key: string,
    value: ArrayBufferView,
    options: { httpMetadata: { contentType: string } },
  ): Promise<unknown>;
};

export function createCloudflareR2AudioStorage(
  bucket: CloudflareR2AudioBucket,
): AudioStorage {
  return {
    async save(input) {
      await bucket.put(input.key, input.audio, {
        httpMetadata: { contentType: input.mediaType },
      });
      return {
        key: input.key,
        sizeBytes: input.audio.byteLength,
        mediaType: input.mediaType,
      };
    },
    async read(key) {
      const object = await bucket.get(key);
      if (!object) throw new Error("R2 object not found.");
      return Buffer.from(await object.arrayBuffer());
    },
  };
}
