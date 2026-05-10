import { config } from 'dotenv'
import { resolve } from 'path'
import { defineConfig } from 'drizzle-kit'

config({ path: resolve(__dirname, '../../.env') })

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://finch:finch@localhost:5432/finch_collab',
  },
})
