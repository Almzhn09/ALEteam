import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/index.js';
import { db } from './db';
import { ApiError, idSchema, json, pageSchema, queryParams, readJson, rateLimit } from './http';
import { staffContext, audit } from './staff';
import { createDocumentSchema, documentMetadataSchema } from './archive-schema';
import { catalogLock, validateDocumentRevision } from './archive-publication';

const number = z.string().trim().min(1).max(80);
const title = z.string().trim().min(1).max(200);
const expectedTime = z.object({expectedUpdatedAt: z.iso.datetime()});
function stale(current: Date, expected: string) {
  if (current.toISOString() !== expected) throw new ApiError(409, 'STALE_CATALOG', 'Архивная запись изменилась. Обновите данные.');
}
async function record(kind: string, id: string) {
  idSchema.parse(id);
  if (kind === 'funds') {
    const item = await db.fund.findUnique({where: {id}});
    if (item) return {item, branchId: item.branchId, fundId: item.id};
  } else if (kind === 'inventories') {
    const item = await db.inventory.findUnique({where: {id}, include: {fund: true}});
    if (item) return {item, branchId: item.fund.branchId, fundId: item.fundId};
  } else if (kind === 'cases') {
    const item = await db.archivalCase.findUnique({where: {id}, include: {inventory: {include: {fund: true}}}});
    if (item) return {item, branchId: item.inventory.fund.branchId, fundId: item.fundId};
  } else {
    const item = await db.document.findUnique({where: {id}, include: {fund: true}});
    if (item) return {item, branchId: item.fund.branchId, fundId: item.fundId};
  }
  throw new ApiError(404, 'NOT_FOUND', 'Архивная запись не найдена.');
}
async function editableHierarchy(tx: Prisma.TransactionClient, fundId: string) {
  const count = await tx.document.count({where: {fundId, OR: [
    {isPublic: true}, {contentItem: {revisions: {some: {status: {in: ['IN_REVIEW', 'APPROVED']}}}}},
  ]}});
  if (count) throw new ApiError(409, 'HIERARCHY_IN_USE', 'Сначала снимите публикации и завершите проверку карточек этого фонда.');
}
async function list(request: Request, kind: string, id?: string) {
  const context = await staffContext(request);
  const branches = context.branches('catalog.read');
  if (branches !== null && !branches.length) throw new ApiError(403, 'FORBIDDEN', 'Недостаточно прав сотрудника.');
  if (id) {
    z.object({}).strict().parse(queryParams(request));
    const found = await record(kind, id);
    await staffContext(request, 'catalog.read', found.branchId);
    if (kind === 'documents') {
      const item = await db.document.findUniqueOrThrow({where: {id}, include: {fund: true, contentItem: {include: {revisions: {orderBy: [{locale: 'asc'}, {version: 'desc'}]}}}}});
      return json({item});
    }
    return json({item: found.item});
  }
  const p = pageSchema.extend({fundId: idSchema.optional(), includeDeleted: z.enum(['1']).optional()}).strict().parse(queryParams(request));
  const fundWhere = {...(branches === null ? {} : {branchId: {in: branches}}), ...(p.fundId ? {id: p.fundId} : {})};
  const base = {take: p.pageSize, skip: (p.page - 1) * p.pageSize, orderBy: {id: 'asc' as const}};
  if (kind === 'funds') {
    const [items, total] = await db.$transaction([db.fund.findMany({...base, where: fundWhere}), db.fund.count({where: fundWhere})]);
    return json({items, total, ...p});
  }
  if (kind === 'inventories') {
    const where = {fund: fundWhere};
    const [items, total] = await db.$transaction([db.inventory.findMany({...base, where}), db.inventory.count({where})]);
    return json({items, total, ...p});
  }
  if (kind === 'cases') {
    const where = {inventory: {fund: fundWhere}};
    const [items, total] = await db.$transaction([db.archivalCase.findMany({...base, where}), db.archivalCase.count({where})]);
    return json({items, total, ...p});
  }
  const where = {fund: fundWhere, ...(p.includeDeleted ? {} : {deletedAt: null})};
  const [items, total] = await db.$transaction([db.document.findMany({...base, where, include: {contentItem: {select: {id: true, revisions: {where: {status: {not: 'ARCHIVED'}}, select: {id: true, locale: true, version: true, status: true, updatedAt: true}, orderBy: [{locale: 'asc'}, {version: 'desc'}]}}}}}), db.document.count({where})]);
  return json({items, total, ...p});
}
async function create(request: Request, kind: string) {
  const raw = await readJson(request);
  if (kind === 'funds') {
    const p = z.object({branchId: idSchema, number, name: title, description: z.string().trim().min(1).max(2000)}).strict().parse(raw);
    const context = await staffContext(request, 'catalog.write', p.branchId);
    await rateLimit(`catalog-write:${context.user.id}`, 60, 60);
    const item = await db.$transaction(async tx => {
      await catalogLock(tx);
      const item = await tx.fund.create({data: {id: randomUUID(), ...p}});
      await audit(tx, context.user.id, 'FUND_CREATED', item.id);
      return item;
    });
    return json({item}, 201);
  }
  if (kind === 'inventories' || kind === 'cases') {
    const p = z.object({fundId: idSchema, inventoryId: kind === 'cases' ? idSchema : z.never().optional(), number, title}).strict().parse(raw);
    const fund = await db.fund.findUnique({where: {id: p.fundId}});
    if (!fund) throw new ApiError(404, 'NOT_FOUND', 'Фонд не найден.');
    const context = await staffContext(request, 'catalog.write', fund.branchId);
    await rateLimit(`catalog-write:${context.user.id}`, 60, 60);
    const item = await db.$transaction(async tx => {
      await catalogLock(tx);
      const item = kind === 'inventories'
        ? await tx.inventory.create({data: {id: randomUUID(), fundId: p.fundId, number: p.number, title: p.title}})
        : await tx.archivalCase.create({data: {id: randomUUID(), fundId: p.fundId, inventoryId: p.inventoryId!, number: p.number, title: p.title}});
      await audit(tx, context.user.id, kind === 'cases' ? 'CASE_CREATED' : 'INVENTORY_CREATED', item.id);
      return item;
    });
    return json({item}, 201);
  }
  const p = createDocumentSchema.parse(raw);
  const fund = await db.fund.findUnique({where: {id: p.fundId}});
  if (!fund) throw new ApiError(404, 'NOT_FOUND', 'Фонд не найден.');
  const context = await staffContext(request, 'catalog.write', fund.branchId);
  await rateLimit(`catalog-write:${context.user.id}`, 60, 60);
  const result = await db.$transaction(async tx => {
    await catalogLock(tx);
    const id = randomUUID();
    const {fundId, isDemo, internalNotes, ...publicFields} = p;
    const payload = documentMetadataSchema.parse({...publicFields, allowDigitalCopy: false});
    const contentItem = await tx.contentItem.create({data: {slug: '_archive-' + id, kind: 'ARCHIVE_DOCUMENT', branchId: fund.branchId, isDemo}});
    const item = await tx.document.create({data: {id, fundId, isDemo, internalNotes, ...payload, isPublic: false, contentItemId: contentItem.id}});
    await validateDocumentRevision(tx, contentItem.id, 'ru', payload);
    const revision = await tx.contentRevision.create({data: {itemId: contentItem.id, locale: 'ru', version: 1, payload, authorId: context.user.id, catalogBaseVersion: 0}});
    await audit(tx, context.user.id, 'DOCUMENT_DRAFT_CREATED', id);
    return {item, revision};
  });
  return json(result, 201);
}
export async function archiveRecords(request: Request, kind: string, id?: string) {
  if (request.method === 'GET') return list(request, kind, id);
  if (request.method === 'POST') return create(request, kind);
  idSchema.parse(id);
  const found = await record(kind, id!);
  const context = await staffContext(request, 'catalog.write', found.branchId);
  await rateLimit(`catalog-write:${context.user.id}`, 60, 60);
  const raw = await readJson(request, 4096);
  if (kind === 'documents') {
    const p = request.method === 'DELETE' ? expectedTime.strict().parse(raw)
      : expectedTime.extend({internalNotes: z.string().trim().max(2000).nullable()}).strict().parse(raw);
    const item = await db.$transaction(async tx => {
      await catalogLock(tx);
      const current = await tx.document.findUniqueOrThrow({where: {id}});
      stale(current.updatedAt, p.expectedUpdatedAt);
      if (current.deletedAt) throw new ApiError(404, 'NOT_FOUND', 'Документ не найден.');
      if (request.method === 'DELETE') {
        const active = current.contentItemId && await tx.contentRevision.count({where: {itemId: current.contentItemId, status: {in: ['IN_REVIEW', 'APPROVED', 'PUBLISHED']}}});
        if (current.isPublic || active) throw new ApiError(409, 'DOCUMENT_IN_USE', 'Сначала снимите публикацию и завершите проверку документа.');
      }
      const data = request.method === 'DELETE' ? {deletedAt: new Date(), isPublic: false, allowDigitalCopy: false} : {internalNotes: ('internalNotes' in p ? p.internalNotes as string | null : null)};
      const item = await tx.document.update({where: {id}, data: {...data, updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1))}});
      await audit(tx, context.user.id, request.method === 'DELETE' ? 'DOCUMENT_TRASHED' : 'DOCUMENT_NOTES_UPDATED', id!);
      return item;
    });
    return json({item});
  }
  const patch = kind === 'funds' ? {number: number.optional(), name: title.optional(), description: z.string().trim().min(1).max(2000).optional()}
    : {number: number.optional(), title: title.optional()};
  const p = request.method === 'DELETE' ? expectedTime.strict().parse(raw) : expectedTime.extend(patch).strict().parse(raw);
  const item = await db.$transaction(async tx => {
    await catalogLock(tx);
    await editableHierarchy(tx, found.fundId);
    const current = kind === 'funds' ? await tx.fund.findUniqueOrThrow({where: {id}})
      : kind === 'inventories' ? await tx.inventory.findUniqueOrThrow({where: {id}}) : await tx.archivalCase.findUniqueOrThrow({where: {id}});
    stale(current.updatedAt, p.expectedUpdatedAt);
    let item;
    if (request.method === 'DELETE') {
      item = kind === 'funds' ? await tx.fund.delete({where: {id}})
        : kind === 'inventories' ? await tx.inventory.delete({where: {id}}) : await tx.archivalCase.delete({where: {id}});
    } else {
      const {expectedUpdatedAt: _, ...fields} = p;
      if (!Object.keys(fields).length) throw new ApiError(400, 'EMPTY_UPDATE', 'Укажите изменяемые поля.');
      const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
      item = kind === 'funds' ? await tx.fund.update({where: {id}, data: {...fields, updatedAt}})
        : kind === 'inventories' ? await tx.inventory.update({where: {id}, data: {...fields, updatedAt}}) : await tx.archivalCase.update({where: {id}, data: {...fields, updatedAt}});
    }
    await audit(tx, context.user.id, request.method === 'DELETE' ? 'HIERARCHY_DELETED' : 'HIERARCHY_UPDATED', id!);
    return item;
  });
  return json({item});
}
export async function restoreDocument(request: Request, id: string) {
  const found = await record('documents', id);
  const context = await staffContext(request, 'catalog.write', found.branchId);
  const p = expectedTime.strict().parse(await readJson(request, 1024));
  await rateLimit(`catalog-write:${context.user.id}`, 60, 60);
  const item = await db.$transaction(async tx => {
    await catalogLock(tx);
    const current = await tx.document.findUniqueOrThrow({where: {id}});
    stale(current.updatedAt, p.expectedUpdatedAt);
    if (!current.deletedAt) throw new ApiError(409, 'NOT_TRASHED', 'Документ уже восстановлен.');
    const item = await tx.document.update({where: {id}, data: {deletedAt: null, isPublic: false, allowDigitalCopy: false, updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1))}});
    await audit(tx, context.user.id, 'DOCUMENT_RESTORED', id);
    return item;
  });
  return json({item});
}
