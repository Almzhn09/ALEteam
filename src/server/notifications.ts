import { z } from 'zod';
import { Prisma, type Comment } from '../generated/prisma/index.js';
import { db } from './db';
import { ApiError, idSchema, json, pageSchema, queryParams, rateLimit, readJson, requireUser } from './http';

// Call inside the same transaction that publishes a reply. No message body is copied.
export async function notifyReply(tx: Prisma.TransactionClient, comment: Comment) {
  if (!comment.parentId || comment.status !== 'PUBLISHED') return;
  const parent = await tx.comment.findFirst({ where: { id: comment.parentId, documentId: comment.documentId, status: 'PUBLISHED', document: { isPublic: true } }, include: { author: { select: { notifyReplies: true } } } });
  if (!parent || parent.authorId === comment.authorId || !parent.author.notifyReplies) return;
  await tx.notification.createMany({ data: [{ userId: parent.authorId, eventKey: `reply:${comment.id}`, kind: 'COMMENT_REPLY', commentId: comment.id }], skipDuplicates: true });
}
export async function notifyDecision(tx: Prisma.TransactionClient, comment: Comment, decisionId: string) {
  const recipient = await tx.user.findUnique({ where: { id: comment.authorId }, select: { notifyModeration: true } });
  if (!recipient?.notifyModeration) return;
  await tx.notification.create({ data: { userId: comment.authorId, eventKey: `decision:${decisionId}`, kind: 'MODERATION_DECISION', commentId: comment.id, status: comment.status } });
}
function visible(userId: string): Prisma.NotificationWhereInput {
  return { userId, comment: { document: { isPublic: true } }, OR: [
    { kind: 'MODERATION_DECISION', comment: { authorId: userId } },
    { kind: 'COMMENT_REPLY', comment: { status: 'PUBLISHED', parent: { authorId: userId, status: 'PUBLISHED' } } },
  ] };
}
export async function listNotifications(request: Request) {
  const user = await requireUser(request);
  const p = pageSchema.extend({ unread: z.enum(['1']).optional() }).strict().parse(queryParams(request));
  const where = { ...visible(user.id), ...(p.unread ? { readAt: null } : {}) };
  const [items, total, unread] = await db.$transaction([
    db.notification.findMany({ where, select: { id: true, kind: true, status: true, createdAt: true, readAt: true, commentId: true, comment: { select: { documentId: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
    db.notification.count({ where }), db.notification.count({ where: { ...visible(user.id), readAt: null } }),
  ], { isolationLevel: 'RepeatableRead' });
  return json({ items: items.map(({ comment, ...n }) => ({ ...n, documentId: comment.documentId })), total, unread, page: p.page, pageSize: p.pageSize, ownerId: user.id });
}
export async function readNotification(request: Request, id?: string) {
  const user = await requireUser(request);
  if (id) idSchema.parse(id);
  z.object({ read: z.literal(true) }).strict().parse(await readJson(request));
  await rateLimit(`notifications:${user.id}`, 100, 60);
  const where = { ...visible(user.id), ...(id ? { id } : {}) };
  if (id && !await db.notification.findFirst({ where, select: { id: true } })) throw new ApiError(404, 'NOT_FOUND', 'Уведомление не найдено.');
  await db.notification.updateMany({ where: { ...where, readAt: null }, data: { readAt: new Date() } });
  return json({ ok: true });
}
export async function notificationSettings(request: Request) {
  const user = await requireUser(request);
  if (request.method === 'GET') return json({ item: { notifyReplies: user.notifyReplies, notifyModeration: user.notifyModeration } });
  const settings = z.object({ notifyReplies: z.boolean(), notifyModeration: z.boolean() }).strict().parse(await readJson(request));
  await rateLimit(`settings:${user.id}`, 30, 60);
  await db.user.update({ where: { id: user.id }, data: settings });
  return json({ item: settings });
}
