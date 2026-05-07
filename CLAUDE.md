
## Project Objective

Build a full-functional legal document analysis engine focused on:
- Clause-level parsing, semantic classification, and editing
- Clause-tree versioning with negotiation state tracking
- Output rendering as PDF via Typst and DOCX with tracked-changes (redlines) for legal review workflows

---

## Current State Analysis

### What Exists

`finch-core` is a Rust crate using `pandoc` + `pandoc_ast` as the document ingestion backbone.

**`clause_parser.rs`** implements:
- `Clause` — the core data structure: heading level, title, extracted number, role, domain, aggregated role/domain sets from subtree, tags, raw `pandoc_ast::Block` content, and recursive children
- `ClauseRole` — `Obligation | Right | Condition | Prohibition`
- `ClauseDomain` — `Payment | Liability | Termination | Confidentiality | Definition`
- `build_clauses(blocks)` — stack-based tree builder that folds pandoc `Block::Header` nodes into a nested `Clause` hierarchy
- `extract_number(title)` — regex-based extractor for numbering patterns: `1.`, `1.2.3`, `1)`, `a)`, `A.`
- `inline_to_text(inlines)` — lossless text extraction from pandoc inline stream
- `detect_clause_type(text)` — keyword classifier (partially commented out, only `shall not` → `Prohibition` and `pay/payment` → `Payment` active)
- `aggregate(clause)` — recursive bottom-up roll-up of roles and domains from children

### Known Issues and Gaps

1. **Para nodes are pushed to `root` instead of the active clause** (`clause_parser.rs:219`). Paragraph content under a heading should attach to `stack.last_mut()`, not be promoted to root — this breaks the tree for any document with body text.

2. **`detect_clause_type` is mostly dead code.** The full keyword matrix is commented out. Role detection only fires on two patterns; the rest are unreachable.

3. **`primary_role` is never assigned.** The field exists on `Clause` but no logic sets it — the aggregation pass should compute it (e.g., majority role, or highest-priority role in the subtree).

4. **No clause identity/hash.** There is no stable ID per clause (content hash or UUID), making versioning and diff impossible.

5. **No input format beyond Markdown.** Pandoc supports DOCX, PDF (via pdftotext), ODT, etc. — none are wired up.

6. **No serialization.** `Clause` derives `Debug` but has no `serde` support, making persistence and API transport impossible.

7. **Mixed-language comments** (Russian inline comments in `aggregate`) — should be normalized.

---

## Architecture Vision

```
┌──────────────────────────────────────────────────────┐
│                    finch-core (Rust)                  │
│                                                        │
│  ┌─────────────┐   ┌──────────────┐  ┌─────────────┐ │
│  │  Ingestion  │→  │ Clause Tree  │→ │  LLM Layer  │ │
│  │  (pandoc)   │   │  (AST→IR)    │  │ (classify)  │ │
│  └─────────────┘   └──────────────┘  └─────────────┘ │
│                           │                           │
│              ┌────────────┴────────────┐              │
│              ▼                         ▼              │
│     ┌────────────────┐      ┌──────────────────┐     │
│     │  Version Store │      │  Render Engine   │     │
│     │ (clause diffs) │      │ Typst / DOCX+RTC │     │
│     └────────────────┘      └──────────────────┘     │
│              │                                        │
│     ┌────────▼────────┐                               │
│     │   REST / gRPC   │                               │
│     │      API        │                               │
│     └─────────────────┘                               │
└──────────────────────────────────────────────────────┘
```

---

## MVP Scope — Phased Plan

---

### Phase 1 — Solid Clause IR (Foundation)

**Goal:** A correct, serializable, stable clause tree that can represent any real contract.

#### 1.1 Fix `build_clauses` paragraph attachment

`Para` blocks should be appended to `stack.last_mut().content` when a heading is active, not pushed to root. The current behavior discards all body text from its parent clause.

#### 1.2 Clause Identity

Add `id: Uuid` (content-addressed or random-assigned on parse) and `content_hash: [u8; 32]` (SHA-256 of the normalized text of the clause body). This is the prerequisite for diffing and versioning.

```rust
pub struct Clause {
    pub id: Uuid,
    pub content_hash: [u8; 32],
    // ... existing fields
}
```

#### 1.3 Serialization

Add `serde` + `serde_json` derives to `Clause`, `ClauseRole`, `ClauseDomain`. This enables persistence, API transport, and snapshot storage.

#### 1.4 Finalize keyword classifier

Restore and complete `detect_clause_type`:
- Role: `shall not` → Prohibition, `shall` / `must` → Obligation, `may` → Right, `if` / `provided that` → Condition
- Domain: `pay` / `invoice` → Payment, `liable` / `damages` / `indemnif` → Liability, `terminat` / `expir` → Termination, `confidential` / `disclose` → Confidentiality, `means` + `"` → Definition

#### 1.5 `primary_role` derivation

After aggregation, set `primary_role` as the most frequent role in the subtree, or apply a priority order: `Prohibition > Obligation > Right > Condition`.

---

### Phase 2 — LLM Classification Layer

**Goal:** Augment keyword classification with a local LLM for ambiguous and complex clauses.

#### 2.1 LLM Adapter

Add a `llm` module implementing an `OpenAI`-compatible HTTP client:

```rust
pub struct LlmConfig {
    pub base_url: String,  // e.g. http://localhost:11434/v1
    pub api_key: String,
    pub model: String,
    pub timeout_ms: u64,
}
```

Support llama.cpp server, Ollama, LM Studio — any `/v1/chat/completions`-compatible endpoint.

#### 2.2 Classification Tasks

Use LLM for:
- **Role classification** — when keyword heuristics yield `None` or conflicting signals, send clause text + system prompt asking for `Obligation | Right | Condition | Prohibition | Unknown`
- **Domain classification** — same approach for domain tagging, including multi-domain clauses
- **Entity extraction** — parties (`Buyer`, `Seller`, `Licensor`), dates, monetary values, governing law
- **Risk scoring** — on a 1–5 scale per clause, with reasoning; useful for flagging unusual liability caps or unilateral termination rights
- **Tag generation** — free-form tags for full-text search (`force_majeure`, `auto_renewal`, `ip_assignment`, etc.)

#### 2.3 Prompt Design

Keep all prompts in a `prompts/` directory as `.txt` or `.toml` files (not hardcoded). This allows tuning without recompilation. Each prompt should use structured output (JSON schema in the system prompt) for reliable parsing.

#### 2.4 Caching

LLM calls are expensive even locally. Cache classification results by `content_hash` in a local SQLite database (`rusqlite`). Skip re-classification if hash matches.

---

### Phase 3 — Versioning and Diff

**Goal:** Track changes at clause granularity, model negotiation lifecycle (state machine).

```
Draft → UnderReview → Negotiating → Agreed → Superseded
  └──────────────────────────────→ Rejected → Draft
```

##### DocumentVersion (DAG node)
Each version carries: id, document_id (stable logical ID), version_number, parent_ids: Vec<Uuid> (supports merges), state, author, message, created_at, and a full clauses snapshot. flat_clauses() walks the tree recursively and returns HashMap<Uuid, &Clause> for O(1) lookup.

##### diff_versions (clause-level diff)

Compares two versions by UUID identity:

* Unchanged — same content_hash
* Modified — different hash → Jaccard similarity score + both text snapshots
* Added — UUID present only in to
* Removed — UUID present only in from
* Jaccard similarity operates on word token sets: |A ∩ B| / |A ∪ B|. Works well for legal text where repeated key terms signal * structural similarity.

##### VersionStore (SQLite persistence)

* open(path) — creates/opens DB, runs schema migration
* save_version / load_version — full serialization via serde_json
* get_history(document_id) — ordered list of all versions for a document
* diff_by_ids(from, to) — load + diff in one call
* next_version_number(document_id) — auto-incrementing version counter

#### 3.1 Negotiation State

```rust
pub enum NegotiationState {
    Proposed,
    Accepted,
    Rejected,
    Redlined { comment: String },
    Deleted,
    Inserted,
}
```

Each `Clause` in a versioned document carries a `NegotiationState`.

#### 3.2 Document Snapshot

A `DocumentVersion` contains:
- `version_id: Uuid`
- `parent_id: Option<Uuid>` — forms a DAG of versions
- `timestamp: DateTime<Utc>`
- `author: String`
- `clauses: Vec<Clause>` — full tree snapshot
- `changelog: Vec<ClauseChange>` — computed diff from parent

Store snapshots as JSON in a flat-file store or SQLite BLOB. No need for a heavy database in MVP.

#### 3.3 Clause Diff Algorithm

A tree-diff between two `Vec<Clause>` trees. Strategy:
1. Match clauses by `id` first (stable identity across edits)
2. Fall back to `content_hash` equality for moved/renumbered clauses
3. Produce `ClauseChange::Added | Removed | Modified { before, after } | Moved`

Use the Myers diff algorithm on the flattened clause list (depth-first order), then re-nest. A Rust crate `similar` can handle the sequence diff; the tree reconstruction is custom.

---

### Phase 4 — Rendering

**Goal:** Export agreed documents as clean PDF and DOCX with tracked changes.

#### 4.1 Typst Renderer (PDF)

- Write a `typst_renderer` module that converts a `Vec<Clause>` back to a `.typ` file
- Use a legal template: numbered sections, proper heading hierarchy, margin annotations for tags/risk scores
- Invoke `typst compile` via `std::process::Command` or the `typst` Rust library (it exposes a public API)
- Support per-clause styling hooks: highlight `Prohibition` in red margin note, flag high-risk clauses

#### 4.2 DOCX Renderer with Redlines

- Use `docx-rs` or `rust-docx` crate for DOCX generation
- Map `NegotiationState::Redlined` / `Inserted` / `Deleted` to OOXML `<w:ins>` / `<w:del>` tracked-change markup
- This gives standard Word-compatible redlines that any lawyer can review, accept, or reject in Word or LibreOffice
- Preserve original formatting metadata where possible (bold, italic from pandoc inlines)

#### 4.3 Round-trip Validation

After rendering to DOCX and re-parsing via pandoc, the clause tree should be structurally identical to the pre-render tree. Add an integration test asserting this.

---

### Phase 5 — API

**Goal:** Expose finch-core as a service for editor integrations.

#### 5.1 HTTP API (axum)

Endpoints:
```
POST   /documents                  — upload + parse → returns DocumentVersion
GET    /documents/:id              — fetch version with clause tree
GET    /documents/:id/clauses      — flat list of clauses with metadata
PATCH  /documents/:id/clauses/:cid — edit a single clause, creates new version
GET    /documents/:id/diff/:other  — clause-level diff between two versions
POST   /documents/:id/render/pdf   — render to PDF via Typst
POST   /documents/:id/render/docx  — render to DOCX with redlines
GET    /documents/:id/risk         — aggregated risk report
```

#### 5.2 Streaming Classification

LLM classification is slow. Return the parsed clause tree immediately from `POST /documents`, then stream classification results via Server-Sent Events as the LLM processes each clause asynchronously.

---

## Dependency Plan

| Crate | Purpose |
|---|---|
| `pandoc` + `pandoc_ast` | Document ingestion (already used) |
| `serde` + `serde_json` | Serialization |
| `uuid` | Stable clause identity |
| `sha2` | Content hashing |
| `rusqlite` | LLM response cache + version store |
| `reqwest` | LLM HTTP client (async) |
| `tokio` | Async runtime |
| `axum` | HTTP API server |
| `typst` | PDF rendering (lib or subprocess) |
| `docx-rs` | DOCX generation with tracked changes |
| `similar` | Sequence diff for clause versioning |
| `chrono` | Timestamps on versions |
| `regex` | Already used, extend patterns |

---

## Key Design Decisions

**Why pandoc as the ingestion layer?**
Pandoc handles the widest range of real-world input formats (DOCX, ODT, Markdown, HTML, LaTeX, PDF via pdftotext fallback) and normalizes them to a single AST. Writing custom parsers for each format is out of scope for MVP.

**Why Typst for PDF instead of LaTeX?**
Typst is faster, has a clean Rust-native library API, produces high-quality legal-grade PDFs, and is far easier to template than LaTeX. The `.typ` format is also diff-friendly.

**Why not use a full document database?**
For MVP, SQLite + JSON snapshots is sufficient and keeps the system self-contained. The versioning model (content-hashed clauses + parent pointer DAG) can migrate to a proper store later without changing the data model.

**Why local LLM?**
Legal documents are confidential. Using a cloud LLM for clause classification leaks sensitive contract terms. A local llama.cpp-compatible model keeps everything on-premises. The adapter is designed to be URL/key-configurable so a cloud model can be swapped in for non-sensitive use cases.

**Clause identity stability across edits**
The `id: Uuid` is assigned once at document parse time and carried forward in all versions. When a user edits clause text, the ID stays the same, only `content_hash` changes. This is what allows the diff engine to distinguish "clause 3.2 was modified" from "clause 3.2 was deleted and a new clause was inserted."

---

## Immediate Next Steps (in order)

1. Fix `Para` attachment bug in `build_clauses`
2. Add `uuid` + `sha2` dependencies; assign `id` and `content_hash` on clause construction
3. Add `serde` derives and write round-trip JSON test
4. Restore full keyword classifier in `detect_clause_type`
5. Implement `primary_role` assignment in `aggregate`
6. Add `LlmConfig` + async HTTP client with `/v1/chat/completions` support
7. Add SQLite-backed classification cache
8. Implement `DocumentVersion` + flat-file snapshot store
9. Implement clause tree diff using `similar`
10. Build Typst renderer
11. Build DOCX renderer with OOXML tracked-change markup
12. Wire up `axum` API with streaming classification SSE
