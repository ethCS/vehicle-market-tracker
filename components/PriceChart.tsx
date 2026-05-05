"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type PricePoint = {
  capturedAt: string;
  avgPrice: number;
};

type PriceChartProps = {
  points: PricePoint[];
};

function formatDollars(value: number): string {
  return `$${value.toLocaleString("en-US")}`;
}

export default function PriceChart({ points }: PriceChartProps): JSX.Element {
  const data = [...points]
    .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime())
    .map((point) => ({
      date: point.capturedAt,
      avgPrice: point.avgPrice
    }));

  return (
    <div className="h-72 w-full rounded-2xl glass-panel p-4 md:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="4 4" stroke="#22304f" />
          <XAxis
            dataKey="date"
            stroke="#c7d2e6"
            minTickGap={28}
            tickFormatter={(value) => {
              const date = new Date(String(value));
              if (Number.isNaN(date.getTime())) {
                return String(value);
              }

              return date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric"
              });
            }}
          />
          <YAxis
            stroke="#c7d2e6"
            tickFormatter={(value) => `$${Number(value).toLocaleString("en-US")}`}
            width={84}
          />
          <Tooltip
            formatter={(value) => formatDollars(Number(value))}
            labelFormatter={(value) => {
              const date = new Date(String(value));
              if (Number.isNaN(date.getTime())) {
                return String(value);
              }

              return date.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit"
              });
            }}
            contentStyle={{
              borderRadius: "0.75rem",
              border: "1px solid #22304f",
              backgroundColor: "#0f172a",
              color: "#e5edf8"
            }}
          />
          <Line
            type="monotone"
            dataKey="avgPrice"
            stroke="#a78bfa"
            strokeWidth={3}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
