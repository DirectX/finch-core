# Environment Variables Configuration

All secrets and configuration are centralized in the root `.env` file. This file is used by:
- Docker Compose for infrastructure services (PostgreSQL, MinIO)
- TypeScript API server for application configuration
- Database migrations and tooling

## Setup

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Update the values in `.env` with your own secrets:
   - Generate strong passwords for `POSTGRES_PASSWORD` and `MINIO_ROOT_PASSWORD`
   - Generate a long random string for `JWT_SECRET` (at least 32 characters)
   - Update `S3_SECRET_KEY` to match `MINIO_ROOT_PASSWORD`

## Environment Variables

### Database Configuration
- `POSTGRES_USER` - PostgreSQL username (default: `finch`)
- `POSTGRES_PASSWORD` - PostgreSQL password (⚠️ **CHANGE THIS**)
- `POSTGRES_DB` - PostgreSQL database name (default: `finch_collab`)
- `DATABASE_URL` - Full PostgreSQL connection string

### MinIO/S3 Configuration
- `MINIO_ROOT_USER` - MinIO admin username (default: `minioadmin`)
- `MINIO_ROOT_PASSWORD` - MinIO admin password (⚠️ **CHANGE THIS**)
- `S3_ENDPOINT` - S3 endpoint URL (default: `http://localhost:9000`)
- `S3_BUCKET` - S3 bucket name (default: `finch-collab`)
- `S3_ACCESS_KEY` - S3 access key (should match `MINIO_ROOT_USER`)
- `S3_SECRET_KEY` - S3 secret key (should match `MINIO_ROOT_PASSWORD`)
- `S3_REGION` - S3 region (default: `us-east-1`)

### Application Configuration
- `JWT_SECRET` - Secret key for JWT token signing (⚠️ **CHANGE THIS**)
- `PORT` - TypeScript API server port (default: `4000`)
- `WEB_URL` - Frontend URL for CORS configuration
- `WS_URL` - WebSocket URL (for future real-time features)
- `RUST_API_URL` - Rust API endpoint (default: `http://localhost:3000`)

## Security Best Practices

1. **Never commit `.env` to version control** - It's already in `.gitignore`
2. **Use strong, unique passwords** for all services
3. **Generate a cryptographically secure JWT secret**:
   ```bash
   openssl rand -base64 32
   ```
4. **Rotate secrets regularly** in production environments
5. **Use different secrets** for development, staging, and production

## How It Works

### Docker Compose
The `docker-compose.dev.yml` file reads environment variables using `${VARIABLE_NAME}` syntax:
```yaml
environment:
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
```

### TypeScript API
The server loads the root `.env` file via `src/config/env.ts`:
```typescript
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '../../.env') })
```

This is imported at the top of:
- `src/index.ts` - Main server entry point
- `src/db/index.ts` - Database connection
- `src/db/migrate.ts` - Migration runner
- `drizzle.config.ts` - Drizzle Kit configuration

### Accessing Variables
In TypeScript code, access variables using `process.env`:
```typescript
const port = parseInt(process.env.PORT || '4000')
const jwtSecret = process.env.JWT_SECRET!
```

## Production Deployment

For production environments:
1. **Do not use `.env` files** - Use your platform's secret management
2. Set environment variables through:
   - Docker secrets
   - Kubernetes secrets
   - Cloud provider secret managers (AWS Secrets Manager, GCP Secret Manager, etc.)
   - Environment variable injection in your CI/CD pipeline

## Troubleshooting

### Variables not loading
- Ensure `.env` exists in the project root
- Check that `dotenv` package is installed: `pnpm add dotenv`
- Verify the path in `src/config/env.ts` is correct

### Docker Compose not reading variables
- Ensure `.env` is in the same directory as `docker-compose.dev.yml`
- Check variable syntax: `${VARIABLE_NAME}` (not `$VARIABLE_NAME`)
- Restart containers after changing `.env`: `docker compose -f docker-compose.dev.yml restart`

### Database connection fails
- Verify `DATABASE_URL` matches the PostgreSQL credentials
- Ensure `POSTGRES_PASSWORD` in `.env` matches the password in `DATABASE_URL`
- Check that PostgreSQL container is running: `docker compose -f docker-compose.dev.yml ps`
