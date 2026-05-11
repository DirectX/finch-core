import { Hono } from 'hono'
import { db } from '../db'
import { teams, teamMembers, users } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

const app = new Hono()

const createTeamSchema = z.object({
  name: z.string().min(1).max(255),
})

const updateTeamSchema = z.object({
  name: z.string().min(1).max(255).optional(),
})

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['owner', 'admin', 'member']).default('member'),
})

const updateMemberSchema = z.object({
  role: z.enum(['owner', 'admin', 'member']),
})

app.use('/*', authMiddleware)

app.get('/', async (c) => {
  const userId = c.get('userId')
  
  const userTeams = await db
    .select({
      id: teams.id,
      name: teams.name,
      createdAt: teams.createdAt,
      role: teamMembers.role,
    })
    .from(teams)
    .innerJoin(teamMembers, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, userId))
  
  return c.json(userTeams)
})

app.post('/', zValidator('json', createTeamSchema), async (c) => {
  const userId = c.get('userId')
  const { name } = c.req.valid('json')
  
  const [team] = await db.insert(teams).values({ name }).returning()
  
  await db.insert(teamMembers).values({
    teamId: team.id,
    userId,
    role: 'owner',
  })
  
  return c.json(team, 201)
})

app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const teamId = c.req.param('id')
  
  const [membership] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
  
  if (!membership) {
    return c.json({ error: 'Team not found or access denied' }, 404)
  }
  
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId))
  
  return c.json({ ...team, role: membership.role })
})

app.patch('/:id', zValidator('json', updateTeamSchema), async (c) => {
  const userId = c.get('userId')
  const teamId = c.req.param('id')
  const updates = c.req.valid('json')
  
  const [membership] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
  
  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }
  
  const [updated] = await db
    .update(teams)
    .set(updates)
    .where(eq(teams.id, teamId))
    .returning()
  
  return c.json(updated)
})

app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const teamId = c.req.param('id')
  
  const [membership] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
  
  if (!membership || membership.role !== 'owner') {
    return c.json({ error: 'Only team owners can delete teams' }, 403)
  }
  
  await db.delete(teams).where(eq(teams.id, teamId))
  
  return c.json({ success: true })
})

app.get('/:id/members', async (c) => {
  const userId = c.get('userId')
  const teamId = c.req.param('id')
  
  const [membership] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
  
  if (!membership) {
    return c.json({ error: 'Team not found or access denied' }, 404)
  }
  
  const members = await db
    .select({
      id: teamMembers.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId))
  
  return c.json(members)
})

app.post('/:id/members', zValidator('json', addMemberSchema), async (c) => {
  const currentUserId = c.get('userId')
  const teamId = c.req.param('id')
  const { userId, role } = c.req.valid('json')
  
  const [membership] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, currentUserId)))
  
  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }
  
  const [newMember] = await db
    .insert(teamMembers)
    .values({ teamId, userId, role })
    .returning()
  
  return c.json(newMember, 201)
})

app.patch('/:id/members/:memberId', zValidator('json', updateMemberSchema), async (c) => {
  const currentUserId = c.get('userId')
  const teamId = c.req.param('id')
  const memberId = c.req.param('memberId')
  const { role } = c.req.valid('json')
  
  const [membership] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, currentUserId)))
  
  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }
  
  const [updated] = await db
    .update(teamMembers)
    .set({ role })
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)))
    .returning()
  
  return c.json(updated)
})

app.delete('/:id/members/:memberId', async (c) => {
  const currentUserId = c.get('userId')
  const teamId = c.req.param('id')
  const memberId = c.req.param('memberId')
  
  const [membership] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, currentUserId)))
  
  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }
  
  await db.delete(teamMembers).where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, teamId)))
  
  return c.json({ success: true })
})

export default app
