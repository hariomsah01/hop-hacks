"use client";

import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsPeriod } from "@/lib/contracts";

const METRIC_KEYS = [
  "foodDistributed",
  "foodReceived",
  "foodWasted",
  "clients",
  "households",
  "staff",
  "foodAccessGapLb",
] as const;

export type AnalyticsLine = {
  dataKey: (typeof METRIC_KEYS)[number];
  name: string;
  color: string;
  yAxisId?: "left" | "right";
};

function splitHistoryAndForecast(
  periods: AnalyticsPeriod[],
  firstForecastIndex: number,
) {
  return periods.map((period, index) => {
    const row: Record<string, string | number | null> = {
      label: period.label,
    };
    for (const key of METRIC_KEYS) {
      row[`${key}Hist`] = index <= firstForecastIndex ? period[key] : null;
      row[`${key}Fcast`] = index >= firstForecastIndex ? period[key] : null;
    }
    return row;
  });
}

function TerminalTooltip({
  active,
  label,
  payload,
  valueFormatter,
}: {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ name?: string; value?: number | null; color?: string }>;
  valueFormatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter(
    (item) => item.value != null && !String(item.name ?? "").endsWith("forecast"),
  );
  return (
    <div className="border border-[#ffb000] bg-[#07090d] px-2 py-1.5 font-mono text-[10px] text-[#d5dde6]">
      <div className="mb-1 font-semibold tracking-[0.12em] text-[#ffb000]">
        {label}
      </div>
      {rows.map((item) => (
        <div key={item.name} className="flex justify-between gap-4">
          <span style={{ color: item.color }}>{item.name}</span>
          <span className="tabular-nums">
            {typeof item.value === "number"
              ? valueFormatter
                ? valueFormatter(item.value)
                : item.value.toLocaleString("en-US")
              : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsChart({
  data,
  lines,
  firstForecastIndex,
  cursorIndex,
  syncId,
  onCursorIndex,
  yTickFormatter,
  rightYTickFormatter,
  tooltipFormatter,
  yDomain,
  rightYDomain,
}: {
  data: AnalyticsPeriod[];
  lines: AnalyticsLine[];
  firstForecastIndex: number;
  cursorIndex: number;
  syncId: string;
  onCursorIndex: (index: number) => void;
  yTickFormatter?: (value: number) => string;
  rightYTickFormatter?: (value: number) => string;
  tooltipFormatter?: (value: number) => string;
  yDomain?: [number, number];
  rightYDomain?: [number, number];
}) {
  const hasRightAxis = lines.some((line) => line.yAxisId === "right");
  const rows = splitHistoryAndForecast(data, firstForecastIndex);
  const forecastLabel = data[firstForecastIndex]?.label;
  const lastLabel = data[data.length - 1]?.label;
  const tick = {
    fontSize: 10,
    fill: "#7d8b9a",
    fontFamily: "ui-monospace, monospace",
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={rows}
        syncId={syncId}
        syncMethod="index"
        margin={{ top: 8, right: hasRightAxis ? 18 : 10, bottom: 0, left: 0 }}
        onMouseMove={(state) => {
          const index =
            typeof state.activeIndex === "number"
              ? state.activeIndex
              : Number(state.activeIndex);
          if (Number.isFinite(index)) onCursorIndex(index);
        }}
      >
        <CartesianGrid stroke="#1c2430" vertical={false} />
        {forecastLabel && lastLabel && (
          <ReferenceArea
            x1={forecastLabel}
            x2={lastLabel}
            fill="#ffb000"
            fillOpacity={0.06}
          />
        )}
        <XAxis
          dataKey="label"
          interval={2}
          tick={tick}
          axisLine={{ stroke: "#1c2430" }}
          tickLine={false}
        />
        <YAxis
          yAxisId="left"
          width={42}
          tick={tick}
          tickFormatter={yTickFormatter}
          axisLine={false}
          tickLine={false}
          domain={yDomain}
        />
        {hasRightAxis && (
          <YAxis
            yAxisId="right"
            orientation="right"
            width={42}
            tick={{ ...tick, fill: "#ff7a45" }}
            tickFormatter={rightYTickFormatter}
            axisLine={false}
            tickLine={false}
            domain={rightYDomain}
          />
        )}
        <Tooltip
          defaultIndex={cursorIndex}
          cursor={{ stroke: "#f5d76e", strokeWidth: 1.5 }}
          content={
            <TerminalTooltip
              valueFormatter={tooltipFormatter ?? yTickFormatter}
            />
          }
        />
        <Legend
          wrapperStyle={{ fontSize: 10, color: "#7d8b9a" }}
          iconType="plainline"
        />
        {forecastLabel && (
          <ReferenceLine
            x={forecastLabel}
            stroke="#ffb000"
            strokeDasharray="3 3"
            strokeWidth={1}
            label={{
              value: "FCAST",
              fill: "#ffb000",
              fontSize: 9,
              position: "insideTopLeft",
            }}
          />
        )}
        {data[cursorIndex] && (
          <ReferenceLine
            x={data[cursorIndex].label}
            stroke="#f5d76e"
            strokeWidth={1.5}
          />
        )}
        {lines.map((line) => (
          <Line
            key={`${line.dataKey}-hist`}
            yAxisId={line.yAxisId ?? "left"}
            type="monotone"
            dataKey={`${line.dataKey}Hist`}
            name={line.name}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
            isAnimationActive={false}
            legendType="plainline"
          />
        ))}
        {lines.map((line) => (
          <Line
            key={`${line.dataKey}-fcast`}
            yAxisId={line.yAxisId ?? "left"}
            type="monotone"
            dataKey={`${line.dataKey}Fcast`}
            name={`${line.name} forecast`}
            stroke={line.color}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
            isAnimationActive={false}
            legendType="none"
            tooltipType="none"
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
