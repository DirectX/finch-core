"use client";

import { useQuery } from "@tanstack/react-query";
import { collabFetch } from "@/lib/collab-api";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { Discussion } from "@/components/Discussion";

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

interface Clause {
  id: string;
  documentVersionId: string;
  contentHash: string;
  title: string | null;
  createdAt: string;
}

export default function ContractDiscussionsPage() {
  const { id } = useParams<{ id: string }>();

  const { data: contract } = useQuery<Contract>({
    queryKey: ["contract", id],
    queryFn: () => collabFetch(`/contracts/${id}`),
    enabled: !!id,
  });

  const { data: clauses = [] } = useQuery<Clause[]>({
    queryKey: ["contract-clauses", id],
    queryFn: () => collabFetch(`/contracts/${id}/clauses`),
    enabled: !!id,
  });

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
        <Link href="/projects" className="hover:underline">
          Projects
        </Link>
        <ChevronRightIcon className="w-4 h-4" />
        <Link href={`/projects/${contract?.projectId}`} className="hover:underline">
          Project
        </Link>
        <ChevronRightIcon className="w-4 h-4" />
        <Link href={`/contracts/${id}`} className="hover:underline">
          Contract
        </Link>
        <ChevronRightIcon className="w-4 h-4" />
        <span>Discussions</span>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Discussions</h1>
        <p className="text-gray-600 dark:text-gray-400">{contract?.title}</p>
      </div>

      <div className="space-y-4">
        {clauses.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No clauses found for this contract.</p>
            <p className="text-sm mt-2">
              Upload a document version to start discussing clauses.
            </p>
          </div>
        ) : (
          clauses.map((clause, index) => (
            <Discussion
              key={clause.id}
              clauseId={clause.id}
              title={clause.title || `Clause ${index + 1}`}
            />
          ))
        )}
      </div>
    </div>
  );
}
