import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

(await import("@/lib/podcast/worker")).runPodcastWorkerOnce()
  .then((result) => {
    if (result.status === "idle") {
      console.log("No queued podcast jobs or audio chunks.");
    } else if (result.status === "script_ready") {
      console.log(`Podcast script ready for job ${result.jobId}.`);
    } else if (result.status === "audio_chunk_ready") {
      console.log(`Podcast audio chunk ready for episode ${result.jobId}.`);
    } else {
      console.log(`Podcast audio ready for episode ${result.jobId}.`);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Podcast worker failed.");
    process.exit(1);
  });
