"use client";

import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsPeriod } from "@/lib/contracts";

export type AnalyticsLine = {
  dataKey: keyof Omit<AnalyticsPeriod, "label">;
  name: string;
  color: string;
  yAxisId?: "left" | "right";
};

export default function AnalyticsChart({
  data,
  lines,
  yTickFormatter,
  rightYTickFormatter,
}: {
  data: AnalyticsPeriod[];
  lines: AnalyticsLine[];
  yTickFormatter?: (value: number) => string;
  rightYTickFormatter?: (value: number) => string;
}) {
  const hasRightAxis = lines.some((line) => line.yAxisId === "right");

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ top: 6, right: hasRightAxis ? 18 : 12, bottom: 0, left: 0 }}
      >
        <CartesianGrid stroke="#e7edf2" vertical={false} />
        <XAxis
          dataKey="label"
          interval={2}
          tick={{ fontSize: 11, fill: "#64809f" }}
        />
        <YAxis
          yAxisId="left"
          width={44}
          tick={{ fontSize: 11, fill: "#64809f" }}
          tickFormatter={yTickFormatter}
        />
        {hasRightAxis && (
          <YAxis
            yAxisId="right"
            orientation="right"
            width={36}
            tick={{ fontSize: 11, fill: "#64809f" }}
            tickFormatter={rightYTickFormatter}
          />
        )}
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(value, name) => [
            typeof value === "number"
              ? yTickFormatter
                ? yTickFormatter(value)
                : value.toLocaleString("en-US")
              : String(value),
            name,
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {lines.map((line) => (
          <Line
            key={line.dataKey}
            yAxisId={line.yAxisId ?? "left"}
            type="monotone"
            dataKey={line.dataKey}
            name={line.name}
            stroke={line.color}
            strokeWidth={2.5}
            dot={false}
            connectNulls
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
