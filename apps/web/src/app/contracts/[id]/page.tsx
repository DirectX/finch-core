"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collabFetch } from "@/lib/collab-api";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  FileTextIcon,
  ChevronRightIcon,
  PlusIcon,
  UploadIcon,
  ClockIcon,
  MessageCircleIcon,
} from "lucide-react";

interface Contract {
  id: string;
  title: string;
  description: string | null;
  status: string;
  folderId: string | null;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

interface DocumentVersion {
  id: string;
  contractId: string;
  versionNumber: number;
  state: string;
  author: string;
  message: string | null;
  createdAt: string;
}

export default function ContractPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);

  const { data: contract } = useQuery<Contract>({
    queryKey: ["contract", id],
    queryFn: () => collabFetch(`/contracts/${id}`),
    enabled: !!id,
  });

  const { data: versions } = useQuery<DocumentVersion[]>({
    queryKey: ["contract-versions", id],
    queryFn: () => collabFetch(`/contracts/${id}/versions`),
    enabled: !!id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) =>
      collabFetch(`/contracts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract", id] });
    },
  });

  const statusOptions = ["draft", "review", "approved", "signed", "archived"];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
        <Link href="/projects" className="hover:underline">
          Projects
        </Link>
        <ChevronRightIcon className="w-4 h-4" />
        <Link href={`/projects/${contract?.projectId}`} className="hover:underline">
          Project
        </Link>
        <ChevronRightIcon className="w-4 h-4" />
        <span>Contract</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          <h1 className="text-3xl font-bold mb-2">{contract?.title}</h1>
          {contract?.description && (
            <p className="text-gray-600 dark:text-gray-400">{contract.description}</p>
          )}
          <div className="flex items-center gap-3 mt-3">
            <select
              value={contract?.status || "draft"}
              onChange={(e) => updateStatusMutation.mutate(e.target.value)}
              className="px-3 py-1.5 border rounded-lg dark:bg-gray-800 dark:border-gray-600"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-500">
              Created {contract && new Date(contract.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/contracts/${id}/discussions`}
            className="flex items-center gap-2 px-4 py-2 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200"
          >
            <MessageCircleIcon className="w-4 h-4" />
            Discussions
          </Link>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <UploadIcon className="w-4 h-4" />
            Upload Version
          </button>
        </div>
      </div>

      {showUpload && (
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h3 className="font-semibold mb-2">Upload New Version</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Upload a document to the Rust API at <code>http://localhost:3000</code>, then link it
            to this contract by creating a document version record.
          </p>
          <button
            onClick={() => setShowUpload(false)}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      )}

      <div className="border-t pt-6 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <ClockIcon className="w-5 h-5" />
          Version History
        </h2>

        <div className="space-y-2">
          {versions?.map((version) => (
            <Link
              key={version.id}
              href={`/documents/${version.id}`}
              className="block p-4 border rounded-lg hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <FileTextIcon className="w-5 h-5 text-gray-500 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">Version {version.versionNumber}</h3>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                        {version.state}
                      </span>
                    </div>
                    {version.message && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {version.message}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span>By {version.author}</span>
                      <span>{new Date(version.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}

          {versions?.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <FileTextIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No versions yet. Upload a document to create the first version.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
