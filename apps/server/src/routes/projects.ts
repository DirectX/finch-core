import { Hono } from 'hono'
import { db } from '../db'
import { projects, projectMembers, teams, teamMembers, users } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

const app = new Hono()

const createProjectSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
})

const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
})

const addProjectMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['owner', 'editor', 'viewer']).default('editor'),
})

const updateProjectMemberSchema = z.object({
  role: z.enum(['owner', 'editor', 'viewer']),
})

app.use('/*', authMiddleware)

async function checkTeamAccess(userId: string, teamId: string) {
  const [membership] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
  return membership
}

async function checkProjectAccess(userId: string, projectId: string) {
  const [membership] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
  return membership
}

app.get('/', async (c) => {
  const userId = c.get('userId')
  
  const userProjects = await db
    .select({
      id: projects.id,
      teamId: projects.teamId,
      name: projects.name,
      description: projects.description,
      createdAt: projects.createdAt,
      role: projectMembers.role,
    })
    .from(projects)
    .innerJoin(projectMembers, eq(projects.id, projectMembers.projectId))
    .where(eq(projectMembers.userId, userId))
  
  return c.json(userProjects)
})

app.post('/', zValidator('json', createProjectSchema), async (c) => {
  const userId = c.get('userId')
  const { teamId, name, description } = c.req.valid('json')
  
  const teamMembership = await checkTeamAccess(userId, teamId)
  if (!teamMembership) {
    return c.json({ error: 'Team not found or access denied' }, 404)
  }
  
  const [project] = await db.insert(projects).values({ teamId, name, description }).returning()
  
  await db.insert(projectMembers).values({
    projectId: project.id,
    userId,
    role: 'owner',
  })
  
  return c.json(project, 201)
})

app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const projectId = c.req.param('id')
  
  const membership = await checkProjectAccess(userId, projectId)
  if (!membership) {
    return c.json({ error: 'Project not found or access denied' }, 404)
  }
  
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId))
  
  return c.json({ ...project, role: membership.role })
})

app.patch('/:id', zValidator('json', updateProjectSchema), async (c) => {
  const userId = c.get('userId')
  const projectId = c.req.param('id')
  const updates = c.req.valid('json')
  
  const membership = await checkProjectAccess(userId, projectId)
  if (!membership || (membership.role !== 'owner' && membership.role !== 'editor')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }
  
  const [updated] = await db
    .update(projects)
    .set(updates)
    .where(eq(projects.id, projectId))
    .returning()
  
  return c.json(updated)
})

app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const projectId = c.req.param('id')
  
  const membership = await checkProjectAccess(userId, projectId)
  if (!membership || membership.role !== 'owner') {
    return c.json({ error: 'Only project owners can delete projects' }, 403)
  }
  
  await db.delete(projects).where(eq(projects.id, projectId))
  
  return c.json({ success: true })
})

app.get('/:id/members', async (c) => {
  const userId = c.get('userId')
  const projectId = c.req.param('id')
  
  const membership = await checkProjectAccess(userId, projectId)
  if (!membership) {
    return c.json({ error: 'Project not found or access denied' }, 404)
  }
  
  const members = await db
    .select({
      id: projectMembers.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId))
  
  return c.json(members)
})

app.post('/:id/members', zValidator('json', addProjectMemberSchema), async (c) => {
  const currentUserId = c.get('userId')
  const projectId = c.req.param('id')
  const { userId, role } = c.req.valid('json')
  
  const membership = await checkProjectAccess(currentUserId, projectId)
  if (!membership || (membership.role !== 'owner' && membership.role !== 'editor')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }
  
  const [newMember] = await db
    .insert(projectMembers)
    .values({ projectId, userId, role })
    .returning()
  
  return c.json(newMember, 201)
})

app.patch('/:id/members/:memberId', zValidator('json', updateProjectMemberSchema), async (c) => {
  const currentUserId = c.get('userId')
  const projectId = c.req.param('id')
  const memberId = c.req.param('memberId')
  const { role } = c.req.valid('json')
  
  const membership = await checkProjectAccess(currentUserId, projectId)
  if (!membership || membership.role !== 'owner') {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }
  
  const [updated] = await db
    .update(projectMembers)
    .set({ role })
    .where(and(eq(projectMembers.id, memberId), eq(projectMembers.projectId, projectId)))
    .returning()
  
  return c.json(updated)
})

app.delete('/:id/members/:memberId', async (c) => {
  const currentUserId = c.get('userId')
  const projectId = c.req.param('id')
  const memberId = c.req.param('memberId')
  
  const membership = await checkProjectAccess(currentUserId, projectId)
  if (!membership || membership.role !== 'owner') {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }
  
  await db.delete(projectMembers).where(and(eq(projectMembers.id, memberId), eq(projectMembers.projectId, projectId)))
  
  return c.json({ success: true })
})

export default app
