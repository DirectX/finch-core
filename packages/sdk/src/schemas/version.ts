import { z } from "zod"
import { ClauseSchema } from "./clause"

export const NegotiationState = z.enum([
  "Draft",
  "UnderReview",
  "Negotiating",
  "Agreed",
  "Rejected",
  "Superseded",
])
export type NegotiationState = z.infer<typeof NegotiationState>

export const DocumentVersionSchema = z.object({
  id: z.string().uuid(),
  document_id: z.string().uuid(),
  version_number: z.number().int(),
  parent_ids: z.array(z.string().uuid()),
  state: NegotiationState,
  author: z.string(),
  message: z.string(),
  created_at: z.string().datetime({ offset: true }),
  clauses: z.array(ClauseSchema),
})
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>

export const DocumentVersionSummarySchema = z.object({
  id: z.string().uuid(),
  document_id: z.string().uuid(),
  version_number: z.number().int(),
  state: NegotiationState,
  author: z.string(),
  message: z.string(),
  created_at: z.string().datetime({ offset: true }),
})
export type DocumentVersionSummary = z.infer<typeof DocumentVersionSummarySchema>
