import type { Context, Next } from 'hono'
import { verifyToken } from '../lib/auth'

declare module 'hono' {
  interface ContextVariableMap {
    userId: string
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.substring(7)
  const payload = await verifyToken(token)

  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401)
  }

  c.set('userId', payload.userId)
  await next()
}
