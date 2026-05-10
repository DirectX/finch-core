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
│   ├── server/         ← TypeScript API (Hono) — port 4000
│   │   ├── src/
│   │   │   ├── db/     ← Drizzle ORM schema & migrations
│   │   │   ├── routes/ ← API endpoints (auth, teams, projects)
│   │   │   ├── middleware/
│   │   │   └── lib/    ← Auth (JWT), S3 utilities
│   │   └── drizzle/    ← Migration files
│   └── web/            ← Next.js 15 (App Router) — port 3001
└── packages/
    └── sdk/            ← Shared Zod schemas + typed fetch client
```

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| [Docker](https://docs.docker.com/get-docker/) | ≥ 20.x | Runs PostgreSQL and MinIO for development |
| [Docker Compose](https://docs.docker.com/compose/install/) | ≥ 2.x | Orchestrates development infrastructure |
| [Rust](https://rustup.rs) | stable (≥ 1.87) | Compiles the API server |
| [Pandoc](https://pandoc.org/installing.html) | ≥ 3.x | Document parsing (`.docx`, `.md`, `.txt` → clause AST) |
| [llama.cpp](https://github.com/ggerganov/llama.cpp) | latest | Local LLM inference server (`llama-server`) |
| [Node.js](https://nodejs.org) | ≥ 20 LTS | Runs the Next.js frontend and TypeScript API |
| [pnpm](https://pnpm.io/installation) | ≥ 10 | Monorepo package manager |

## Setup

### 1 — Clone and install JS dependencies

```bash
git clone https://github.com/DirectX/finch-core.git
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

### 3 — Configure environment variables

Copy the example environment file and update with your own secrets:

```bash
cp .env.example .env
```

**Important:** Update the following values in `.env`:
- `POSTGRES_PASSWORD` - Choose a strong password
- `MINIO_ROOT_PASSWORD` - Choose a strong password
- `JWT_SECRET` - Generate with `openssl rand -base64 32`
- `S3_SECRET_KEY` - Should match `MINIO_ROOT_PASSWORD`

See [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) for detailed configuration guide.

### 4 — Start development infrastructure

Start PostgreSQL and MinIO using Docker Compose:

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts:
- **PostgreSQL 17** on port 5432 (credentials from `.env`)
- **MinIO** on ports 9000 (API) and 9001 (console, credentials from `.env`)

### 5 — Run database migrations

```bash
pnpm db:migrate
```

This creates all necessary tables in PostgreSQL (users, teams, projects, contracts, clauses, etc.).

## Running

You now have **four** services to run. The TypeScript API server (port 4000) handles authentication, teams, and collaboration, while the Rust API (port 3000) handles clause parsing and LLM classification.

All services must be running at the same time. Open four terminals.

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

### Terminal 3 — TypeScript API server

```bash
pnpm dev:server
```

The TypeScript API listens on **http://localhost:4000** and handles authentication, teams, projects, and collaboration features.

### Terminal 4 — Next.js web app

```bash
pnpm --filter @finch/web dev
```

The web app starts on **http://localhost:3001** and proxies all `/api/*` requests to the Rust backend, so no CORS configuration is needed.

Open **http://localhost:3001** in your browser.

## Development commands

```bash
# Start infrastructure (PostgreSQL + MinIO)
docker compose -f docker-compose.dev.yml up -d

# Stop infrastructure
docker compose -f docker-compose.dev.yml down

# Run database migrations
pnpm db:migrate

# Generate new migration after schema changes
pnpm db:generate

# Open Drizzle Studio (database GUI)
pnpm db:studio

# Start TypeScript API server
pnpm dev:server

# Start Next.js web app
pnpm dev:web

# Type-check all TypeScript packages
pnpm turbo typecheck

# Build everything (SDK + web + server)
pnpm turbo build

# Run Rust unit tests
cargo test --manifest-path core/Cargo.toml

# Run Rust lints
cargo clippy --manifest-path core/Cargo.toml
```

## API reference (brief)

### Rust API (port 3000) — Clause Processing

| Method | Path | Description |
|---|---|---|
| `GET` | `/documents` | List all document version summaries |
| `POST` | `/documents` | Upload a document (multipart); returns SSE stream |
| `GET` | `/documents/:id` | Full document version with clause tree |
| `GET` | `/documents/:id/clauses` | Flat list of clauses |
| `PATCH` | `/documents/:id/clauses/:cid` | Edit a clause title (creates new version) |
| `GET` | `/documents/:id/diff/:other` | Word-level diff between two versions |
| `GET` | `/documents/:id/risk` | Risk report for a version |
| `GET` | `/documents/:id/render/pdf` | Render to PDF via Typst (query: `title`, `author`, `show_risk_scores`, `show_role_badges`) |
| `GET` | `/documents/:id/render/docx` | Render to DOCX via Pandoc (query: `title`, `author`, `compare_to`) |

### TypeScript API (port 4000) — Collaboration & Teams

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/signup` | Create new user account |
| `POST` | `/auth/login` | Login and receive JWT token |
| `GET` | `/auth/me` | Get current user info (requires auth) |

**Coming in Phase 2:**
- Team management (`/teams`)
- Project management (`/projects`)
- Contract management (`/contracts`)
- Clause collaboration (`/clauses/:id/comments`, `/clauses/:id/reviews`)
