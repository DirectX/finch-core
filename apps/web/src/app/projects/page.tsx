"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collabFetch } from "@/lib/collab-api";
import Link from "next/link";
import { useState } from "react";
import { FolderIcon, PlusIcon, UsersIcon } from "lucide-react";

interface Project {
  id: string;
  name: string;
  description: string | null;
  teamId: string;
  createdAt: string;
  updatedAt: string;
  role?: string;
}

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", description: "", teamId: "" });

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => collabFetch("/projects"),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string; teamId: string }) =>
      collabFetch("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setShowCreateForm(false);
      setNewProject({ name: "", description: "", teamId: "" });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newProject.name && newProject.teamId) {
      createMutation.mutate(newProject);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-gray-500">Loading projects...</div>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Projects</h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <PlusIcon className="w-4 h-4" />
          New Project
        </button>
      </div>

      {showCreateForm && (
        <form onSubmit={handleCreate} className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h2 className="text-lg font-semibold mb-4">Create New Project</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Project Name</label>
              <input
                type="text"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={newProject.description}
                onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Team ID</label>
              <input
                type="text"
                value={newProject.teamId}
                onChange={(e) => setNewProject({ ...newProject, teamId: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                placeholder="UUID of the team"
                required
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? "Creating..." : "Create Project"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects?.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="block p-6 border rounded-lg hover:shadow-lg transition-shadow dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <FolderIcon className="w-6 h-6 text-blue-600 dark:text-blue-300" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg mb-1 truncate">{project.name}</h3>
                {project.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
                    {project.description}
                  </p>
                )}
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {project.role && (
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                      {project.role}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <UsersIcon className="w-3 h-3" />
                    Team
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {projects?.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <FolderIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No projects yet. Create your first project to get started.</p>
        </div>
      )}
    </div>
  );
}
