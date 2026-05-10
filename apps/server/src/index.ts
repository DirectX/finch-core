import './config/env'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import authRoutes from './routes/auth'

const app = new Hono()

app.use('/*', cors({
  origin: process.env.WEB_URL || 'http://localhost:3000',
  credentials: true,
}))

app.get('/', (c) => c.json({
  name: 'Finch Collaboration API',
  version: '1.0.0',
  endpoints: {
    health: 'GET /health',
    auth: {
      signup: 'POST /auth/signup',
      login: 'POST /auth/login',
      me: 'GET /auth/me'
    }
  }
}))

app.get('/health', (c) => c.json({ status: 'ok' }))

app.route('/auth', authRoutes)

const port = parseInt(process.env.PORT || '4000')

console.log(`Server starting on port ${port}`)

serve({
  fetch: app.fetch,
  port,
})
