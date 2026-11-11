import type { CatalogImportDTO } from '@/contracts/imports';

export const importStateLabel: Record<CatalogImportDTO['state'], string> = {
  READY: 'Готов к созданию черновиков', VALIDATION_FAILED: 'Есть ошибки', COMMITTED: 'Черновики созданы', ROLLED_BACK: 'Откачен', CANCELLED: 'Отменён',
};
export const rowActionLabel: Record<'CREATE' | 'UNCHANGED' | 'BLOCKED', string> = {
  CREATE: 'Будет создан', UNCHANGED: 'Без изменений', BLOCKED: 'Заблокирован',
};
