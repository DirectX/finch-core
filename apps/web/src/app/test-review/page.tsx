"use client";

import { ClauseReview } from "@/components/ClauseReview";
import { AuthForm } from "@/components/AuthForm";
import { useState, useEffect } from "react";
import { getAuthToken } from "@/lib/collab-api";

export default function TestReviewPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuthToken().then((token) => {
      setIsAuthenticated(!!token);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-4">Clause Review Demo</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Please login or sign up to test the clause review features.
        </p>
        <AuthForm />
      </div>
    );
  }

  const testClauseId = "550e8400-e29b-41d4-a716-446655440000";

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Clause Review Component Demo</h1>
      
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Sample Clause</h2>
          <div className="group">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">1.1 Payment Terms</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  The Client shall pay the Contractor within 30 days of receipt of invoice.
                  Payment shall be made in full without any deduction or set-off.
                </p>
              </div>
              <ClauseReview clauseId={testClauseId} />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Another Sample Clause</h2>
          <div className="group">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">2.1 Confidentiality</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Each party shall keep confidential all information received from the other party
                  and shall not disclose such information to any third party without prior written consent.
                </p>
              </div>
              <ClauseReview clauseId="550e8400-e29b-41d4-a716-446655440001" />
            </div>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">How to use:</h3>
          <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
            <li>• Hover over a clause to see the review buttons</li>
            <li>• Click thumbs up to approve or thumbs down to reject</li>
            <li>• Click the comment icon to view and add comments</li>
            <li>• Comments and reviews are stored in the collaboration database</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
