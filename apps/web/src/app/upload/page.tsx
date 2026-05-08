"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { parseSseEvent } from "@finch/sdk";
import { useClassificationStore } from "@/lib/store";

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { status, events, error, versionId, start, pushEvent, finish, setError, reset } =
    useClassificationStore();

  const handleFile = useCallback((file: File) => {
    setSelectedFile(file);
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
  }, [title]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedFile) return;
      reset();
      start();

      const es = apiClient.uploadDocument(selectedFile, {
        title: title || undefined,
        author: author || undefined,
      });

      es.onmessage = (ev: MessageEvent) => {
        const parsed = parseSseEvent(ev.type, ev.data);
        if (!parsed) return;
        pushEvent(parsed);
        if (parsed.type === "done") {
          finish();
          es.close();
        }
        if (parsed.type === "error") {
          setError(typeof parsed.data === "string" ? parsed.data : "Unknown error");
          es.close();
        }
      };

      (es as unknown as { onerror: ((e: Event) => void) | null }).onerror = () => {
        setError("Connection error");
      };
    },
    [selectedFile, title, author, reset, start, pushEvent, finish, setError]
  );

  const classificationEvents = events.filter((e) => e.type === "classification");
  const versionEvent = events.find((e) => e.type === "version");

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Upload Document</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            dragging
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
              : "border-gray-300 dark:border-gray-700 hover:border-blue-400"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.docx,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          {selectedFile ? (
            <div>
              <div className="text-lg font-medium">{selectedFile.name}</div>
              <div className="text-sm text-gray-500 mt-1">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </div>
            </div>
          ) : (
            <div className="text-gray-500">
              Drag & drop a <strong>.md</strong>, <strong>.docx</strong>, or{" "}
              <strong>.txt</strong> file here, or click to browse
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
              className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Author</label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Your name"
              className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!selectedFile || status === "streaming"}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "streaming" ? "Processing…" : "Upload & Classify"}
        </button>
      </form>

      {status !== "idle" && (
        <div className="mt-6 space-y-3">
          {versionEvent && versionEvent.type === "version" && (
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-sm">
              Version created:{" "}
              <span className="font-mono text-xs">{versionEvent.data.id}</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-sm text-red-700">
              {error}
            </div>
          )}

          {classificationEvents.length > 0 && (
            <div className="space-y-1">
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Classified {classificationEvents.length} clause
                {classificationEvents.length !== 1 ? "s" : ""}
                {status === "streaming" && "…"}
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {classificationEvents.map((ev) => {
                  if (ev.type !== "classification") return null;
                  const { result } = ev.data;
                  return (
                    <div
                      key={ev.data.clause_id}
                      className="flex items-center gap-2 text-xs p-2 rounded bg-gray-50 dark:bg-gray-800"
                    >
                      <span className="font-mono text-gray-400">
                        {ev.data.clause_id.slice(0, 8)}
                      </span>
                      <span className="text-gray-700 dark:text-gray-300">
                        {result.role ?? "—"}
                      </span>
                      <span className="text-gray-500">{result.domain ?? "—"}</span>
                      <span className={`ml-auto font-medium ${riskColor(result.risk_score)}`}>
                        Risk {result.risk_score}/5
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {status === "done" && versionId && (
            <button
              onClick={() => router.push(`/documents/${versionId}`)}
              className="w-full py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 text-sm"
            >
              View Document →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function riskColor(score: number) {
  if (score <= 2) return "text-green-600";
  if (score === 3) return "text-yellow-600";
  return "text-red-600";
}
