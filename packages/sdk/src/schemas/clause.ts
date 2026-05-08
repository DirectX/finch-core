import { z } from "zod"

export const ClauseRole = z.enum(["Obligation", "Right", "Condition", "Prohibition"])
export type ClauseRole = z.infer<typeof ClauseRole>

export const ClauseDomain = z.enum([
  "Payment",
  "Liability",
  "Termination",
  "Confidentiality",
  "Definition",
])
export type ClauseDomain = z.infer<typeof ClauseDomain>

export type Clause = {
  id: string
  content_hash: string
  role: ClauseRole | null
  domain: ClauseDomain | null
  primary_role: ClauseRole | null
  aggregated_roles: ClauseRole[]
  aggregated_domains: ClauseDomain[]
  tags: string[]
  level: number
  title: string
  number: string[] | null
  children: Clause[]
}

export const ClauseSchema: z.ZodType<Clause> = z.lazy(() =>
  z.object({
    id: z.string().uuid(),
    content_hash: z.string(),
    role: ClauseRole.nullable(),
    domain: ClauseDomain.nullable(),
    primary_role: ClauseRole.nullable(),
    aggregated_roles: z.array(ClauseRole),
    aggregated_domains: z.array(ClauseDomain),
    tags: z.array(z.string()),
    level: z.number().int(),
    title: z.string(),
    number: z.array(z.string()).nullable(),
    children: z.array(ClauseSchema),
  })
)

export const FlatClauseEntrySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  level: z.number().int(),
  role: z.string().nullable(),
  domain: z.string().nullable(),
  primary_role: z.string().nullable(),
  tags: z.array(z.string()),
  content_hash: z.string(),
  number: z.array(z.string()).nullable(),
})
export type FlatClauseEntry = z.infer<typeof FlatClauseEntrySchema>
