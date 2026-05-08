"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { apiClient } from "@/lib/api";
import type { ClauseDiff } from "@finch/sdk";

const ReactDiffViewer = dynamic(() => import("react-diff-viewer-continued"), {
  ssr: false,
});

export default function DiffViewPage() {
  const { id, other } = useParams<{ id: string; other: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["diff", id, other],
    queryFn: () => apiClient.getDiff(id, other),
    enabled: !!id && !!other,
  });

  if (isLoading) return <div className="text-gray-500">Loading diff…</div>;
  if (error)
    return (
      <div className="text-red-600 bg-red-50 rounded p-3">{String(error)}</div>
    );
  if (!data) return null;

  const modified = data.diffs.filter((d) => d.kind.kind === "Modified");
  const added = data.diffs.filter((d) => d.kind.kind === "Added");
  const removed = data.diffs.filter((d) => d.kind.kind === "Removed");

  return (
    <div>
      <div className="mb-6">
        <div className="text-sm text-gray-500 mb-1">
          <Link href="/" className="hover:underline">Dashboard</Link> / Diff
        </div>
        <h1 className="text-2xl font-bold">Version Diff</h1>
        <div className="flex gap-4 mt-2 text-sm text-gray-500 font-mono">
          <span>{data.from_version_id.slice(0, 8)} → {data.to_version_id.slice(0, 8)}</span>
        </div>
      </div>

      <div className="flex gap-4 mb-6 text-sm">
        <SummaryChip label="Added" count={data.added_count} colour="green" />
        <SummaryChip label="Removed" count={data.removed_count} colour="red" />
        <SummaryChip label="Modified" count={data.modified_count} colour="yellow" />
        <SummaryChip label="Unchanged" count={data.unchanged_count} colour="gray" />
      </div>

      {added.length > 0 && (
        <Section title="Added Clauses">
          {added.map((d) => (
            <div key={d.clause_id} className="p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-sm">
              <span className="font-medium">{d.title}</span>
            </div>
          ))}
        </Section>
      )}

      {removed.length > 0 && (
        <Section title="Removed Clauses">
          {removed.map((d) => (
            <div key={d.clause_id} className="p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-sm">
              <span className="font-medium">{d.title}</span>
            </div>
          ))}
        </Section>
      )}

      {modified.length > 0 && (
        <Section title="Modified Clauses">
          {modified.map((d) => (
            <ModifiedClause key={d.clause_id} diff={d} />
          ))}
        </Section>
      )}
    </div>
  );
}

function ModifiedClause({ diff }: { diff: ClauseDiff }) {
  if (diff.kind.kind !== "Modified") return null;
  return (
    <div className="rounded-lg border border-yellow-200 dark:border-yellow-900 overflow-hidden">
      <div className="px-4 py-2 bg-yellow-50 dark:bg-yellow-950 flex items-center justify-between">
        <span className="text-sm font-medium">{diff.title}</span>
        <span className="text-xs text-gray-500">
          {Math.round(diff.kind.similarity * 100)}% similar
        </span>
      </div>
      <ReactDiffViewer
        oldValue={diff.kind.text_before}
        newValue={diff.kind.text_after}
        splitView={false}
        useDarkTheme={false}
        hideLineNumbers={false}
      />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function SummaryChip({
  label,
  count,
  colour,
}: {
  label: string;
  count: number;
  colour: "green" | "red" | "yellow" | "gray";
}) {
  const styles = {
    green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  return (
    <div className={`px-3 py-1.5 rounded-lg text-sm font-medium ${styles[colour]}`}>
      {count} {label}
    </div>
  );
}
