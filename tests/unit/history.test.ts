import { describe, expect, it } from "vitest";
import { buildHistoryArchive, buildHistoryDay, buildHistorySearchResults } from "@/lib/history/get-history";

const rows = {
  userId: "user_a",
  quizDays: [
    { id: "quiz_2026-07-10", userId: "user_a", quizDate: "2026-07-10" },
    { id: "quiz_2026-07-09", userId: "user_a", quizDate: "2026-07-09" },
    { id: "quiz_user_b_2026-07-10", userId: "user_b", quizDate: "2026-07-10" },
  ],
  answers: [
    {
      userId: "user_a",
      quizDayId: "quiz_2026-07-10",
      questionId: "q_index",
      selectedChoiceId: "a",
      confidence: 3,
      reasoning: "Indexes speed reads but add write work.",
      correct: true,
      feedback: "Correct. You named the tradeoff.",
      answeredAt: "2026-07-10T12:00:00.000Z",
    },
    {
      userId: "user_a",
      quizDayId: "quiz_2026-07-10",
      questionId: "q_proxy",
      selectedChoiceId: "b",
      confidence: 2,
      reasoning: "It routes requests.",
      correct: false,
      feedback: "Review the reverse proxy role.",
      answeredAt: "2026-07-10T12:00:00.000Z",
    },
    {
      userId: "user_a",
      quizDayId: "quiz_2026-07-09",
      questionId: "q_token",
      selectedChoiceId: "a",
      confidence: 4,
      reasoning: "Tokens name reusable decisions.",
      correct: true,
      feedback: "Good.",
      answeredAt: "2026-07-09T12:00:00.000Z",
    },
    {
      userId: "user_b",
      quizDayId: "quiz_user_b_2026-07-10",
      questionId: "q_other",
      selectedChoiceId: "a",
      confidence: 5,
      reasoning: "This belongs to another user.",
      correct: true,
      feedback: "Other user's feedback.",
      answeredAt: "2026-07-10T13:00:00.000Z",
    },
  ],
  questions: [
    {
      id: "q_index",
      conceptId: "concept_index",
      prompt: "What is a common tradeoff when adding a database index?",
      choices: [
        { id: "a", label: "Reads may improve, writes and storage can cost more.", correct: true },
        { id: "b", label: "Everything becomes free.", correct: false },
      ],
    },
    {
      id: "q_proxy",
      conceptId: "concept_proxy",
      prompt: "What does a reverse proxy usually do?",
      choices: [
        { id: "a", label: "Compiles frontend assets.", correct: false },
        { id: "b", label: "Forwards requests upstream.", correct: true },
      ],
    },
    {
      id: "q_token",
      conceptId: "concept_token",
      prompt: "What is a design token used for?",
      choices: [{ id: "a", label: "Named design data.", correct: true }],
    },
    {
      id: "q_other",
      conceptId: "concept_other",
      prompt: "Other user's private question?",
      choices: [{ id: "a", label: "Private answer.", correct: true }],
    },
  ],
  concepts: [
    { id: "concept_index", title: "index design" },
    { id: "concept_proxy", title: "reverse proxy" },
    { id: "concept_token", title: "design token" },
    { id: "concept_other", title: "other private concept" },
  ],
};

describe("buildHistoryArchive", () => {
  it("groups answered quiz days by year, month, and day with summaries", () => {
    const archive = buildHistoryArchive(rows);

    expect(archive.years).toEqual([
      {
        year: "2026",
        answered: 3,
        correct: 2,
        accuracy: 0.667,
        months: [
          {
            month: "07",
            label: "July",
            answered: 3,
            correct: 2,
            accuracy: 0.667,
            days: [
              { date: "2026-07-10", label: "10", answered: 2, correct: 1, accuracy: 0.5 },
              { date: "2026-07-09", label: "09", answered: 1, correct: 1, accuracy: 1 },
            ],
          },
        ],
      },
    ]);
  });
});

describe("buildHistoryDay", () => {
  it("returns detailed answer cards for a selected day", () => {
    const day = buildHistoryDay(rows, "2026-07-10");

    expect(day).toEqual({
      date: "2026-07-10",
      answered: 2,
      correct: 1,
      accuracy: 0.5,
      answers: [
        {
          questionId: "q_index",
          conceptTitle: "index design",
          prompt: "What is a common tradeoff when adding a database index?",
          selectedChoiceLabel: "Reads may improve, writes and storage can cost more.",
          correctChoiceLabel: "Reads may improve, writes and storage can cost more.",
          confidence: 3,
          reasoning: "Indexes speed reads but add write work.",
          correct: true,
          feedback: "Correct. You named the tradeoff.",
        },
        {
          questionId: "q_proxy",
          conceptTitle: "reverse proxy",
          prompt: "What does a reverse proxy usually do?",
          selectedChoiceLabel: "Forwards requests upstream.",
          correctChoiceLabel: "Forwards requests upstream.",
          confidence: 2,
          reasoning: "It routes requests.",
          correct: false,
          feedback: "Review the reverse proxy role.",
        },
      ],
    });
  });
});

describe("buildHistorySearchResults", () => {
  it("matches prompt, concept, selected answer, and reasoning text", () => {
    expect(buildHistorySearchResults(rows, "tradeoff")).toEqual([
      {
        date: "2026-07-10",
        questionId: "q_index",
        conceptTitle: "index design",
        prompt: "What is a common tradeoff when adding a database index?",
        correct: true,
      },
    ]);
    expect(buildHistorySearchResults(rows, "reverse proxy")).toHaveLength(1);
    expect(buildHistorySearchResults(rows, "other user")).toEqual([]);
    expect(buildHistorySearchResults(rows, "missing term")).toEqual([]);
  });
});
