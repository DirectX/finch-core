"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collabFetch } from "@/lib/collab-api";
import { useState } from "react";
import { MessageCircleIcon, SendIcon, TrashIcon, UserIcon } from "lucide-react";

interface Comment {
  id: string;
  content: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

interface DiscussionProps {
  clauseId: string;
  title?: string;
}

export function Discussion({ clauseId, title = "Discussion" }: DiscussionProps) {
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ["clause-comments", clauseId],
    queryFn: () => collabFetch(`/clauses/${clauseId}/comments`),
    enabled: isExpanded,
  });

  const addCommentMutation = useMutation({
    mutationFn: (content: string) =>
      collabFetch(`/clauses/${clauseId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clause-comments", clauseId] });
      setNewComment("");
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) =>
      collabFetch(`/clauses/${clauseId}/comments/${commentId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clause-comments", clauseId] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim()) {
      addCommentMutation.mutate(newComment);
    }
  };

  return (
    <div className="border rounded-lg dark:border-gray-700">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        <div className="flex items-center gap-2">
          <MessageCircleIcon className="w-5 h-5 text-gray-500" />
          <h3 className="font-semibold">{title}</h3>
          {comments.length > 0 && (
            <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
              {comments.length}
            </span>
          )}
        </div>
        <span className="text-sm text-gray-500">{isExpanded ? "Hide" : "Show"}</span>
      </button>

      {isExpanded && (
        <div className="border-t p-4 dark:border-gray-700">
          <div className="space-y-4 mb-4 max-h-96 overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No comments yet. Start the discussion!
              </p>
            ) : (
              comments.map((comment) => (
                <div
                  key={comment.id}
                  className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="p-2 bg-gray-200 dark:bg-gray-700 rounded-full h-fit">
                    <UserIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm">{comment.content}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(comment.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteCommentMutation.mutate(comment.id)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                        title="Delete comment"
                      >
                        <TrashIcon className="w-3 h-3 text-gray-500" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600 text-sm"
            />
            <button
              type="submit"
              disabled={!newComment.trim() || addCommentMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <SendIcon className="w-4 h-4" />
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
