import { create } from "zustand";
import { type SseEvent } from "@finch/sdk";

export type ClassificationStatus = "idle" | "streaming" | "done" | "error";

interface ClassificationState {
  status: ClassificationStatus;
  versionId: string | null;
  events: SseEvent[];
  error: string | null;
  start: () => void;
  pushEvent: (event: SseEvent) => void;
  finish: () => void;
  setError: (msg: string) => void;
  reset: () => void;
}

export const useClassificationStore = create<ClassificationState>((set) => ({
  status: "idle",
  versionId: null,
  events: [],
  error: null,
  start: () => set({ status: "streaming", events: [], error: null }),
  pushEvent: (event) =>
    set((s) => ({
      events: [...s.events, event],
      versionId:
        event.type === "version" ? event.data.id : s.versionId,
    })),
  finish: () => set({ status: "done" }),
  setError: (msg) => set({ status: "error", error: msg }),
  reset: () =>
    set({ status: "idle", versionId: null, events: [], error: null }),
}));
