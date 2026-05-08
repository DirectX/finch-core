import { createClient } from "@finch/sdk";

export const apiClient = createClient(
  typeof window !== "undefined"
    ? "/api"
    : (process.env.API_BASE_URL ?? "http://localhost:3000")
);