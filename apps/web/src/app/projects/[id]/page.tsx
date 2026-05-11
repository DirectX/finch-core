"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collabFetch } from "@/lib/collab-api";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  FolderIcon,
  FileTextIcon,
  PlusIcon,
  ChevronRightIcon,
  HomeIcon,
  SettingsIcon,
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  description: string | null;
  teamId: string;
  createdAt: string;
  updatedAt: string;
}

interface Folder {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

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

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showCreateContract, setShowCreateContract] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newContract, setNewContract] = useState({ title: "", description: "" });

  const { data: project } = useQuery<Project>({
    queryKey: ["project", id],
    queryFn: () => collabFetch(`/projects/${id}`),
    enabled: !!id,
  });

  const { data: folders } = useQuery<Folder[]>({
    queryKey: ["folders", id],
    queryFn: () => collabFetch(`/projects/${id}/folders`),
    enabled: !!id,
  });

  const { data: contracts } = useQuery<Contract[]>({
    queryKey: ["contracts", id, currentFolderId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (currentFolderId) params.set("folderId", currentFolderId);
      return collabFetch(`/projects/${id}/contracts?${params}`);
    },
    enabled: !!id,
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) =>
      collabFetch(`/projects/${id}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: currentFolderId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders", id] });
      setShowCreateFolder(false);
      setNewFolderName("");
    },
  });

  const createContractMutation = useMutation({
    mutationFn: (data: { title: string; description: string }) =>
      collabFetch(`/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          projectId: id,
          folderId: currentFolderId,
          status: "draft",
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts", id, currentFolderId] });
      setShowCreateContract(false);
      setNewContract({ title: "", description: "" });
    },
  });

  const currentFolder = folders?.find((f) => f.id === currentFolderId);
  const childFolders = folders?.filter((f) => f.parentId === currentFolderId) || [];

  const breadcrumbs: Folder[] = [];
  if (currentFolder) {
    let folder: Folder | undefined = currentFolder;
    while (folder) {
      breadcrumbs.unshift(folder);
      folder = folders?.find((f) => f.id === folder!.parentId);
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/projects" className="hover:underline">
              Projects
            </Link>
            <ChevronRightIcon className="w-4 h-4" />
            <span>{project?.name}</span>
          </div>
          <h1 className="text-3xl font-bold">{project?.name}</h1>
          {project?.description && (
            <p className="text-gray-600 dark:text-gray-400 mt-1">{project.description}</p>
          )}
        </div>
        <Link
          href={`/projects/${id}/settings`}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
        >
          <SettingsIcon className="w-5 h-5" />
        </Link>
      </div>

      <div className="flex items-center gap-2 mb-4 text-sm">
        <button
          onClick={() => setCurrentFolderId(null)}
          className="flex items-center gap-1 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
        >
          <HomeIcon className="w-4 h-4" />
          Root
        </button>
        {breadcrumbs.map((folder) => (
          <div key={folder.id} className="flex items-center gap-1">
            <ChevronRightIcon className="w-4 h-4 text-gray-400" />
            <button
              onClick={() => setCurrentFolderId(folder.id)}
              className="px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              {folder.name}
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setShowCreateFolder(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200"
        >
          <PlusIcon className="w-4 h-4" />
          New Folder
        </button>
        <button
          onClick={() => setShowCreateContract(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <PlusIcon className="w-4 h-4" />
          New Contract
        </button>
      </div>

      {showCreateFolder && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h3 className="font-semibold mb-2">Create Folder</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="flex-1 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFolderName) {
                  createFolderMutation.mutate(newFolderName);
                }
              }}
            />
            <button
              onClick={() => newFolderName && createFolderMutation.mutate(newFolderName)}
              disabled={createFolderMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowCreateFolder(false);
                setNewFolderName("");
              }}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showCreateContract && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h3 className="font-semibold mb-2">Create Contract</h3>
          <div className="space-y-2">
            <input
              type="text"
              value={newContract.title}
              onChange={(e) => setNewContract({ ...newContract, title: e.target.value })}
              placeholder="Contract title"
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            />
            <textarea
              value={newContract.description}
              onChange={(e) => setNewContract({ ...newContract, description: e.target.value })}
              placeholder="Description (optional)"
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              rows={2}
            />
            <div className="flex gap-2">
              <button
                onClick={() => newContract.title && createContractMutation.mutate(newContract)}
                disabled={createContractMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowCreateContract(false);
                  setNewContract({ title: "", description: "" });
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {childFolders.map((folder) => (
          <button
            key={folder.id}
            onClick={() => setCurrentFolderId(folder.id)}
            className="w-full flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 text-left"
          >
            <FolderIcon className="w-5 h-5 text-blue-500" />
            <span className="font-medium">{folder.name}</span>
            <span className="text-xs text-gray-500 ml-auto">{folder.path}</span>
          </button>
        ))}

        {contracts?.map((contract) => (
          <Link
            key={contract.id}
            href={`/contracts/${contract.id}`}
            className="block p-3 border rounded-lg hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <div className="flex items-start gap-3">
              <FileTextIcon className="w-5 h-5 text-gray-500 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate">{contract.title}</h3>
                {contract.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
                    {contract.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                    {contract.status}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(contract.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}

        {childFolders.length === 0 && contracts?.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <FolderIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>This folder is empty. Create a folder or contract to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
