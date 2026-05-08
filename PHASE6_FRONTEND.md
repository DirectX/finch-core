# Phase 6 — Next.js Frontend

**Goal:** Add a web UI for uploading documents, browsing clause trees, reviewing diffs, and monitoring risk — wired to the Phase 5 axum API via a fully typed SDK package.

---

## Monorepo Structure

Move the current repo root into `core/` and add `apps/` and `packages/` alongside it.

**Tooling: Turborepo + pnpm workspaces.** Turborepo is the natural fit for a Next.js-heavy monorepo: first-class App Router build cache, polyglot-friendly (the Rust crate is a plain sub-directory), and minimal config overhead. `pnpm` provides strict hoisting and disk-efficient node_modules.

```
finch/                              ← repo root (rename from finch-core)
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
│
├── core/                           ← Rust crate (moved here)
│   ├── Cargo.toml
│   ├── src/
│   └── ...
│
├── apps/
│   └── web/                        ← Next.js 15 (App Router)
│       ├── package.json
│       ├── next.config.ts
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx                     (dashboard / project list)
│       │   ├── projects/[id]/
│       │   │   ├── page.tsx                (document + clause tree)
│       │   │   ├── diff/[other]/page.tsx   (side-by-side diff view)
│       │   │   └── risk/page.tsx           (risk report)
│       │   └── upload/page.tsx             (drag-and-drop uploader)
│       ├── components/
│       │   ├── clause-tree/
│       │   ├── diff-view/
│       │   ├── risk-badge/
│       │   └── upload-zone/
│       └── lib/
│           ├── api-client.ts
│           └── sse.ts
│
└── packages/
    └── sdk/                        ← shared Zod schemas + typed client
        ├── package.json
        ├── schemas/
        │   ├── clause.ts
        │   ├── version.ts
        │   ├── diff.ts
        │   ├── risk.ts
        │   └── index.ts
        ├── client.ts               ← typed fetch wrapper
        └── sse.ts                  ← typed SSE event parser
```

---

## Technology Choices

| Layer | Choice | Reason |
|---|---|---|
| Monorepo orchestration | **Turborepo** | Native Next.js cache, polyglot-friendly, minimal config |
| Package manager | **pnpm** | Disk-efficient, strict hoisting, required by Turborepo docs |
| Frontend framework | **Next.js 15** (App Router) | Server components for initial clause tree render; streaming for SSE |
| Component library | **shadcn/ui** | Unstyled Radix primitives + Tailwind; copy-paste, no bundle overhead |
| Styling | **Tailwind CSS v4** | Co-exists naturally with shadcn |
| Schema validation | **Zod** | Type-inferred at the boundary; schemas live in `packages/sdk` |
| Data fetching | **TanStack Query v5** | Caching, background refresh, optimistic PATCH updates |
| SSE consumption | Custom hook over `EventSource` + **Zustand** | Streams classification results into a per-clause store slice |
| Global state | **Zustand** | Lightweight; SSE updates land in a `classificationSlice` keyed by `clause_id` |
| Diff display | **react-diff-viewer-continued** | Word-level diffs using `text_before` / `text_after` from `VersionDiff` |
| Charts | **Recharts** | Risk distribution bar chart (already in shadcn ecosystem) |

---

## Zod Schema Strategy

The schemas in `packages/sdk/schemas/` are the **single source of truth** for every API contract — mirroring Rust structs exactly. `schema.parse()` is called on every API response; if the Rust side changes shape, a compile-time type error surfaces immediately in the frontend.

### `schemas/clause.ts`

```ts
import { z } from "zod"

export const ClauseRole = z.enum(["Obligation", "Right", "Condition", "Prohibition"])
export const ClauseDomain = z.enum([
  "Payment", "Liability", "Termination", "Confidentiality", "Definition"
])

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
export type Clause = z.infer<typeof ClauseSchema>
```

### `schemas/version.ts`

```ts
export const NegotiationState = z.enum([
  "Draft", "UnderReview", "Negotiating", "Agreed", "Rejected", "Superseded"
])

export const DocumentVersionSchema = z.object({
  id: z.string().uuid(),
  document_id: z.string().uuid(),
  version_number: z.number().int(),
  parent_ids: z.array(z.string().uuid()),
  state: NegotiationState,
  author: z.string(),
  message: z.string(),
  created_at: z.string().datetime(),
  clauses: z.array(ClauseSchema),
})
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>
```

### `schemas/diff.ts`

```ts
export const ClauseDiffKind = z.discriminatedUnion("kind", [
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

export const VersionDiffSchema = z.object({
  from_version_id: z.string().uuid(),
  to_version_id: z.string().uuid(),
  diffs: z.array(z.object({
    clause_id: z.string().uuid(),
    title: z.string(),
    kind: ClauseDiffKind,
  })),
  added_count: z.number().int(),
  removed_count: z.number().int(),
  modified_count: z.number().int(),
  unchanged_count: z.number().int(),
})
```

### `schemas/risk.ts`

```ts
export const RiskReportSchema = z.object({
  document_version_id: z.string().uuid(),
  total_clauses: z.number().int(),
  classified_clauses: z.number().int(),
  risk_distribution: z.record(z.string(), z.number().int()),
  high_risk_clauses: z.array(z.object({
    clause_id: z.string().uuid(),
    title: z.string(),
    risk_score: z.number().int().min(1).max(5),
    risk_reason: z.string(),
    domain: z.string().nullable(),
    role: z.string().nullable(),
  })),
})
```

### `sse.ts` — typed SSE event union

```ts
export const ClassificationResultSchema = z.object({
  role: ClauseRole.nullable(),
  domain: ClauseDomain.nullable(),
  tags: z.array(z.string()),
  risk_score: z.number().int().min(1).max(5),
  risk_reason: z.string(),
  parties: z.array(z.string()),
  entities: z.object({
    dates: z.array(z.string()),
    amounts: z.array(z.string()),
    governing_law: z.array(z.string()),
  }),
  summary: z.string().nullable(),
})

export const SseEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("version"),        data: DocumentVersionSchema }),
  z.object({ type: z.literal("classification"), data: z.object({
    clause_id: z.string().uuid(),
    result: ClassificationResultSchema,
  })}),
  z.object({ type: z.literal("done"),  data: z.object({}) }),
  z.object({ type: z.literal("error"), data: z.string() }),
])
export type SseEvent = z.infer<typeof SseEventSchema>
```

---

## Frontend Pages

### Upload (`/upload`)

- `<UploadZone>` — drag-and-drop or file picker; accepts `.md`, `.docx`, `.txt`
- On submit: streams `POST /documents` (multipart)
- Immediately renders the clause tree from the first `version` SSE event
- Per-clause "Classifying…" spinner; replaced by role/domain/risk badges as `classification` SSE events arrive (Zustand `classificationSlice` keyed by `clause_id`)
- On `done` event: persist final state to TanStack Query cache and redirect to `/projects/[id]`

### Dashboard (`/`)

- Table of all versions from `GET /documents` (new list endpoint — see API gap below)
- Columns: title, negotiation state badge, version number, author, date, top risk score
- Clicking a row opens the document view

### Document View (`/projects/[id]`)

- Left panel: collapsible clause tree with role/domain/risk colour badges
- Right panel: clause detail — full text, tags, entity extractions, one-line summary
- Inline PATCH — click a clause title to edit in-place; saves optimistically via TanStack Query mutation, creates a new version
- Header: negotiation state stepper (Draft → UnderReview → …), "Compare to…" version picker
- "Export PDF" / "Export DOCX" buttons trigger the render endpoints and download via a blob URL

### Diff View (`/projects/[id]/diff/[other]`)

- Two-column layout: version A on left, version B on right
- Clauses coloured by diff kind: green (Added), red (Removed), amber (Modified), grey (Unchanged)
- Modified clauses expand to show `react-diff-viewer-continued` word diff from `text_before` / `text_after`
- Jaccard similarity shown as a small ring progress indicator per modified clause

### Risk Report (`/projects/[id]/risk`)

- Summary cards: total clauses, classified %, high-risk count
- Recharts bar chart of risk distribution (score 1–5)
- Table of flagged clauses sorted by `risk_score` descending, with `risk_reason`, domain badge, and a link back to the clause in the document view

---

## API Gap: List Endpoint

The current API has no `GET /documents` to power the dashboard. One endpoint needs to be added to `core/src/api.rs`:

```
GET /documents   →   Vec<DocumentVersionSummary>
```

`DocumentVersionSummary` is a lightweight projection — no clause trees — queried directly from the `document_versions` SQLite table:

```json
{
  "id": "uuid",
  "document_id": "uuid",
  "version_number": 1,
  "state": "Draft",
  "author": "alice",
  "message": "Uploaded: NDA.docx",
  "created_at": "2026-05-08T12:00:00Z"
}
```

---

## Turborepo Pipeline (`turbo.json`)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint":      {},
    "dev":       { "persistent": true, "cache": false }
  }
}
```

---

## Development Workflow

```bash
# Start Rust API
cargo run --manifest-path core/Cargo.toml

# Start web dev server
pnpm --filter web dev

# Full build (all packages)
pnpm turbo build

# Type-check all TS packages
pnpm turbo typecheck

# Rust tests only
cargo test --manifest-path core/Cargo.toml
```

`apps/web/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3000
```

In production, Next.js rewrites `/api/*` to the Rust backend so both are served from a single origin with no CORS config needed.

---

## Migration Steps (ordered)

1. `git mv` everything in the current repo root into `core/`; update any relative paths in `Cargo.toml`
2. Create `pnpm-workspace.yaml` and root `package.json` at the new repo root
3. Add `turbo.json` with the pipeline above
4. Scaffold `packages/sdk`: copy all Zod schemas, build the typed client (`client.ts`) and SSE parser (`sse.ts`)
5. Scaffold `apps/web` via `pnpm create next-app` — App Router, TypeScript, Tailwind; add `@finch/sdk` workspace dep
6. Add `GET /documents` list endpoint to `core/src/api.rs`
7. Implement pages in order: Upload → Document View → Diff View → Risk Report → Dashboard
8. Wire SSE classification stream into Zustand; update clause badges in real time as events arrive
