import { Hono } from 'hono'
import { db } from '../db'
import { clauses, clauseComments, clauseReviews, documentVersions, contracts, projectMembers } from '../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

const app = new Hono()

const createCommentSchema = z.object({
  commentText: z.string().min(1),
})

const createReviewSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']),
  reason: z.string().optional(),
})

app.use('/*', authMiddleware)

async function checkClauseAccess(userId: string, clauseId: string) {
  const [clause] = await db
    .select({
      clauseId: clauses.id,
      versionId: documentVersions.id,
      contractId: contracts.id,
      projectId: contracts.projectId,
    })
    .from(clauses)
    .innerJoin(documentVersions, eq(clauses.versionId, documentVersions.id))
    .innerJoin(contracts, eq(documentVersions.contractId, contracts.id))
    .where(eq(clauses.id, clauseId))

  if (!clause) return null

  const [membership] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, clause.projectId), eq(projectMembers.userId, userId)))

  return membership ? clause : null
}

app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const clauseId = c.req.param('id')

  const access = await checkClauseAccess(userId, clauseId)
  if (!access) {
    return c.json({ error: 'Clause not found or access denied' }, 404)
  }

  const [clause] = await db
    .select()
    .from(clauses)
    .where(eq(clauses.id, clauseId))

  return c.json(clause)
})

app.get('/:id/comments', async (c) => {
  const userId = c.get('userId')
  const clauseId = c.req.param('id')

  const access = await checkClauseAccess(userId, clauseId)
  if (!access) {
    return c.json({ error: 'Clause not found or access denied' }, 404)
  }

  const comments = await db
    .select({
      id: clauseComments.id,
      commentText: clauseComments.commentText,
      createdAt: clauseComments.createdAt,
      userId: clauseComments.userId,
    })
    .from(clauseComments)
    .where(eq(clauseComments.clauseId, clauseId))
    .orderBy(desc(clauseComments.createdAt))

  return c.json(comments)
})

app.post('/:id/comments', zValidator('json', createCommentSchema), async (c) => {
  const userId = c.get('userId')
  const clauseId = c.req.param('id')
  const { commentText } = c.req.valid('json')

  const access = await checkClauseAccess(userId, clauseId)
  if (!access) {
    return c.json({ error: 'Clause not found or access denied' }, 404)
  }

  const [comment] = await db
    .insert(clauseComments)
    .values({
      clauseId,
      userId,
      commentText,
    })
    .returning()

  return c.json(comment, 201)
})

app.delete('/:id/comments/:commentId', async (c) => {
  const userId = c.get('userId')
  const clauseId = c.req.param('id')
  const commentId = c.req.param('commentId')

  const access = await checkClauseAccess(userId, clauseId)
  if (!access) {
    return c.json({ error: 'Clause not found or access denied' }, 404)
  }

  const [comment] = await db
    .select()
    .from(clauseComments)
    .where(and(eq(clauseComments.id, commentId), eq(clauseComments.userId, userId)))

  if (!comment) {
    return c.json({ error: 'Comment not found or not owned by user' }, 404)
  }

  await db.delete(clauseComments).where(eq(clauseComments.id, commentId))

  return c.json({ success: true })
})

app.get('/:id/reviews', async (c) => {
  const userId = c.get('userId')
  const clauseId = c.req.param('id')

  const access = await checkClauseAccess(userId, clauseId)
  if (!access) {
    return c.json({ error: 'Clause not found or access denied' }, 404)
  }

  const reviews = await db
    .select({
      id: clauseReviews.id,
      status: clauseReviews.status,
      reason: clauseReviews.reason,
      createdAt: clauseReviews.createdAt,
      userId: clauseReviews.userId,
    })
    .from(clauseReviews)
    .where(eq(clauseReviews.clauseId, clauseId))
    .orderBy(desc(clauseReviews.createdAt))

  return c.json(reviews)
})

app.post('/:id/reviews', zValidator('json', createReviewSchema), async (c) => {
  const userId = c.get('userId')
  const clauseId = c.req.param('id')
  const { status, reason } = c.req.valid('json')

  const access = await checkClauseAccess(userId, clauseId)
  if (!access) {
    return c.json({ error: 'Clause not found or access denied' }, 404)
  }

  const existingReview = await db
    .select()
    .from(clauseReviews)
    .where(and(eq(clauseReviews.clauseId, clauseId), eq(clauseReviews.userId, userId)))

  if (existingReview.length > 0) {
    const [updated] = await db
      .update(clauseReviews)
      .set({ status, reason, createdAt: new Date() })
      .where(eq(clauseReviews.id, existingReview[0].id))
      .returning()
    return c.json(updated)
  }

  const [review] = await db
    .insert(clauseReviews)
    .values({
      clauseId,
      userId,
      status,
      reason,
    })
    .returning()

  return c.json(review, 201)
})

app.delete('/:id/reviews/:reviewId', async (c) => {
  const userId = c.get('userId')
  const clauseId = c.req.param('id')
  const reviewId = c.req.param('reviewId')

  const access = await checkClauseAccess(userId, clauseId)
  if (!access) {
    return c.json({ error: 'Clause not found or access denied' }, 404)
  }

  const [review] = await db
    .select()
    .from(clauseReviews)
    .where(and(eq(clauseReviews.id, reviewId), eq(clauseReviews.userId, userId)))

  if (!review) {
    return c.json({ error: 'Review not found or not owned by user' }, 404)
  }

  await db.delete(clauseReviews).where(eq(clauseReviews.id, reviewId))

  return c.json({ success: true })
})

export default app
