"use client";

import { useQuery } from "@tanstack/react-query";
import { collabFetch } from "@/lib/collab-api";
import Link from "next/link";
import { FileTextIcon, ChevronRightIcon } from "lucide-react";

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

interface Project {
  id: string;
  name: string;
  description: string | null;
  teamId: string;
  createdAt: string;
  updatedAt: string;
}

const statusColumns = [
  { id: "draft", label: "Draft", color: "bg-gray-100 dark:bg-gray-800" },
  { id: "review", label: "In Review", color: "bg-yellow-100 dark:bg-yellow-900" },
  { id: "approved", label: "Approved", color: "bg-green-100 dark:bg-green-900" },
  { id: "signed", label: "Signed", color: "bg-blue-100 dark:bg-blue-900" },
  { id: "archived", label: "Archived", color: "bg-gray-200 dark:bg-gray-700" },
];

export default function DashboardPage() {
  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => collabFetch("/projects"),
  });

  const { data: allContracts, isLoading: contractsLoading } = useQuery<Contract[]>({
    queryKey: ["all-contracts", projects],
    queryFn: async () => {
      if (!projects || projects.length === 0) {
        return [];
      }

      const contractPromises = projects.map((project) =>
        collabFetch<Contract[]>(`/contracts?projectId=${project.id}`).catch(() => [])
      );

      const contractArrays = await Promise.all(contractPromises);
      return contractArrays.flat();
    },
    enabled: !!projects && projects.length > 0,
  });

  const isLoading = projectsLoading || contractsLoading;

  const contractsByStatus = statusColumns.map((column) => ({
    ...column,
    contracts: allContracts?.filter((c) => c.status === column.id) || [],
  }));

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Contract Pipeline</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Track all contracts across your projects
          </p>
        </div>
        <Link
          href="/projects"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          View Projects
        </Link>
      </div>

      {isLoading ? (
        <div className="text-gray-500">Loading contracts...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {contractsByStatus.map((column) => (
            <div key={column.id} className="flex flex-col">
              <div className={`${column.color} rounded-t-lg px-4 py-3`}>
                <h2 className="font-semibold text-sm">
                  {column.label}
                  <span className="ml-2 text-xs opacity-75">({column.contracts.length})</span>
                </h2>
              </div>
              <div className="flex-1 bg-gray-50 dark:bg-gray-900 rounded-b-lg p-2 space-y-2 min-h-[400px]">
                {column.contracts.map((contract) => (
                  <Link
                    key={contract.id}
                    href={`/contracts/${contract.id}`}
                    className="block p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow border dark:border-gray-700"
                  >
                    <div className="flex items-start gap-2">
                      <FileTextIcon className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">{contract.title}</h3>
                        {contract.description && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-1">
                            {contract.description}
                          </p>
                        )}
                        <div className="text-xs text-gray-500 mt-2">
                          {new Date(contract.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
                {column.contracts.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm">No contracts</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <h3 className="font-semibold text-sm mb-2">Getting Started</h3>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          To see contracts in the pipeline, first create a project, then add contracts to it. The
          pipeline view will automatically organize contracts by their status.
        </p>
      </div>
    </div>
  );
}
th pl