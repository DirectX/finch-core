"use client";

import { useState, useEffect } from "react";
import { FileTextIcon } from "lucide-react";

interface TypstPreviewProps {
  content: string;
  title?: string;
}

export function TypstPreview({ content, title }: TypstPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(false);
  }, [content]);

  return (
    <div className="border rounded-lg dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 mb-4">
        <FileTextIcon className="w-5 h-5 text-gray-500" />
        <h3 className="font-semibold">{title || "Typst Preview"}</h3>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded border dark:border-gray-700 p-6 min-h-[400px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Loading preview...
          </div>
        ) : error ? (
          <div className="text-red-600 bg-red-50 dark:bg-red-900/20 rounded p-4">
            Error: {error}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-4">
              <h4 className="font-semibold text-sm mb-2">Typst WASM Integration - TODO</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                This component is a placeholder for Typst WASM integration. To complete this feature:
              </p>
              <ol className="text-sm text-gray-700 dark:text-gray-300 list-decimal list-inside space-y-1">
                <li>Initialize the @brief-jetzt/wasm-typst module</li>
                <li>Set up font loading and resource management</li>
                <li>Compile Typst content to SVG or PDF</li>
                <li>Render the output in this preview area</li>
                <li>Add error handling and incremental compilation</li>
              </ol>
            </div>

            <div className="border dark:border-gray-700 rounded p-4">
              <h4 className="font-semibold text-sm mb-2">Content Preview (Raw)</h4>
              <pre className="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded overflow-auto max-h-64">
                {content || "No content to preview"}
              </pre>
            </div>

            <div className="text-xs text-gray-500">
              <p>
                <strong>Note:</strong> The Rust backend already has Typst rendering capabilities.
                This component would enable client-side preview without server round-trips.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
