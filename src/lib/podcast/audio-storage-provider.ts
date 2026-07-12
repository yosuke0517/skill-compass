import { getEnv } from "@/lib/env";
import { createKeychainSecretResolver } from "@/lib/secrets/keychain";
import type { AudioStorage } from "@/lib/podcast/audio-storage";
import { createLocalAudioStorage } from "@/lib/podcast/providers/local-audio-storage";
import { createR2AudioStorage } from "@/lib/podcast/providers/r2-audio-storage";

export async function getAudioStorage(): Promise<AudioStorage> {
  const env = getEnv();
  if (env.PODCAST_AUDIO_STORAGE === "r2") {
    const credentials = env.PODCAST_R2_CREDENTIALS_SOURCE === "keychain"
      ? await resolveKeychainCredentials(env)
      : { accessKeyId: env.PODCAST_R2_ACCESS_KEY_ID, secretAccessKey: env.PODCAST_R2_SECRET_ACCESS_KEY };
    if (!env.PODCAST_R2_ACCOUNT_ID || !env.PODCAST_R2_BUCKET_NAME || !credentials.accessKeyId || !credentials.secretAccessKey) {
      throw new Error("R2 audio storage is not configured.");
    }
    return createR2AudioStorage({ accountId: env.PODCAST_R2_ACCOUNT_ID, bucketName: env.PODCAST_R2_BUCKET_NAME, accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey });
  }
  return createLocalAudioStorage(env.PODCAST_AUDIO_STORAGE_DIR);
}

async function resolveKeychainCredentials(env: ReturnType<typeof getEnv>) {
  const resolveAccessKey = createKeychainSecretResolver({ service: env.PODCAST_R2_ACCESS_KEY_KEYCHAIN_SERVICE, account: env.PODCAST_R2_KEYCHAIN_ACCOUNT });
  const resolveSecretKey = createKeychainSecretResolver({ service: env.PODCAST_R2_SECRET_KEY_KEYCHAIN_SERVICE, account: env.PODCAST_R2_KEYCHAIN_ACCOUNT });
  const [accessKeyId, secretAccessKey] = await Promise.all([resolveAccessKey(), resolveSecretKey()]);
  return { accessKeyId, secretAccessKey };
}
