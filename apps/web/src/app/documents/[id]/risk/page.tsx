"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { apiClient } from "@/lib/api";

const RISK_COLOURS: Record<string, string> = {
  "1": "#22c55e",
  "2": "#86efac",
  "3": "#facc15",
  "4": "#f97316",
  "5": "#ef4444",
};

export default function RiskReportPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["risk", id],
    queryFn: () => apiClient.getRiskReport(id),
    enabled: !!id,
  });

  if (isLoading) return <div className="text-gray-500">Loading risk report…</div>;
  if (error)
    return (
      <div className="text-red-600 bg-red-50 rounded p-3">{String(error)}</div>
    );
  if (!data) return null;

  const chartData = Object.entries(data.risk_distribution).map(([score, count]) => ({
    score: `Score ${score}`,
    count,
    key: score,
  }));

  const coveragePct =
    data.total_clauses > 0
      ? Math.round((data.classified_clauses / data.total_clauses) * 100)
      : 0;

  return (
    <div>
      <div className="mb-6">
        <div className="text-sm text-gray-500 mb-1">
          <Link href="/" className="hover:underline">Dashboard</Link> /{" "}
          <Link href={`/documents/${id}`} className="hover:underline">
            Document
          </Link>{" "}
          / Risk Report
        </div>
        <h1 className="text-2xl font-bold">Risk Report</h1>
        <p className="text-sm text-gray-500 font-mono mt-1">{id}</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Clauses" value={data.total_clauses} />
        <StatCard label="Classified" value={data.classified_clauses} />
        <StatCard label="Coverage" value={`${coveragePct}%`} />
      </div>

      {chartData.length > 0 && (
        <div className="mb-8 p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-4">
            Risk Distribution
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 0, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="score" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell
                    key={entry.key}
                    fill={RISK_COLOURS[entry.key] ?? "#94a3b8"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.high_risk_clauses.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">High-Risk Clauses</h2>
          <div className="space-y-2">
            {data.high_risk_clauses.map((clause) => (
              <div
                key={clause.clause_id}
                className="p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-sm">{clause.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {clause.role} · {clause.domain}
                    </div>
                    <div className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                      {clause.risk_reason}
                    </div>
                  </div>
                  <span className="shrink-0 text-lg font-bold text-red-600">
                    {clause.risk_score}/5
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </div>
  );
}
