import './config/env'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import authRoutes from './routes/auth'
import teamsRoutes from './routes/teams'
import usersRoutes from './routes/users'
import projectsRoutes from './routes/projects'
import foldersRoutes from './routes/folders'
import contractsRoutes from './routes/contracts'
import clausesRoutes from './routes/clauses'

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
    },
    users: {
      me: 'GET /users/me',
      updateMe: 'PATCH /users/me',
      getUser: 'GET /users/:id'
    },
    teams: {
      list: 'GET /teams',
      create: 'POST /teams',
      get: 'GET /teams/:id',
      update: 'PATCH /teams/:id',
      delete: 'DELETE /teams/:id',
      members: {
        list: 'GET /teams/:id/members',
        add: 'POST /teams/:id/members',
        update: 'PATCH /teams/:id/members/:memberId',
        remove: 'DELETE /teams/:id/members/:memberId'
      }
    },
    projects: {
      list: 'GET /projects',
      create: 'POST /projects',
      get: 'GET /projects/:id',
      update: 'PATCH /projects/:id',
      delete: 'DELETE /projects/:id',
      members: {
        list: 'GET /projects/:id/members',
        add: 'POST /projects/:id/members',
        update: 'PATCH /projects/:id/members/:memberId',
        remove: 'DELETE /projects/:id/members/:memberId'
      }
    },
    folders: {
      listByProject: 'GET /folders/project/:projectId',
      listRootFolders: 'GET /folders/project/:projectId/root',
      create: 'POST /folders',
      get: 'GET /folders/:id',
      getChildren: 'GET /folders/:id/children',
      update: 'PATCH /folders/:id',
      delete: 'DELETE /folders/:id'
    },
    contracts: {
      list: 'GET /contracts?projectId=:projectId&folderId=:folderId',
      create: 'POST /contracts',
      get: 'GET /contracts/:id',
      update: 'PATCH /contracts/:id',
      delete: 'DELETE /contracts/:id',
      versions: 'GET /contracts/:id/versions',
      versionClauses: 'GET /contracts/:id/versions/:versionId/clauses',
      documents: 'GET /contracts/:id/documents'
    },
    clauses: {
      get: 'GET /clauses/:id',
      comments: {
        list: 'GET /clauses/:id/comments',
        create: 'POST /clauses/:id/comments',
        delete: 'DELETE /clauses/:id/comments/:commentId'
      },
      reviews: {
        list: 'GET /clauses/:id/reviews',
        createOrUpdate: 'POST /clauses/:id/reviews',
        delete: 'DELETE /clauses/:id/reviews/:reviewId'
      }
    }
  }
}))

app.get('/health', (c) => c.json({ status: 'ok' }))

app.route('/auth', authRoutes)
app.route('/teams', teamsRoutes)
app.route('/users', usersRoutes)
app.route('/projects', projectsRoutes)
app.route('/folders', foldersRoutes)
app.route('/contracts', contractsRoutes)
app.route('/clauses', clausesRoutes)

const port = parseInt(process.env.PORT || '4000')

console.log(`Server starting on port ${port}`)

serve({
  fetch: app.fetch,
  port,
})
