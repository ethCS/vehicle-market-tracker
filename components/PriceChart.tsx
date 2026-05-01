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
    <div className="h-72 w-full rounded-2xl bg-white p-4 shadow-card md:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="4 4" stroke="#d1d5db" />
          <XAxis dataKey="date" stroke="#4b5563" minTickGap={20} />
          <YAxis
            stroke="#4b5563"
            tickFormatter={(value) => `$${Number(value).toLocaleString("en-US")}`}
            width={84}
          />
          <Tooltip
            formatter={(value) => formatDollars(Number(value))}
            wrapperClassName="rounded-xl border border-gray-300 bg-white"
          />
          <Line
            type="monotone"
            dataKey="avgPrice"
            stroke="#b45309"
            strokeWidth={3}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
