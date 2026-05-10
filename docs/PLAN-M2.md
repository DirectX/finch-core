# PLAN-M2: Collaborative Contract Management MVP

**Milestone 2 — Multi-user Contract Vault with Clause-First Workflow**

**Status:** Planning → Implementation  
**Target:** 8-week MVP delivery  
**Last Updated:** 2026-05-10

---

## Executive Summary

Transform finch-core from a single-user clause analysis tool into a collaborative contract management platform with:
- Multi-user authentication and team workspaces
- Project-based document vaults with folder organization
- Clause-level collaboration (comments, approvals, rejections)
- Real-time Typst preview and PDF export
- Role-based access control
- S3-backed document storage

**Core Principle:** Maintain the existing clause-first internal workflow while adding collaborative features on top.

---

## Current State (Milestone 1)

### What Works
- ✅ Rust API (Axum) with clause parsing via Pandoc
- ✅ LLM-based clause classification (llama.cpp)
- ✅ Clause tree versioning and diffing
- ✅ SQLite storage for versions and cache
- ✅ Next.js frontend with basic upload/analysis
- ✅ Typst/DOCX export capabilities
- ✅ Docker-compose with PostgreSQL + MinIO + MarkItDown

### What's Missing
- ❌ User authentication and authorization
- ❌ Multi-user collaboration features
- ❌ Project/team organization
- ❌ Document vault with folder structure
- ❌ Clause-level comments and reviews
- ❌ Real-time Typst preview in browser
- ❌ Role-based permissions
- ❌ S3 document storage

---

## Target UI (from Screenshots)

### Dashboard View
- Left sidebar navigation:
  - Dashboard (grid icon)
  - Pipeline (workflow icon)
  - Contracts (list icon)
  - Calendar
  - Import
- Contract overview cards:
  - Active (count)
  - Review (count)
  - Critical (count)
- Top bar: "Contract Vault" + "VAULT SECURED" indicator

### Contract Detail View (4 Tabs)

#### Tab 1: AI ANALYSIS
- Finch AI summary
- Risk score visualization (circular progress)
- Clause breakdown by risk level
- Summary and execution sections

#### Tab 2: CLAUSE REVIEW
- Clause list with risk badges (RISK, ATTENTION, COMPLIANT)
- Per-clause actions:
  - View details
  - Comment
  - Approve/Reject
  - Override risk level
- Filter by status: Compliant, Attention, Risk

#### Tab 3: DOCUMENTS
- File list (name + upload date)
- Upload button
- S3-backed storage

#### Tab 4: DISCUSSION
- Threaded comments
- User avatars + timestamps
- AI bot integration
- "Secure thread" messaging
- Real-time updates

### Contract Header
- Contract ID (e.g., C-008)
- Status badge (CRITICAL, DRAFT, etc.)
- Title + counterparty
- Metadata: Value, Type, Category, Signed, Expires, Days Left
- Assigned user
- Action buttons: APPROVE, ESCALATE

---

## Architecture

### Hybrid Stack Approach

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js 15)                    │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │   Dashboard    │  │  Clause UI   │  │  Typst Preview  │ │
│  │   & Vault      │  │  + Comments  │  │  (WASM)         │ │
│  └────────────────┘  └──────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              TypeScript API Server (Hono/Node.js)            │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  Auth & RBAC   │  │  Vault API   │  │  Collaboration  │ │
│  │  (JWT)         │  │  (CRUD)      │  │  (Comments)     │ │
│  └────────────────┘  └──────────────┘  └─────────────────┘ │
│                              │                               │
│                              ▼                               │
│                    ┌──────────────────┐                     │
│                    │  Bridge to Rust  │                     │
│                    │  (HTTP/gRPC)     │                     │
│                    └──────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Rust Core (Axum) — Clause Engine            │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  Parse         │  │  Classify    │  │  Diff & Export  │ │
│  │  (Pandoc)      │  │  (LLM)       │  │  (Typst/DOCX)   │ │
│  └────────────────┘  └──────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Data Layer                              │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  PostgreSQL    │  │  MinIO (S3)  │  │  LLM Server     │ │
│  │  (Drizzle ORM) │  │  (Docs)      │  │  (llama.cpp)    │ │
│  └────────────────┘  └──────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Why Hybrid?
- **TypeScript API**: Fast iteration for CRUD, auth, collaboration
- **Rust Core**: Keep existing clause parsing, LLM, diff logic
- **Bridge**: HTTP/gRPC calls from TS → Rust for clause operations

---

## Database Schema (PostgreSQL)

### Users & Teams
```sql
users
  id              UUID PRIMARY KEY
  email           TEXT UNIQUE NOT NULL
  password_hash   TEXT NOT NULL
  name            TEXT
  created_at      TIMESTAMP DEFAULT NOW()

teams
  id              UUID PRIMARY KEY
  name            TEXT NOT NULL
  created_at      TIMESTAMP DEFAULT NOW()

team_members
  id              UUID PRIMARY KEY
  team_id         UUID → teams(id) ON DELETE CASCADE
  user_id         UUID → users(id) ON DELETE CASCADE
  role            ENUM('owner', 'admin', 'member')
  UNIQUE(team_id, user_id)
```

### Projects & Vaults
```sql
projects
  id              UUID PRIMARY KEY
  team_id         UUID → teams(id) ON DELETE CASCADE
  name            TEXT NOT NULL
  description     TEXT
  created_at      TIMESTAMP DEFAULT NOW()

project_members
  id              UUID PRIMARY KEY
  project_id      UUID → projects(id) ON DELETE CASCADE
  user_id         UUID → users(id) ON DELETE CASCADE
  role            ENUM('owner', 'editor', 'viewer')
  UNIQUE(project_id, user_id)

folders
  id              UUID PRIMARY KEY
  project_id      UUID → projects(id) ON DELETE CASCADE
  parent_id       UUID → folders(id) ON DELETE CASCADE (nullable)
  name            TEXT NOT NULL
  path            TEXT NOT NULL
  created_at      TIMESTAMP DEFAULT NOW()
```

### Contracts & Versions
```sql
contracts
  id              UUID PRIMARY KEY
  project_id      UUID → projects(id) ON DELETE CASCADE
  folder_id       UUID → folders(id) ON DELETE SET NULL (nullable)
  title           TEXT NOT NULL
  counterparty    TEXT
  status          ENUM('draft', 'review', 'critical', 'active', 'expired')
  assigned_to     UUID → users(id) ON DELETE SET NULL (nullable)
  value           DECIMAL
  contract_type   TEXT
  category        TEXT
  signed_date     DATE
  expires_at      DATE
  created_at      TIMESTAMP DEFAULT NOW()
  updated_at      TIMESTAMP DEFAULT NOW()

document_versions
  id                UUID PRIMARY KEY
  contract_id       UUID → contracts(id) ON DELETE CASCADE
  parent_version_id UUID → document_versions(id) (nullable)
  version_number    INTEGER NOT NULL
  clause_tree_json  JSONB NOT NULL
  created_by        UUID → users(id)
  created_at        TIMESTAMP DEFAULT NOW()
```

### Clauses (Denormalized for Querying)
```sql
clauses
  id                UUID PRIMARY KEY
  version_id        UUID → document_versions(id) ON DELETE CASCADE
  clause_uuid       UUID NOT NULL
  title             TEXT NOT NULL
  content_hash      TEXT NOT NULL
  role              TEXT
  domain            TEXT
  risk_score        INTEGER
  level             INTEGER
  parent_clause_id  UUID → clauses(id) (nullable)
  full_text         TEXT
```

### Collaboration
```sql
clause_comments
  id              UUID PRIMARY KEY
  clause_id       UUID → clauses(id) ON DELETE CASCADE
  user_id         UUID → users(id) ON DELETE CASCADE
  comment_text    TEXT NOT NULL
  created_at      TIMESTAMP DEFAULT NOW()

clause_reviews
  id              UUID PRIMARY KEY
  clause_id       UUID → clauses(id) ON DELETE CASCADE
  user_id         UUID → users(id) ON DELETE CASCADE
  status          ENUM('pending', 'approved', 'rejected')
  reason          TEXT
  created_at      TIMESTAMP DEFAULT NOW()
```

### Documents (Uploaded Files)
```sql
documents
  id              UUID PRIMARY KEY
  contract_id     UUID → contracts(id) ON DELETE CASCADE
  folder_id       UUID → folders(id) ON DELETE SET NULL (nullable)
  filename        TEXT NOT NULL
  s3_key          TEXT NOT NULL
  mime_type       TEXT NOT NULL
  size            INTEGER NOT NULL
  uploaded_by     UUID → users(id)
  uploaded_at     TIMESTAMP DEFAULT NOW()
```

### AI Analysis
```sql
ai_analyses
  id              UUID PRIMARY KEY
  version_id      UUID → document_versions(id) ON DELETE CASCADE
  analysis_type   TEXT NOT NULL
  result_json     JSONB NOT NULL
  created_at      TIMESTAMP DEFAULT NOW()
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal:** Database, auth, and basic API structure

#### Tasks
1. Create TypeScript API server (apps/server)
   - Hono framework setup
   - PostgreSQL connection with Drizzle ORM
   - Environment configuration
2. Implement database schema
   - Create migration files
   - Run initial migrations
3. Authentication system
   - JWT token generation/validation
   - Password hashing (bcrypt)
   - Signup/login endpoints
   - Auth middleware
4. S3/MinIO integration
   - Upload/download helpers
   - Bucket initialization
5. Bridge to Rust core
   - HTTP client for clause operations
   - Error handling

#### Deliverables
- ✅ apps/server running on port 4000
- ✅ PostgreSQL schema migrated
- ✅ POST /auth/signup, /auth/login working
- ✅ S3 upload/download functional
- ✅ Bridge to Rust core operational

---

### Phase 2: Core APIs (Week 3-4)
**Goal:** CRUD operations for teams, projects, contracts

#### Tasks
1. Team management
   - POST /teams (create)
   - GET /teams (list user's teams)
   - POST /teams/:id/members (invite)
   - DELETE /teams/:id/members/:userId (remove)
2. Project management
   - POST /projects (create in team)
   - GET /projects (list by team)
   - POST /projects/:id/members (add member)
   - GET /projects/:id/folders (folder tree)
   - POST /projects/:id/folders (create folder)
3. Contract management
   - POST /contracts (create)
   - GET /contracts (list with filters)
   - GET /contracts/:id (detail)
   - PATCH /contracts/:id (update metadata)
   - DELETE /contracts/:id
4. Document upload
   - POST /contracts/:id/upload
   - Trigger Rust parse → classify → store
5. Version management
   - GET /contracts/:id/versions
   - POST /contracts/:id/versions (create new)

#### Deliverables
- ✅ Full CRUD for teams, projects, contracts
- ✅ Document upload → clause parsing pipeline
- ✅ Version history tracking

---

### Phase 3: Clause Collaboration (Week 5)
**Goal:** Comments, reviews, and clause-level actions

#### Tasks
1. Clause endpoints
   - GET /contracts/:id/clauses (list all clauses)
   - GET /clauses/:id (detail)
2. Comments
   - POST /clauses/:id/comments
   - GET /clauses/:id/comments
   - DELETE /comments/:id
3. Reviews
   - POST /clauses/:id/reviews (approve/reject)
   - GET /clauses/:id/reviews
   - PATCH /clauses/:id/override (risk override)
4. Real-time updates (optional)
   - WebSocket for live comments
   - Or polling fallback

#### Deliverables
- ✅ Comment system functional
- ✅ Approve/reject workflow
- ✅ Risk override capability

---

### Phase 4: Frontend Foundation (Week 6)
**Goal:** Auth UI, dashboard, navigation

#### Tasks
1. Authentication UI
   - Login page
   - Signup page
   - Protected route middleware
   - User context provider
2. Dashboard layout
   - Sidebar navigation
   - Top bar with user menu
   - Contract overview cards
3. Contract list view
   - Table with filters
   - Status badges
   - Search functionality
4. Contract detail page
   - Header with metadata
   - Tab navigation (4 tabs)
   - Placeholder content

#### Deliverables
- ✅ Login/signup working
- ✅ Dashboard with navigation
- ✅ Contract list and detail pages

---

### Phase 5: Clause UI (Week 7)
**Goal:** Clause review, comments, documents tabs

#### Tasks
1. Clause Review tab
   - Clause list with risk badges
   - Filter by status
   - Approve/reject buttons
   - Comment modal
2. Documents tab
   - File list
   - Upload button
   - Download links
3. Discussion tab
   - Comment thread
   - User avatars
   - Real-time updates
   - Input field + send
4. AI Analysis tab
   - Risk score visualization
   - Clause breakdown
   - Summary sections

#### Deliverables
- ✅ All 4 tabs functional
- ✅ Clause actions working
- ✅ Document upload/download

---

### Phase 6: Typst Preview & Export (Week 8)
**Goal:** Real-time preview and PDF export

#### Tasks
1. Install Typst WASM dependencies
   - @myriaddreamin/typst.ts
   - @myriaddreamin/typst-ts-renderer
   - @myriaddreamin/typst-ts-web-compiler
2. Clause tree → Typst converter
   - Generate .typ markup from clause JSON
   - Handle nested structure
   - Apply formatting
3. Preview component
   - WASM initialization
   - Real-time rendering (debounced)
   - Side-by-side layout
4. Export functionality
   - Client: trigger export
   - Server: Typst CLI → PDF
   - Download response

#### Deliverables
- ✅ Live Typst preview in browser
- ✅ PDF export working
- ✅ DOCX export (existing)

---

## Technical Stack

### Backend
- **TypeScript API**: Hono + Node.js (port 4000)
- **Rust Core**: Axum (port 3000) — clause engine
- **Database**: PostgreSQL 17 (Drizzle ORM)
- **Storage**: MinIO (S3-compatible)
- **Auth**: JWT (jose library)
- **LLM**: llama.cpp server (port 8080)

### Frontend
- **Framework**: Next.js 15 (App Router)
- **UI**: React 19 + TailwindCSS
- **Preview**: Typst WASM (@myriaddreamin/typst.ts)
- **State**: React Context + SWR/TanStack Query
- **Forms**: React Hook Form + Zod

### Infrastructure
- **Monorepo**: Turborepo + pnpm workspaces
- **Docker**: docker-compose for local dev
- **Migrations**: Drizzle Kit

---

## Clause-First Workflow (Preserved)

```
1. Upload Document
   ↓
2. Parse (Rust: Pandoc → Clause Tree)
   ↓
3. Classify (Rust: LLM → Roles, Domains, Risk)
   ↓
4. Store (PostgreSQL: Version + Clauses)
   ↓
5. UI: Display Clauses
   ↓
6. User Actions: Comment / Approve / Reject
   ↓
7. Generate Preview (Typst WASM)
   ↓
8. Export (Typst CLI → PDF)
```

**Key Principle:** All clause operations go through the Rust core. The TypeScript API is a thin layer for collaboration and storage.

---

## API Endpoints Summary

### Authentication
- POST /auth/signup
- POST /auth/login
- POST /auth/refresh
- GET /auth/me

### Teams
- POST /teams
- GET /teams
- GET /teams/:id
- POST /teams/:id/members
- DELETE /teams/:id/members/:userId

### Projects
- POST /projects
- GET /projects
- GET /projects/:id
- POST /projects/:id/members
- GET /projects/:id/folders
- POST /projects/:id/folders

### Contracts
- POST /contracts
- GET /contracts
- GET /contracts/:id
- PATCH /contracts/:id
- DELETE /contracts/:id
- POST /contracts/:id/upload
- GET /contracts/:id/versions

### Clauses
- GET /contracts/:id/clauses
- GET /clauses/:id
- POST /clauses/:id/comments
- GET /clauses/:id/comments
- POST /clauses/:id/reviews
- PATCH /clauses/:id/override

### Documents
- POST /documents/upload
- GET /documents/:id
- DELETE /documents/:id

### Export
- POST /contracts/:id/export/pdf
- POST /contracts/:id/export/docx

### Internal (TS → Rust Bridge)
- POST /internal/parse
- POST /internal/classify
- POST /internal/diff
- POST /internal/export

---

## Success Criteria

### Week 4 Checkpoint
- [ ] User can signup/login
- [ ] User can create team and project
- [ ] User can upload document to project
- [ ] Document is parsed into clauses
- [ ] Clauses are classified by LLM

### Week 6 Checkpoint
- [ ] User can view contract dashboard
- [ ] User can browse clause list
- [ ] User can comment on clauses
- [ ] User can approve/reject clauses

### Week 8 (MVP Complete)
- [ ] User can see live Typst preview
- [ ] User can export to PDF
- [ ] All 4 tabs functional
- [ ] Multi-user collaboration working
- [ ] Role-based permissions enforced

---

## Risk Mitigation

### Technical Risks
1. **Rust ↔ TypeScript bridge complexity**
   - Mitigation: Use simple HTTP/JSON, avoid gRPC initially
2. **Typst WASM performance**
   - Mitigation: Debounce rendering, use Web Workers
3. **PostgreSQL migration from SQLite**
   - Mitigation: Write migration script, test thoroughly

### Scope Risks
1. **Feature creep**
   - Mitigation: Strict adherence to 4-tab UI from screenshots
2. **Timeline slippage**
   - Mitigation: Weekly checkpoints, cut non-essential features

---

## Next Steps (Immediate)

1. ✅ Create apps/server directory structure
2. ✅ Set up Drizzle ORM with PostgreSQL
3. ✅ Write database schema and migrations
4. ✅ Implement authentication (signup/login)
5. ✅ Create S3 upload/download helpers
6. ✅ Build bridge to Rust core

**Start Date:** 2026-05-10  
**Target MVP:** 2026-07-05 (8 weeks)

---

## References

- finch-collab: `/home/denis/projects/github/DirectX/finch-collab`
- UI Screenshots: 4 images showing dashboard, clause review, documents, discussion
- Existing docs: `core/docs/PHASE6_FRONTEND.md`
