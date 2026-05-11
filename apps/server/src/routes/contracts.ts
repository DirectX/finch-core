import { Hono } from 'hono'
import { db } from '../db'
import { contracts, documentVersions, clauses, documents, projectMembers, folders } from '../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

const app = new Hono()

const createContractSchema = z.object({
  projectId: z.string().uuid(),
  folderId: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  counterparty: z.string().optional(),
  contractType: z.string().optional(),
  category: z.string().optional(),
  value: z.string().optional(),
  signedDate: z.string().optional(),
  expiresAt: z.string().optional(),
})

const updateContractSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  counterparty: z.string().optional(),
  status: z.enum(['draft', 'review', 'critical', 'active', 'expired']).optional(),
  assignedTo: z.string().uuid().optional(),
  contractType: z.string().optional(),
  category: z.string().optional(),
  value: z.string().optional(),
  signedDate: z.string().optional(),
  expiresAt: z.string().optional(),
  folderId: z.string().uuid().optional(),
})

app.use('/*', authMiddleware)

async function checkProjectAccess(userId: string, projectId: string) {
  const [membership] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
  return membership
}

async function checkContractAccess(userId: string, contractId: string) {
  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, contractId))

  if (!contract) return null

  const membership = await checkProjectAccess(userId, contract.projectId)
  return membership ? contract : null
}

app.get('/', async (c) => {
  const userId = c.get('userId')
  const projectId = c.req.query('projectId')
  const folderId = c.req.query('folderId')

  if (!projectId) {
    return c.json({ error: 'projectId query parameter is required' }, 400)
  }

  const access = await checkProjectAccess(userId, projectId)
  if (!access) {
    return c.json({ error: 'Project not found or access denied' }, 404)
  }

  let query = db
    .select()
    .from(contracts)
    .where(eq(contracts.projectId, projectId))
    .orderBy(desc(contracts.updatedAt))

  if (folderId) {
    query = db
      .select()
      .from(contracts)
      .where(and(eq(contracts.projectId, projectId), eq(contracts.folderId, folderId)))
      .orderBy(desc(contracts.updatedAt))
  }

  const contractsList = await query

  return c.json(contractsList)
})

app.post('/', zValidator('json', createContractSchema), async (c) => {
  const userId = c.get('userId')
  const data = c.req.valid('json')

  const access = await checkProjectAccess(userId, data.projectId)
  if (!access) {
    return c.json({ error: 'Project not found or access denied' }, 404)
  }

  if (data.folderId) {
    const [folder] = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, data.folderId), eq(folders.projectId, data.projectId)))

    if (!folder) {
      return c.json({ error: 'Folder not found in this project' }, 404)
    }
  }

  const [contract] = await db
    .insert(contracts)
    .values({
      projectId: data.projectId,
      folderId: data.folderId,
      title: data.title,
      counterparty: data.counterparty,
      contractType: data.contractType,
      category: data.category,
      value: data.value,
      signedDate: data.signedDate,
      expiresAt: data.expiresAt,
    })
    .returning()

  return c.json(contract, 201)
})

app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const contractId = c.req.param('id')

  const contract = await checkContractAccess(userId, contractId)
  if (!contract) {
    return c.json({ error: 'Contract not found or access denied' }, 404)
  }

  return c.json(contract)
})

app.patch('/:id', zValidator('json', updateContractSchema), async (c) => {
  const userId = c.get('userId')
  const contractId = c.req.param('id')
  const data = c.req.valid('json')

  const contract = await checkContractAccess(userId, contractId)
  if (!contract) {
    return c.json({ error: 'Contract not found or access denied' }, 404)
  }

  if (data.folderId) {
    const [folder] = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, data.folderId), eq(folders.projectId, contract.projectId)))

    if (!folder) {
      return c.json({ error: 'Folder not found in this project' }, 404)
    }
  }

  const [updated] = await db
    .update(contracts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(contracts.id, contractId))
    .returning()

  return c.json(updated)
})

app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const contractId = c.req.param('id')

  const contract = await checkContractAccess(userId, contractId)
  if (!contract) {
    return c.json({ error: 'Contract not found or access denied' }, 404)
  }

  await db.delete(contracts).where(eq(contracts.id, contractId))

  return c.json({ success: true })
})

app.get('/:id/versions', async (c) => {
  const userId = c.get('userId')
  const contractId = c.req.param('id')

  const contract = await checkContractAccess(userId, contractId)
  if (!contract) {
    return c.json({ error: 'Contract not found or access denied' }, 404)
  }

  const versions = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.contractId, contractId))
    .orderBy(desc(documentVersions.versionNumber))

  return c.json(versions)
})

app.get('/:id/versions/:versionId/clauses', async (c) => {
  const userId = c.get('userId')
  const contractId = c.req.param('id')
  const versionId = c.req.param('versionId')

  const contract = await checkContractAccess(userId, contractId)
  if (!contract) {
    return c.json({ error: 'Contract not found or access denied' }, 404)
  }

  const [version] = await db
    .select()
    .from(documentVersions)
    .where(and(eq(documentVersions.id, versionId), eq(documentVersions.contractId, contractId)))

  if (!version) {
    return c.json({ error: 'Version not found' }, 404)
  }

  const clausesList = await db
    .select()
    .from(clauses)
    .where(eq(clauses.versionId, versionId))

  return c.json(clausesList)
})

app.get('/:id/documents', async (c) => {
  const userId = c.get('userId')
  const contractId = c.req.param('id')

  const contract = await checkContractAccess(userId, contractId)
  if (!contract) {
    return c.json({ error: 'Contract not found or access denied' }, 404)
  }

  const documentsList = await db
    .select()
    .from(documents)
    .where(eq(documents.contractId, contractId))
    .orderBy(desc(documents.uploadedAt))

  return c.json(documentsList)
})

export default app
