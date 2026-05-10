# Finch Server

TypeScript API server for collaborative contract management.

## Stack

- **Framework**: Hono (lightweight web framework)
- **Database**: PostgreSQL 17 with Drizzle ORM
- **Storage**: MinIO (S3-compatible)
- **Auth**: JWT with bcrypt password hashing
- **Runtime**: Node.js 20+

## Setup

### 1. Install dependencies

From the repo root:

```bash
pnpm install
```

### 2. Configure environment

```bash
cp apps/server/.env.example apps/server/.env
```

Edit `apps/server/.env` and set:
- `JWT_SECRET` - A long random string for JWT signing
- `DATABASE_URL` - PostgreSQL connection string (default works with docker-compose)
- `S3_*` - MinIO/S3 credentials (default works with docker-compose)

### 3. Start infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL and MinIO.

### 4. Run migrations

```bash
pnpm db:migrate
```

If migrations don't exist yet, generate them first:

```bash
pnpm db:generate
pnpm db:migrate
```

## Development

```bash
pnpm dev:server
```

Server runs on http://localhost:4000

## Database

### Generate migrations

After changing `src/db/schema.ts`:

```bash
pnpm db:generate
```

### Run migrations

```bash
pnpm db:migrate
```

### Database studio

Browse the database with Drizzle Studio:

```bash
pnpm db:studio
```

## API Endpoints

### Authentication
- `POST /auth/signup` - Create new user
- `POST /auth/login` - Login and get JWT token
- `GET /auth/me` - Get current user (requires auth)

### Protected Routes

All other routes require `Authorization: Bearer <token>` header.

## Architecture

This server acts as a collaboration layer on top of the Rust core:

```
Client → TypeScript API (auth, CRUD, collaboration)
              ↓
         Rust Core (clause parsing, LLM, diff)
              ↓
         PostgreSQL + MinIO
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://finch:finch@localhost:5432/finch_collab` | PostgreSQL connection |
| `JWT_SECRET` | - | Secret for JWT signing (required) |
| `PORT` | `4000` | Server port |
| `WEB_URL` | `http://localhost:3000` | Frontend URL for CORS |
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO/S3 endpoint |
| `S3_BUCKET` | `finch-collab` | S3 bucket name |
| `S3_ACCESS_KEY` | `minioadmin` | S3 access key |
| `S3_SECRET_KEY` | `minioadmin` | S3 secret key |
| `RUST_API_URL` | `http://localhost:3000` | Rust core API URL |
