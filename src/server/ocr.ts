import { createHash } from 'node:crypto';
import results from '../../data/ocr/results.json';
import { fileResponse } from './catalog';
import { ApiError, json } from './http';
export async function recognizedText(request: Request, id: string) {
  // Re-use all file visibility and storage-boundary checks, then verify the exact source bytes.
  const source = await fileResponse(request, id);
  const record = results.records.find(r => r.id === id);
  if (!record) throw new ApiError(404, 'NOT_FOUND', 'Распознанный текст пока недоступен.');
  const sourceHash = createHash('sha256').update(Buffer.from(await source.arrayBuffer())).digest('hex');
  if (sourceHash !== record.sourceSha256 || createHash('sha256').update(record.text).digest('hex') !== record.textSha256) throw new ApiError(404, 'NOT_FOUND', 'Распознанный текст пока недоступен.');
  return json({ item: { id, text: record.text, engine: results.engine, languages: results.languages,
    sourceSha256: sourceHash, isOcr: true, isDemo: record.isDemo, corrected: false } });
}
