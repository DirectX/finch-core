"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, ThumbsUp, ThumbsDown, X, Send } from "lucide-react";
import { collabFetch, getAuthToken } from "@/lib/collab-api";

interface ClauseReviewProps {
  clauseId: string;
}

interface Comment {
  id: string;
  commentText: string;
  createdAt: string;
  userId: string;
}

interface Review {
  id: string;
  status: "pending" | "approved" | "rejected";
  reason?: string;
  createdAt: string;
  userId: string;
}

export function ClauseReview({ clauseId }: ClauseReviewProps) {
  const [commentText, setCommentText] = useState("");
  const [showComments, setShowComments] = useState(false);
  const queryClient = useQueryClient();

  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ["clause-comments", clauseId],
    queryFn: () => collabFetch<Comment[]>(`/clauses/${clauseId}/comments`),
    enabled: !!clauseId,
  });

  const { data: reviews = [] } = useQuery<Review[]>({
    queryKey: ["clause-reviews", clauseId],
    queryFn: () => collabFetch<Review[]>(`/clauses/${clauseId}/reviews`),
    enabled: !!clauseId,
  });

  const addCommentMutation = useMutation({
    mutationFn: (text: string) =>
      collabFetch(`/clauses/${clauseId}/comments`, {
        method: "POST",
        body: JSON.stringify({ commentText: text }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clause-comments", clauseId] });
      setCommentText("");
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

  const reviewMutation = useMutation({
    mutationFn: ({ status, reason }: { status: "approved" | "rejected"; reason?: string }) =>
      collabFetch(`/clauses/${clauseId}/reviews`, {
        method: "POST",
        body: JSON.stringify({ status, reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clause-reviews", clauseId] });
    },
  });

  const handleAddComment = () => {
    if (commentText.trim()) {
      addCommentMutation.mutate(commentText);
    }
  };

  const approvedCount = reviews.filter((r) => r.status === "approved").length;
  const rejectedCount = reviews.filter((r) => r.status === "rejected").length;

  return (
    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={() => reviewMutation.mutate({ status: "approved" })}
        className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-green-50 dark:hover:bg-green-900/20 text-green-700 dark:text-green-400"
        title="Approve clause"
      >
        <ThumbsUp className="w-3.5 h-3.5" />
        {approvedCount > 0 && <span>{approvedCount}</span>}
      </button>

      <button
        onClick={() => reviewMutation.mutate({ status: "rejected" })}
        className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-700 dark:text-red-400"
        title="Reject clause"
      >
        <ThumbsDown className="w-3.5 h-3.5" />
        {rejectedCount > 0 && <span>{rejectedCount}</span>}
      </button>

      <button
        onClick={() => setShowComments(!showComments)}
        className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-700 dark:text-blue-400"
        title="Comments"
      >
        <MessageSquare className="w-3.5 h-3.5" />
        {comments.length > 0 && <span>{comments.length}</span>}
      </button>

      {showComments && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowComments(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h3 className="font-semibold">Comments & Reviews</h3>
              <button onClick={() => setShowComments(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
              {reviews.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Reviews</h4>
                  {reviews.map((review) => (
                    <div key={review.id} className="flex items-start gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800">
                      {review.status === "approved" ? (
                        <ThumbsUp className="w-4 h-4 text-green-600 mt-0.5" />
                      ) : (
                        <ThumbsDown className="w-4 h-4 text-red-600 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-medium capitalize">{review.status}</div>
                        {review.reason && <div className="text-sm text-gray-600 dark:text-gray-400">{review.reason}</div>}
                        <div className="text-xs text-gray-500 mt-1">{new Date(review.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {comments.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Comments</h4>
                  {comments.map((comment) => (
                    <div key={comment.id} className="flex items-start gap-2 p-2 rounded bg-gray-50 dark:bg-gray-800">
                      <MessageSquare className="w-4 h-4 text-blue-600 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-sm">{comment.commentText}</div>
                        <div className="text-xs text-gray-500 mt-1">{new Date(comment.createdAt).toLocaleString()}</div>
                      </div>
                      <button
                        onClick={() => deleteCommentMutation.mutate(comment.id)}
                        className="text-gray-400 hover:text-red-600"
                        title="Delete comment"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {comments.length === 0 && reviews.length === 0 && (
                <div className="text-center text-gray-500 py-8">No comments or reviews yet</div>
              )}
            </div>

            <div className="p-4 border-t dark:border-gray-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                  placeholder="Add a comment..."
                  className="flex-1 px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleAddComment}
                  disabled={!commentText.trim() || addCommentMutation.isPending}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {addCommentMutation.isPending ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
