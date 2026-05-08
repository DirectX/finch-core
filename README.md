# Finch

Contract intelligence platform — upload legal documents, extract and classify clauses with a local LLM, compare versions side-by-side, and generate risk reports. Runs entirely on-premise with no data leaving your machine.

## What it does

| Feature | Detail |
|---|---|
| **Upload** | Drag-drop `.md`, `.docx`, or `.txt` contracts; Pandoc parses them into a structured clause tree |
| **Classify** | Each clause is sent to a locally-running Gemma 4B model (via llama.cpp) and tagged with role, domain, risk score, entities, and a one-line summary — streamed back to the UI in real time via SSE |
| **Version graph** | Every upload creates an immutable `DocumentVersion` stored in SQLite; parent/child relationships form an audit trail |
| **Diff** | Word-level diff between any two versions, with Jaccard similarity scores and Added/Removed/Modified/Unchanged breakdown |
| **Risk report** | Risk distribution chart (Recharts) + table of high-risk clauses sorted by score |
| **Export** | Render any version to PDF (Typst) or tracked-changes DOCX (Pandoc) |

## Monorepo layout

```
finch-core/
├── core/               ← Rust API (axum) — port 3000
│   ├── src/
│   ├── models/         ← GGUF weights + Jinja templates
│   └── scripts/
├── apps/
│   └── web/            ← Next.js 15 (App Router) — port 3001
└── packages/
    └── sdk/            ← Shared Zod schemas + typed fetch client
```

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| [Rust](https://rustup.rs) | stable (≥ 1.87) | Compiles the API server |
| [Pandoc](https://pandoc.org/installing.html) | ≥ 3.x | Document parsing (`.docx`, `.md`, `.txt` → clause AST) |
| [llama.cpp](https://github.com/ggerganov/llama.cpp) | latest | Local LLM inference server (`llama-server`) |
| [Node.js](https://nodejs.org) | ≥ 20 LTS | Runs the Next.js frontend |
| [pnpm](https://pnpm.io/installation) | ≥ 9 | Monorepo package manager |

## Setup

### 1 — Clone and install JS dependencies

```bash
git clone https://github.com/your-org/finch-core.git
cd finch-core
pnpm install
```

### 2 — Download the model template (and optionally the weights)

```bash
bash core/scripts/download-models.sh
```

This places the Gemma 4B chat template in `core/models/templates/`. To download the model weights (~4 GB) as well, uncomment the last block in the script:

```bash
# inside core/scripts/download-models.sh, uncomment:
# download_if_missing \
#     "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf?download=true" \
#     "$MODELS_DIR/gemma-4-E4B-it-Q4_K_M.gguf"
```

Or download manually and place the `.gguf` file at `core/models/gemma-4-E4B-it-Q4_K_M.gguf`.

## Running

All three services must be running at the same time. Open three terminals.

### Terminal 1 — LLM server (llama.cpp)

```bash
llama-server \
  --model core/models/gemma-4-E4B-it-Q4_K_M.gguf \
  --chat-template-file core/models/templates/google-gemma-4-31B-it-interleaved.jinja \
  --port 8080 \
  --ctx-size 8192 \
  --n-predict 512 \
  -ngl 99
```

> `-ngl 99` offloads all layers to GPU. Remove or lower it if you are running CPU-only.
> The API server expects the LLM at `http://localhost:8080/completion` by default.

### Terminal 2 — Rust API server

```bash
cargo run --release --manifest-path core/Cargo.toml
```

The API listens on **http://localhost:3000**. SQLite databases are created automatically at `core/docs/finch_versions.db` and `core/docs/finch_cache.db` on first run.

### Terminal 3 — Next.js web app

```bash
pnpm --filter @finch/web dev
```

The web app starts on **http://localhost:3001** and proxies all `/api/*` requests to the Rust backend, so no CORS configuration is needed.

Open **http://localhost:3001** in your browser.

## Development commands

```bash
# Type-check all TypeScript packages
pnpm turbo typecheck

# Build everything (SDK + web)
pnpm turbo build

# Run Rust unit tests
cargo test --manifest-path core/Cargo.toml

# Run Rust lints
cargo clippy --manifest-path core/Cargo.toml
```

## API reference (brief)

| Method | Path | Description |
|---|---|---|
| `GET` | `/documents` | List all document version summaries |
| `POST` | `/documents` | Upload a document (multipart); returns SSE stream |
| `GET` | `/documents/:id` | Full document version with clause tree |
| `GET` | `/documents/:id/clauses` | Flat list of clauses |
| `PATCH` | `/documents/:id/clauses/:cid` | Edit a clause title (creates new version) |
| `GET` | `/documents/:id/diff/:other` | Word-level diff between two versions |
| `GET` | `/documents/:id/risk` | Risk report for a version |
| `POST` | `/documents/:id/render/pdf` | Render to PDF via Typst |
| `POST` | `/documents/:id/render/docx` | Render to tracked-changes DOCX via Pandoc |
