import { and, eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { db } from "@/db/client";
import { podcastAssets } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import {
  createCloudflareR2AudioStorage,
  type CloudflareR2AudioBucket,
} from "@/lib/podcast/providers/cloudflare-r2-audio-storage";

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const session = await getSession();
  if (!session.authenticated || !session.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { assetId } = await params;
  const [asset] = await db.select().from(podcastAssets).where(and(eq(podcastAssets.id, assetId), eq(podcastAssets.userId, session.userId))).limit(1);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const { env } = await getCloudflareContext({ async: true });
    const bucket = (env as { PODCAST_AUDIO?: CloudflareR2AudioBucket })
      .PODCAST_AUDIO;
    if (!bucket) throw new Error("PODCAST_AUDIO binding is unavailable.");
    const audio = await createCloudflareR2AudioStorage(bucket).read(
      asset.storageKey,
    );
    const download = new URL(request.url).searchParams.get("download") === "1";
    const contentDisposition = download ? `attachment; filename="skill-compass-${asset.episodeId}.wav"` : "inline";
    const range = request.headers.get("range");
    const parsed = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
    if (!parsed) {
      return new NextResponse(audio as BodyInit, { headers: { "content-type": asset.mediaType, "content-length": String(audio.byteLength), "content-disposition": contentDisposition, "accept-ranges": "bytes" } });
    }
    const start = parsed[1] ? Number(parsed[1]) : 0;
    const requestedEnd = parsed[2] ? Number(parsed[2]) : audio.byteLength - 1;
    const end = Math.min(requestedEnd, audio.byteLength - 1);
    if (start > end || start >= audio.byteLength) return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${audio.byteLength}` } });
    const chunk = audio.subarray(start, end + 1);
    return new NextResponse(chunk as BodyInit, { status: 206, headers: { "content-type": asset.mediaType, "content-length": String(chunk.byteLength), "content-range": `bytes ${start}-${end}/${audio.byteLength}`, "content-disposition": contentDisposition, "accept-ranges": "bytes" } });
  } catch {
    return NextResponse.json({ error: "Audio unavailable" }, { status: 503 });
  }
}
