import '../config/env'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL || 'postgresql://finch:finch@localhost:5432/finch_collab'

const pool = new Pool({
  connectionString,
})

export const db = drizzle(pool, { schema })
