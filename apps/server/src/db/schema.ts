import { pgTable, uuid, text, timestamp, integer, decimal, date, pgEnum, uniqueIndex, jsonb, type PgTableWithColumns } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const teamRoleEnum = pgEnum('team_role', ['owner', 'admin', 'member'])
export const projectRoleEnum = pgEnum('project_role', ['owner', 'editor', 'viewer'])
export const contractStatusEnum = pgEnum('contract_status', ['draft', 'review', 'critical', 'active', 'expired'])
export const reviewStatusEnum = pgEnum('review_status', ['pending', 'approved', 'rejected'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const teamMembers = pgTable('team_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: teamRoleEnum('role').notNull().default('member'),
}, (t) => [uniqueIndex('team_members_team_user_idx').on(t.teamId, t.userId)])

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const projectMembers = pgTable('project_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: projectRoleEnum('role').notNull().default('editor'),
}, (t) => [uniqueIndex('project_members_project_user_idx').on(t.projectId, t.userId)])

export const folders: PgTableWithColumns<any> = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references((): any => folders.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  path: text('path').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const contracts = pgTable('contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  counterparty: text('counterparty'),
  status: contractStatusEnum('status').notNull().default('draft'),
  assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  value: decimal('value', { precision: 15, scale: 2 }),
  contractType: text('contract_type'),
  category: text('category'),
  signedDate: date('signed_date'),
  expiresAt: date('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const documentVersions: PgTableWithColumns<any> = pgTable('document_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  contractId: uuid('contract_id')
    .notNull()
    .references(() => contracts.id, { onDelete: 'cascade' }),
  parentVersionId: uuid('parent_version_id').references((): any => documentVersions.id),
  versionNumber: integer('version_number').notNull(),
  clauseTreeJson: jsonb('clause_tree_json').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const clauses: PgTableWithColumns<any> = pgTable('clauses', {
  id: uuid('id').primaryKey().defaultRandom(),
  versionId: uuid('version_id')
    .notNull()
    .references(() => documentVersions.id, { onDelete: 'cascade' }),
  clauseUuid: uuid('clause_uuid').notNull(),
  title: text('title').notNull(),
  contentHash: text('content_hash').notNull(),
  role: text('role'),
  domain: text('domain'),
  riskScore: integer('risk_score'),
  level: integer('level').notNull(),
  parentClauseId: uuid('parent_clause_id').references((): any => clauses.id),
  fullText: text('full_text').notNull(),
})

export const clauseComments = pgTable('clause_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  clauseId: uuid('clause_id')
    .notNull()
    .references(() => clauses.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  commentText: text('comment_text').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const clauseReviews = pgTable('clause_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  clauseId: uuid('clause_id')
    .notNull()
    .references(() => clauses.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: reviewStatusEnum('status').notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  contractId: uuid('contract_id')
    .notNull()
    .references(() => contracts.id, { onDelete: 'cascade' }),
  folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
  filename: text('filename').notNull(),
  s3Key: text('s3_key').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => users.id),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
})

export const aiAnalyses = pgTable('ai_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  versionId: uuid('version_id')
    .notNull()
    .references(() => documentVersions.id, { onDelete: 'cascade' }),
  analysisType: text('analysis_type').notNull(),
  resultJson: jsonb('result_json').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const usersRelations = relations(users, ({ many }) => ({
  teamMembers: many(teamMembers),
  projectMembers: many(projectMembers),
  assignedContracts: many(contracts),
  createdVersions: many(documentVersions),
  comments: many(clauseComments),
  reviews: many(clauseReviews),
  uploadedDocuments: many(documents),
}))

export const teamsRelations = relations(teams, ({ many }) => ({
  members: many(teamMembers),
  projects: many(projects),
}))

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}))

export const projectsRelations = relations(projects, ({ one, many }) => ({
  team: one(teams, { fields: [projects.teamId], references: [teams.id] }),
  members: many(projectMembers),
  folders: many(folders),
  contracts: many(contracts),
}))

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
}))

export const foldersRelations = relations(folders, ({ one, many }) => ({
  project: one(projects, { fields: [folders.projectId], references: [projects.id] }),
  parent: one(folders, { fields: [folders.parentId], references: [folders.id], relationName: 'folder_parent' }),
  children: many(folders, { relationName: 'folder_parent' }),
  contracts: many(contracts),
  documents: many(documents),
}))

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  project: one(projects, { fields: [contracts.projectId], references: [projects.id] }),
  folder: one(folders, { fields: [contracts.folderId], references: [folders.id] }),
  assignedUser: one(users, { fields: [contracts.assignedTo], references: [users.id] }),
  versions: many(documentVersions),
  documents: many(documents),
}))

export const documentVersionsRelations = relations(documentVersions, ({ one, many }) => ({
  contract: one(contracts, { fields: [documentVersions.contractId], references: [contracts.id] }),
  parentVersion: one(documentVersions, { fields: [documentVersions.parentVersionId], references: [documentVersions.id], relationName: 'version_parent' }),
  childVersions: many(documentVersions, { relationName: 'version_parent' }),
  createdByUser: one(users, { fields: [documentVersions.createdBy], references: [users.id] }),
  clauses: many(clauses),
  analyses: many(aiAnalyses),
}))

export const clausesRelations = relations(clauses, ({ one, many }) => ({
  version: one(documentVersions, { fields: [clauses.versionId], references: [documentVersions.id] }),
  parentClause: one(clauses, { fields: [clauses.parentClauseId], references: [clauses.id], relationName: 'clause_parent' }),
  children: many(clauses, { relationName: 'clause_parent' }),
  comments: many(clauseComments),
  reviews: many(clauseReviews),
}))

export const clauseCommentsRelations = relations(clauseComments, ({ one }) => ({
  clause: one(clauses, { fields: [clauseComments.clauseId], references: [clauses.id] }),
  user: one(users, { fields: [clauseComments.userId], references: [users.id] }),
}))

export const clauseReviewsRelations = relations(clauseReviews, ({ one }) => ({
  clause: one(clauses, { fields: [clauseReviews.clauseId], references: [clauses.id] }),
  user: one(users, { fields: [clauseReviews.userId], references: [users.id] }),
}))

export const documentsRelations = relations(documents, ({ one }) => ({
  contract: one(contracts, { fields: [documents.contractId], references: [contracts.id] }),
  folder: one(folders, { fields: [documents.folderId], references: [folders.id] }),
  uploadedByUser: one(users, { fields: [documents.uploadedBy], references: [users.id] }),
}))

export const aiAnalysesRelations = relations(aiAnalyses, ({ one }) => ({
  version: one(documentVersions, { fields: [aiAnalyses.versionId], references: [documentVersions.id] }),
}))
