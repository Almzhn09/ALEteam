// One public visibility policy for the archive hierarchy. Staff reads use their own scoped gates.
import {Prisma} from '../generated/prisma/index.js';
export const publicBranchScope = {
  OR: [{branchId: null}, {branch: {isPublic: true}}],
} satisfies Prisma.FundWhereInput & Prisma.ContentItemWhereInput;
export const publicDocumentWhere = {
  isPublic: true, deletedAt: null, fund: publicBranchScope,
} satisfies Prisma.DocumentWhereInput;
export const publicContentScope = {
  kind: {not: 'ARCHIVE_DOCUMENT' as const}, ...publicBranchScope,
} satisfies Prisma.ContentItemWhereInput;
// Constant aliases only; no caller-provided identifiers are interpolated into SQL.
export const publicDocumentSql = Prisma.sql`d."isPublic" = true AND d."deletedAt" IS NULL
  AND EXISTS (SELECT 1 FROM "Fund" visibility_fund LEFT JOIN "ArchiveBranch" visibility_branch
    ON visibility_branch.id = visibility_fund."branchId"
    WHERE visibility_fund.id = d."fundId" AND (visibility_fund."branchId" IS NULL OR visibility_branch."isPublic" = true))`;
