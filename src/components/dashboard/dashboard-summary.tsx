import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, Flame, Target, TrendingUp } from "lucide-react";

import type { DashboardData } from "@/lib/dashboard/get-dashboard";

import { SkillRadarChart } from "./radar-chart";

type DashboardSummaryProps = {
  data: DashboardData;
};

export function DashboardSummary({ data }: DashboardSummaryProps) {
  const quizTotal = data.todayQuiz.total || 5;
  const quizPercent = Math.round((data.todayQuiz.answered / quizTotal) * 100);

  return (
    <div className="dashboard-grid">
      <section className="today-card dashboard-today">
        <div>
          <p className="metric-label">Today</p>
          <p className="metric-value">
            {data.todayQuiz.answered} / {quizTotal}
          </p>
          <p className="metric-caption">Daily quiz progress</p>
        </div>
        <div className="progress-ring" style={{ "--progress": `${quizPercent}%` } as CSSProperties}>
          <span>{quizPercent}%</span>
        </div>
      </section>

      <section className="metric-strip" aria-label="Learning signals">
        <div>
          <Flame size={18} aria-hidden="true" />
          <span>Streak</span>
          <strong>{data.streakDays}d</strong>
        </div>
        <div>
          <Target size={18} aria-hidden="true" />
          <span>Accuracy</span>
          <strong>{Math.round(data.weeklyAccuracy * 100)}%</strong>
        </div>
      </section>

      <SkillRadarChart scores={data.categoryScores} />

      <section className="dashboard-section">
        <div className="section-heading">
          <h2>Weak points</h2>
          <Link href="/concepts">
            Review <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <div className="compact-list">
          {data.weakPoints.map((point) => (
            <div key={point.conceptId}>
              <span>{point.title}</span>
              <strong>{Math.round(point.score * 100)}%</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-heading">
          <h2>Improving</h2>
          <TrendingUp size={18} aria-hidden="true" />
        </div>
        <div className="compact-list">
          {data.improvingTags.map((tag) => (
            <div key={tag.tagId}>
              <span>{tag.name}</span>
              <strong>+{Math.round(tag.delta * 100)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-heading">
          <h2>Calibration</h2>
        </div>
        <div className="compact-list">
          {data.categoryScores.map((score) => (
            <div key={score.categoryId}>
              <span>{score.name}</span>
              <strong>{score.gap === null ? "new" : `${score.gap > 0 ? "+" : ""}${Math.round(score.gap * 100)}`}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="prompt-row" aria-label="Review prompts">
        {data.prompts.map((prompt) => (
          <Link key={prompt.id} href={prompt.href}>
            {prompt.label}
          </Link>
        ))}
      </section>
    </div>
  );
}
