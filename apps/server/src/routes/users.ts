import { Hono } from 'hono'
import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

const app = new Hono()

const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
})

app.use('/*', authMiddleware)

app.get('/me', async (c) => {
  const userId = c.get('userId')
  
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
  
  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }
  
  return c.json(user)
})

app.patch('/me', zValidator('json', updateUserSchema), async (c) => {
  const userId = c.get('userId')
  const updates = c.req.valid('json')
  
  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
    })
  
  return c.json(updated)
})

app.get('/:id', async (c) => {
  const targetUserId = c.req.param('id')
  
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, targetUserId))
  
  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }
  
  return c.json(user)
})

export default app
