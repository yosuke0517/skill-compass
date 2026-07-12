import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AudioStorage } from "@/lib/podcast/audio-storage";

export function createLocalAudioStorage(rootDirectory: string): AudioStorage {
  return {
    async save(input) {
      const safeKey = input.key.replace(/^\/+/, "").replaceAll("..", "_");
      const target = path.join(rootDirectory, safeKey);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, input.audio);
      return { key: safeKey, sizeBytes: input.audio.byteLength, mediaType: input.mediaType };
    },
    async read(key) {
      const safeKey = key.replace(/^\/+/, "").replaceAll("..", "_");
      return readFile(path.join(rootDirectory, safeKey));
    },
  };
}
