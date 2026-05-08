import { z } from "zod"
import { ClauseRole, ClauseDomain } from "./schemas/clause"
import { DocumentVersionSchema } from "./schemas/version"

export const ClauseEntitiesSchema = z.object({
  dates: z.array(z.string()),
  amounts: z.array(z.string()),
  governing_law: z.array(z.string()),
})

export const ClassificationResultSchema = z.object({
  role: ClauseRole.nullable(),
  domain: ClauseDomain.nullable(),
  tags: z.array(z.string()),
  risk_score: z.number().int().min(1).max(5),
  risk_reason: z.string(),
  parties: z.array(z.string()),
  entities: ClauseEntitiesSchema,
  summary: z.string().nullable(),
})
export type ClassificationResult = z.infer<typeof ClassificationResultSchema>

export const SseEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("version"), data: DocumentVersionSchema }),
  z.object({
    type: z.literal("classification"),
    data: z.object({
      clause_id: z.string().uuid(),
      result: ClassificationResultSchema,
    }),
  }),
  z.object({ type: z.literal("done"), data: z.object({}) }),
  z.object({ type: z.literal("error"), data: z.string() }),
])
export type SseEvent = z.infer<typeof SseEventSchema>

export function parseSseEvent(eventType: string, rawData: string): SseEvent | null {
  try {
    const data = eventType === "error" ? rawData : JSON.parse(rawData)
    return SseEventSchema.parse({ type: eventType, data })
  } catch {
    return null
  }
}
