"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient } from "@/lib/api";

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["documents"],
    queryFn: () => apiClient.listDocuments(),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Documents</h1>
        <Link
          href="/upload"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          Upload Document
        </Link>
      </div>

      {isLoading && (
        <div className="text-gray-500">Loading documents…</div>
      )}
      {error && (
        <div className="text-red-600 bg-red-50 rounded p-3">
          Failed to load documents: {String(error)}
        </div>
      )}

      {data && data.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          No documents yet.{" "}
          <Link href="/upload" className="text-blue-600 underline">
            Upload one
          </Link>{" "}
          to get started.
        </div>
      )}

      {data && data.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Version ID
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Version #
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  State
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Author
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Created
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {data.map((doc) => (
                <tr
                  key={doc.id}
                  className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {doc.id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3">{doc.version_number}</td>
                  <td className="px-4 py-3">
                    <StateBadge state={doc.state} />
                  </td>
                  <td className="px-4 py-3">{doc.author}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <Link
                        href={`/documents/${doc.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        View
                      </Link>
                      <Link
                        href={`/documents/${doc.id}/risk`}
                        className="text-purple-600 hover:underline"
                      >
                        Risk
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const colours: Record<string, string> = {
    Draft: "bg-gray-100 text-gray-700",
    UnderReview: "bg-yellow-100 text-yellow-800",
    Negotiating: "bg-blue-100 text-blue-800",
    Agreed: "bg-green-100 text-green-800",
    Rejected: "bg-red-100 text-red-700",
    Superseded: "bg-gray-200 text-gray-500",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colours[state] ?? "bg-gray-100 text-gray-600"}`}
    >
      {state}
    </span>
  );
}
