"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart as RechartsRadarChart,
  ResponsiveContainer,
} from "recharts";

import type { DashboardData } from "@/lib/dashboard/get-dashboard";

type RadarChartProps = {
  scores: DashboardData["categoryScores"];
};

export function SkillRadarChart({ scores }: RadarChartProps) {
  const data = scores.map((score) => ({
    axis: score.name,
    measured: Math.round(score.measured * 100),
    self: Math.round((score.selfRating ?? 0) * 100),
  }));

  return (
    <div className="radar-panel" aria-label="Skill radar chart">
      <ResponsiveContainer width="100%" height={226}>
        <RechartsRadarChart data={data} outerRadius={78}>
          <PolarGrid stroke="#d7dfdc" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: "#66736f", fontSize: 11 }} />
          <Radar dataKey="self" stroke="#8aa24a" fill="#d7ff6a" fillOpacity={0.16} strokeWidth={2} />
          <Radar dataKey="measured" stroke="#0f7b68" fill="#0f7b68" fillOpacity={0.28} strokeWidth={2} />
        </RechartsRadarChart>
      </ResponsiveContainer>
      <div className="chart-legend" aria-label="Chart legend">
        <span>
          <i className="legend-dot measured" /> Measured
        </span>
        <span>
          <i className="legend-dot self" /> Self
        </span>
      </div>
    </div>
  );
}
