import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const { drainPodcastWorker, runPodcastWorkerOnce } = await import("@/lib/podcast/worker");
const watch = process.argv.includes("--watch");
const intervalMs = Number(process.env.PODCAST_WORKER_INTERVAL_MS ?? 5000);

async function runOnce() {
  if (watch) {
    const result = await drainPodcastWorker();
    console.log(`Podcast worker cycle: ${result.status} (${result.steps} steps).`);
    return;
  }

  const result = await runPodcastWorkerOnce();
  if (result.status === "idle") console.log("No queued podcast jobs or audio chunks.");
  else if (result.status === "script_ready") console.log(`Podcast script ready for job ${result.jobId}.`);
  else if (result.status === "audio_chunk_ready") console.log(`Podcast audio chunk ready for episode ${result.jobId}.`);
  else console.log(`Podcast audio ready for episode ${result.jobId}.`);
}

async function main() {
  do {
    await runOnce();
    if (watch) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (watch);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Podcast worker failed.");
  process.exit(1);
});
