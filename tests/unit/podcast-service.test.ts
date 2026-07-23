import { describe, expect, it, vi } from "vitest";

import type { CurrentUserAccess } from "@/lib/access/types";
import {
  askPodcastForUser,
  getPodcastEpisodeForUser,
  listPodcastEpisodesForUser,
} from "@/lib/podcast/podcast-service";

const proUser: CurrentUserAccess = {
  id: "user_1",
  email: "pro@example.com",
  displayName: "Pro",
  role: "normal",
  plan: "pro",
  entitlements: new Set(["podcast.chat", "podcast.generate"]),
};

const freeUser: CurrentUserAccess = {
  ...proUser,
  id: "user_free",
  plan: "free",
  entitlements: new Set(),
};

const episode = {
  id: "episode_1",
  userId: "user_1",
  localDate: new Date("2026-07-24T00:00:00.000Z"),
  title: "Skill Compass briefing",
  language: "en",
  status: "ready",
  sourceSnapshot: [{ id: "source_1", title: "Source", url: "https://example.com/source" }],
  script: {
    language: "en" as const,
    speakers: [{ speaker: "host_a" as const, text: "Transcript line" }],
  },
  createdAt: new Date("2026-07-24T00:00:00.000Z"),
  updatedAt: new Date("2026-07-24T00:00:00.000Z"),
};

describe("Podcast service", () => {
  it("lists only bounded episodes owned by the user", async () => {
    const result = await listPodcastEpisodesForUser(proUser, 20, {
      listEpisodes: async () => [
        { ...episode, durationSeconds: 321 },
        { ...episode, id: "episode_other", userId: "user_2", durationSeconds: 99 },
      ],
    });

    expect(result).toEqual([
      {
        id: "episode_1",
        title: "Skill Compass briefing",
        localDate: "2026-07-24",
        language: "en",
        status: "ready",
        durationSeconds: 321,
        contextReady: true,
      },
    ]);
  });

  it("does not return an episode owned by another user", async () => {
    await expect(
      getPodcastEpisodeForUser(proUser, "episode_other", {
        findEpisode: async () => null,
      }),
    ).rejects.toThrow("podcast_episode_not_found");
  });

  it("returns transcript and sources without storage internals", async () => {
    const result = await getPodcastEpisodeForUser(proUser, "episode_1", {
      findEpisode: async () => ({ ...episode, durationSeconds: 321 }),
    });

    expect(result).toEqual({
      id: "episode_1",
      title: "Skill Compass briefing",
      localDate: "2026-07-24",
      language: "en",
      status: "ready",
      durationSeconds: 321,
      transcript: [{ speaker: "host_a", text: "Transcript line" }],
      sources: [{ title: "Source", url: "https://example.com/source" }],
    });
    expect(JSON.stringify(result)).not.toContain("storage");
    expect(JSON.stringify(result)).not.toContain("userId");
  });

  it("requires podcast.chat before asking a question", async () => {
    await expect(
      askPodcastForUser(
        { user: freeUser, episodeId: "episode_1", question: "Explain this" },
        {
          findEpisode: async () => ({ ...episode, durationSeconds: null }),
          getConversation: async () => [],
          generateAnswer: vi.fn(),
          saveMessages: vi.fn(),
        },
      ),
    ).rejects.toThrow("podcast_chat_forbidden");
  });

  it("persists both messages only after an answer is generated", async () => {
    const saveMessages = vi.fn();
    const result = await askPodcastForUser(
      { user: proUser, episodeId: "episode_1", question: "Explain this" },
      {
        findEpisode: async () => ({ ...episode, durationSeconds: null }),
        getConversation: async () => [],
        generateAnswer: async () => ({ answer: "Grounded answer", provider: "test" }),
        saveMessages,
      },
    );

    expect(result).toEqual({ answer: "Grounded answer", provider: "test" });
    expect(saveMessages).toHaveBeenCalledWith("user_1", "episode_1", [
      { role: "user", text: "Explain this", provider: null },
      { role: "assistant", text: "Grounded answer", provider: "test" },
    ]);
  });

  it("does not persist messages when answer generation fails", async () => {
    const saveMessages = vi.fn();

    await expect(
      askPodcastForUser(
        { user: proUser, episodeId: "episode_1", question: "Explain this" },
        {
          findEpisode: async () => ({ ...episode, durationSeconds: null }),
          getConversation: async () => [],
          generateAnswer: async () => {
            throw new Error("provider_failed");
          },
          saveMessages,
        },
      ),
    ).rejects.toThrow("provider_failed");
    expect(saveMessages).not.toHaveBeenCalled();
  });
});
