import type { CommentStatus, DocumentType } from '@/contracts/api';

// Russian source strings; components pass them through t().
export const typeLabel: Record<DocumentType, string> = {
  LETTER: 'Письмо', PHOTO: 'Фотография', MAP: 'Карта', REPORT: 'Отчёт',
};

export const sortLabel = { year_desc: 'Сначала новые', year_asc: 'Сначала старые', title: 'По названию' } as const;

export const statusLabel: Record<CommentStatus, string> = {
  PENDING: 'На проверке', PUBLISHED: 'Опубликован', REJECTED: 'Отклонён', HIDDEN: 'Скрыт модератором',
};

// Machine reasons from the API are localized here (docs/API.md, «Комментарии и решения»).
export const reasonText: Record<string, string> = {
  CLEAN: 'Проверка пройдена.',
  PROFANITY: 'Комментарий содержит ненормативную лексику или оскорбления и не может быть опубликован. Измените текст и отправьте снова.',
  REVIEW_REQUIRED: 'Комментарий будет опубликован после проверки модератором.',
  MANUAL_DECISION: 'Решение принято модератором.',
};

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
