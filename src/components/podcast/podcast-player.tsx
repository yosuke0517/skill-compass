"use client";

import { useEffect, useRef } from "react";

export function PodcastPlayer({ src, title }: { src: string; title: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "Skill Compass", album: "Private audio briefing" });
    const audio = audioRef.current;
    const seek = (amount: number) => {
      if (!audio) return;
      audio.currentTime = Math.max(0, Math.min(audio.duration || Number.POSITIVE_INFINITY, audio.currentTime + amount));
    };
    navigator.mediaSession.setActionHandler("play", () => void audio?.play());
    navigator.mediaSession.setActionHandler("pause", () => audio?.pause());
    navigator.mediaSession.setActionHandler("seekbackward", () => seek(-15));
    navigator.mediaSession.setActionHandler("seekforward", () => seek(30));
    return () => {
      navigator.mediaSession.metadata = null;
      for (const action of ["play", "pause", "seekbackward", "seekforward"] as MediaSessionAction[]) {
        try { navigator.mediaSession.setActionHandler(action, null); } catch { /* Safari may reject unsupported actions. */ }
      }
    };
  }, [title]);

  return <audio ref={audioRef} controls preload="none" src={src} />;
}
