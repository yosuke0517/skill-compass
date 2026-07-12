import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import type { AudioStorage } from "@/lib/podcast/audio-storage";

export function createR2AudioStorage(options: {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
}): AudioStorage {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
  });

  return {
    async save(input) {
      await client.send(new PutObjectCommand({ Bucket: options.bucketName, Key: input.key, Body: input.audio, ContentType: input.mediaType }));
      return { key: input.key, sizeBytes: input.audio.byteLength, mediaType: input.mediaType };
    },
    async read(key) {
      const result = await client.send(new GetObjectCommand({ Bucket: options.bucketName, Key: key }));
      if (!result.Body) throw new Error("R2 returned an empty object.");
      return Buffer.from(await result.Body.transformToByteArray());
    },
  };
}
