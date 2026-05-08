import { z } from "zod"

export const ClauseDiffKindSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("Added") }),
  z.object({ kind: z.literal("Removed") }),
  z.object({ kind: z.literal("Unchanged") }),
  z.object({
    kind: z.literal("Modified"),
    similarity: z.number(),
    text_before: z.string(),
    text_after: z.string(),
  }),
])
export type ClauseDiffKind = z.infer<typeof ClauseDiffKindSchema>

export const ClauseDiffSchema = z.object({
  clause_id: z.string().uuid(),
  title: z.string(),
  kind: ClauseDiffKindSchema,
})
export type ClauseDiff = z.infer<typeof ClauseDiffSchema>

export const VersionDiffSchema = z.object({
  from_version_id: z.string().uuid(),
  to_version_id: z.string().uuid(),
  diffs: z.array(ClauseDiffSchema),
  added_count: z.number().int(),
  removed_count: z.number().int(),
  modified_count: z.number().int(),
  unchanged_count: z.number().int(),
})
export type VersionDiff = z.infer<typeof VersionDiffSchema>
