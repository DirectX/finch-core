import { Hono } from 'hono'
import { db } from '../db'
import { folders, projectMembers } from '../db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

const app = new Hono()

const createFolderSchema = z.object({
  projectId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
})

const updateFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().uuid().optional().nullable(),
})

app.use('/*', authMiddleware)

async function checkProjectAccess(userId: string, projectId: string) {
  const [membership] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
  return membership
}

async function buildFolderPath(parentId: string | null | undefined): Promise<string> {
  if (!parentId) return '/'
  
  const [parent] = await db.select().from(folders).where(eq(folders.id, parentId))
  if (!parent) return '/'
  
  return `${parent.path}${parent.name}/`
}

app.get('/project/:projectId', async (c) => {
  const userId = c.get('userId')
  const projectId = c.req.param('projectId')
  
  const membership = await checkProjectAccess(userId, projectId)
  if (!membership) {
    return c.json({ error: 'Project not found or access denied' }, 404)
  }
  
  const projectFolders = await db
    .select()
    .from(folders)
    .where(eq(folders.projectId, projectId))
  
  return c.json(projectFolders)
})

app.get('/project/:projectId/root', async (c) => {
  const userId = c.get('userId')
  const projectId = c.req.param('projectId')
  
  const membership = await checkProjectAccess(userId, projectId)
  if (!membership) {
    return c.json({ error: 'Project not found or access denied' }, 404)
  }
  
  const rootFolders = await db
    .select()
    .from(folders)
    .where(and(eq(folders.projectId, projectId), isNull(folders.parentId)))
  
  return c.json(rootFolders)
})

app.post('/', zValidator('json', createFolderSchema), async (c) => {
  const userId = c.get('userId')
  const { projectId, parentId, name } = c.req.valid('json')
  
  const membership = await checkProjectAccess(userId, projectId)
  if (!membership || membership.role === 'viewer') {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }
  
  const path = await buildFolderPath(parentId)
  
  const [folder] = await db
    .insert(folders)
    .values({ projectId, parentId: parentId || null, name, path })
    .returning()
  
  return c.json(folder, 201)
})

app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const folderId = c.req.param('id')
  
  const [folder] = await db.select().from(folders).where(eq(folders.id, folderId))
  
  if (!folder) {
    return c.json({ error: 'Folder not found' }, 404)
  }
  
  const membership = await checkProjectAccess(userId, folder.projectId)
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403)
  }
  
  return c.json(folder)
})

app.get('/:id/children', async (c) => {
  const userId = c.get('userId')
  const folderId = c.req.param('id')
  
  const [folder] = await db.select().from(folders).where(eq(folders.id, folderId))
  
  if (!folder) {
    return c.json({ error: 'Folder not found' }, 404)
  }
  
  const membership = await checkProjectAccess(userId, folder.projectId)
  if (!membership) {
    return c.json({ error: 'Access denied' }, 403)
  }
  
  const children = await db
    .select()
    .from(folders)
    .where(eq(folders.parentId, folderId))
  
  return c.json(children)
})

app.patch('/:id', zValidator('json', updateFolderSchema), async (c) => {
  const userId = c.get('userId')
  const folderId = c.req.param('id')
  const updates = c.req.valid('json')
  
  const [folder] = await db.select().from(folders).where(eq(folders.id, folderId))
  
  if (!folder) {
    return c.json({ error: 'Folder not found' }, 404)
  }
  
  const membership = await checkProjectAccess(userId, folder.projectId)
  if (!membership || membership.role === 'viewer') {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }
  
  const updateData: any = {}
  if (updates.name) updateData.name = updates.name
  if ('parentId' in updates) {
    updateData.parentId = updates.parentId
    updateData.path = await buildFolderPath(updates.parentId)
  }
  
  const [updated] = await db
    .update(folders)
    .set(updateData)
    .where(eq(folders.id, folderId))
    .returning()
  
  return c.json(updated)
})

app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const folderId = c.req.param('id')
  
  const [folder] = await db.select().from(folders).where(eq(folders.id, folderId))
  
  if (!folder) {
    return c.json({ error: 'Folder not found' }, 404)
  }
  
  const membership = await checkProjectAccess(userId, folder.projectId)
  if (!membership || membership.role === 'viewer') {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }
  
  await db.delete(folders).where(eq(folders.id, folderId))
  
  return c.json({ success: true })
})

export default app
