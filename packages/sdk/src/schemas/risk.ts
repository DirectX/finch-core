import { z } from "zod"

export const ClauseRiskEntrySchema = z.object({
  clause_id: z.string().uuid(),
  title: z.string(),
  risk_score: z.number().int().min(1).max(5),
  risk_reason: z.string(),
  domain: z.string().nullable(),
  role: z.string().nullable(),
})
export type ClauseRiskEntry = z.infer<typeof ClauseRiskEntrySchema>

export const RiskReportSchema = z.object({
  document_version_id: z.string().uuid(),
  total_clauses: z.number().int(),
  classified_clauses: z.number().int(),
  risk_distribution: z.record(z.string(), z.number().int()),
  high_risk_clauses: z.array(ClauseRiskEntrySchema),
})
export type RiskReport = z.infer<typeof RiskReportSchema>
