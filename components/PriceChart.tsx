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
      date: new Date(point.capturedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
      }),
      avgPrice: point.avgPrice
    }));

  return (
    <div className="h-72 w-full rounded-2xl border border-stroke bg-panel p-4 shadow-card md:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="4 4" stroke="#22304f" />
          <XAxis dataKey="date" stroke="#c7d2e6" minTickGap={20} />
          <YAxis
            stroke="#c7d2e6"
            tickFormatter={(value) => `$${Number(value).toLocaleString("en-US")}`}
            width={84}
          />
          <Tooltip
            formatter={(value) => formatDollars(Number(value))}
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
            stroke="#38bdf8"
            strokeWidth={3}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
