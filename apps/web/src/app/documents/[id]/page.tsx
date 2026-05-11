"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import type { Clause } from "@finch/sdk";
import { ClauseReview } from "@/components/ClauseReview";

export default function DocumentViewPage() {
  const { id } = useParams<{ id: string }>();

  const { data: version, isLoading, error } = useQuery({
    queryKey: ["document", id],
    queryFn: () => apiClient.getDocument(id),
    enabled: !!id,
  });

  if (isLoading) return <div className="text-gray-500">Loading…</div>;
  if (error)
    return (
      <div className="text-red-600 bg-red-50 rounded p-3">
        {String(error)}
      </div>
    );
  if (!version) return null;

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <div className="text-sm text-gray-500 mb-1">
            <Link href="/" className="hover:underline">Dashboard</Link> /
            Document
          </div>
          <h1 className="text-2xl font-bold">
            Version {version.version_number}
          </h1>
          <div className="flex gap-4 mt-2 text-sm text-gray-500">
            <span>
              State:{" "}
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {version.state}
              </span>
            </span>
            <span>Author: {version.author}</span>
            <span className="font-mono text-xs">{version.id}</span>
          </div>
          {version.message && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {version.message}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Link
            href={`/documents/${id}/risk`}
            className="px-3 py-1.5 text-sm rounded-lg bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 hover:bg-purple-200"
          >
            Risk Report
          </Link>
          <a
            href={apiClient.renderPdfUrl(id)}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
          >
            Download PDF
          </a>
        </div>
      </div>

      <div className="space-y-1">
        {version.clauses.map((clause) => (
          <ClauseNode key={clause.id} clause={clause} versionId={id} depth={0} />
        ))}
      </div>
    </div>
  );
}

function ClauseNode({
  clause,
  versionId,
  depth,
}: {
  clause: Clause;
  versionId: string;
  depth: number;
}) {
  const indent = depth * 16;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 rounded hover:bg-gray-50 dark:hover:bg-gray-800 group"
        style={{ paddingLeft: `${indent + 12}px` }}
      >
        {clause.number && (
          <span className="text-gray-400 text-sm font-mono shrink-0">
            {clause.number.join(".")}
          </span>
        )}
        <span className="text-sm font-medium flex-1">{clause.title}</span>
        {clause.role && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
            {clause.role}
          </span>
        )}
        {clause.domain && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            {clause.domain}
          </span>
        )}
        <ClauseReview clauseId={clause.id} />
      </div>
      {clause.children.map((child) => (
        <ClauseNode
          key={child.id}
          clause={child}
          versionId={versionId}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
