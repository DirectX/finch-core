import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db'
import { users } from '../db/schema'
import { hashPassword, verifyPassword, generateToken } from '../lib/auth'
import { eq } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'

const auth = new Hono()

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

auth.post('/signup', async (c) => {
  try {
    const body = await c.req.json()
    const { email, password, name } = signupSchema.parse(body)

    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    })

    if (existingUser) {
      return c.json({ error: 'Email already registered' }, 400)
    }

    const passwordHash = await hashPassword(password)

    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        name,
      })
      .returning()

    const token = await generateToken(user.id)

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      token,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400)
    }
    console.error('Signup error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

auth.post('/login', async (c) => {
  try {
    const body = await c.req.json()
    const { email, password } = loginSchema.parse(body)

    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    })

    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    const isValid = await verifyPassword(password, user.passwordHash)

    if (!isValid) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    const token = await generateToken(user.id)

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      token,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.errors }, 400)
    }
    console.error('Login error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

auth.get('/me', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId')

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    })

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
    })
  } catch (error) {
    console.error('Get user error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default auth
