# Phase 1 Setup Guide

**Goal**: Get the TypeScript API server running with PostgreSQL, authentication, and S3 integration.

## Prerequisites

- Node.js 20+
- pnpm 10+
- Docker & Docker Compose
- PostgreSQL client (optional, for debugging)

## Step-by-Step Setup

### 1. Start Infrastructure

Start PostgreSQL and MinIO:

```bash
docker compose up -d
```

Verify services are running:

```bash
docker compose ps
```

You should see:
- `postgres` - healthy
- `minio` - healthy
- `markitdown` - healthy

### 2. Install Dependencies

From the repo root:

```bash
pnpm install
```

This installs dependencies for all workspace packages including the new `apps/server`.

### 3. Configure Server Environment

```bash
cp apps/server/.env.example apps/server/.env
```

Edit `apps/server/.env` and set a secure JWT secret:

```bash
JWT_SECRET=$(openssl rand -base64 32)
```

Or manually set a long random string.

### 4. Generate Database Migrations

```bash
pnpm db:generate
```

This creates migration files in `apps/server/drizzle/` based on the schema.

### 5. Run Migrations

```bash
pnpm db:migrate
```

This applies the migrations to PostgreSQL, creating all tables.

### 6. Verify Database

Optional - check tables were created:

```bash
docker compose exec postgres psql -U finch -d finch_collab -c "\dt"
```

You should see tables like:
- users
- teams
- team_members
- projects
- contracts
- clauses
- etc.

Or use Drizzle Studio:

```bash
pnpm db:studio
```

Opens at http://localhost:4983

### 7. Start the Server

```bash
pnpm dev:server
```

Server starts on http://localhost:4000

### 8. Test Authentication

**Signup:**

```bash
curl -X POST http://localhost:4000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'
```

Response:
```json
{
  "user": {
    "id": "...",
    "email": "test@example.com",
    "name": "Test User"
  },
  "token": "eyJhbGc..."
}
```

**Login:**

```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

**Get User Info:**

```bash
TOKEN="<token from signup/login>"

curl http://localhost:4000/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### 9. Verify S3/MinIO

MinIO console: http://localhost:9001
- Username: `minioadmin`
- Password: `minioadmin`

Create the bucket if it doesn't exist:

```bash
docker compose exec minio mc mb /data/finch-collab
```

## Troubleshooting

### Database connection fails

Check PostgreSQL is running:
```bash
docker compose logs postgres
```

Test connection:
```bash
docker compose exec postgres psql -U finch -d finch_collab -c "SELECT 1"
```

### Migrations fail

Reset database (WARNING: deletes all data):
```bash
docker compose down -v
docker compose up -d
pnpm db:migrate
```

### Server won't start

Check logs for errors:
```bash
pnpm dev:server
```

Common issues:
- Port 4000 already in use
- Missing .env file
- Database not running

## Next Steps

Once the server is running and authentication works:

1. ✅ Phase 1 complete!
2. → Move to Phase 2: Team and project management APIs
3. → Create team CRUD endpoints
4. → Create project CRUD endpoints
5. → Implement folder structure

## Architecture Recap

```
┌─────────────────────────────────────┐
│  TypeScript API (Hono)              │
│  Port 4000                          │
│  - Auth (JWT)                       │
│  - CRUD operations                  │
│  - S3 file management               │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  PostgreSQL                         │
│  Port 5432                          │
│  - Users, teams, projects           │
│  - Contracts, clauses               │
│  - Comments, reviews                │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  MinIO (S3)                         │
│  Port 9000 (API), 9001 (Console)    │
│  - Document storage                 │
│  - PDF exports                      │
└─────────────────────────────────────┘
```

The Rust core (port 3000) will be integrated in Phase 2 for clause parsing and classification.
