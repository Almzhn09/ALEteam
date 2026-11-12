// Immutable private staging. The client never chooses a storage path or URL.
import {createHash, randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {mkdir, open, realpath, link, unlink} from 'node:fs/promises';
import path from 'node:path';
import {ApiError} from './http';
import type {UploadMime} from '../contracts/uploads';
export const uploadMaxBytes = 20 * 1024 * 1024;
const keyPattern = /^uploads\/[a-f0-9-]{36}\.bin$/u;
function signature(bytes: Buffer): UploadMime | undefined {
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.subarray(0,3).equals(Buffer.from([255,216,255]))) return 'image/jpeg';
  if (bytes.subarray(0,4).equals(Buffer.from([80,75,3,4]))) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (bytes.subarray(0,5).toString() === '%PDF-') return 'application/pdf';
}
async function directory(root: string) {
  await mkdir(root, {recursive: true}); const base = await realpath(root);
  await mkdir(path.join(base, 'uploads'), {recursive: true, mode: 0o700});
  const folder = await realpath(path.join(base, 'uploads'));
  if (!folder.startsWith(base + path.sep)) throw Error('Unsafe upload directory');
  return {base, folder};
}
export async function stageUpload(request: Request, expected: {bytes: number; sha256: string; mime: UploadMime}, root: string) {
  if (!Number.isSafeInteger(expected.bytes) || expected.bytes < 1 || expected.bytes > uploadMaxBytes || !/^[a-f0-9]{64}$/u.test(expected.sha256)) throw Error('Invalid upload declaration');
  if (!request.body) throw new ApiError(400, 'UPLOAD_SIZE_MISMATCH', 'Размер загруженного файла не совпадает с заявленным.');
  const {folder} = await directory(root); const id = randomUUID();
  const partial = path.join(folder, id + '.part'), final = path.join(folder, id + '.bin');
  const reader = request.body.getReader(); const hash = createHash('sha256');
  let bytes = 0, header = Buffer.alloc(0), finalized = false;
  const handle = await open(partial, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  let timedOut = false;
  const timeout = setTimeout(() => {timedOut = true; void reader.cancel().catch(() => {});}, 30000);
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > expected.bytes || bytes > uploadMaxBytes) {await reader.cancel(); throw new ApiError(413, 'UPLOAD_SIZE_MISMATCH', 'Размер загруженного файла не совпадает с заявленным.');}
      if (header.length < 16) header = Buffer.concat([header, Buffer.from(chunk.value.subarray(0, 16 - header.length))]);
      hash.update(chunk.value);
      // FileHandle.write can be partial; writeFile consumes the whole supplied chunk.
      await handle.writeFile(chunk.value);
    }
    if (timedOut) throw new ApiError(408, 'UPLOAD_TIMEOUT', 'Время загрузки файла истекло. Повторите загрузку.');
    if (bytes !== expected.bytes) throw new ApiError(400, 'UPLOAD_SIZE_MISMATCH', 'Размер загруженного файла не совпадает с заявленным.');
    const sha256 = hash.digest('hex');
    if (sha256 !== expected.sha256) throw new ApiError(400, 'UPLOAD_CHECKSUM_MISMATCH', 'Контрольная сумма файла не совпадает с заявленной.');
    if (signature(header) !== expected.mime) throw new ApiError(400, 'UPLOAD_SIGNATURE_MISMATCH', 'Сигнатура файла не соответствует выбранному формату.');
    await handle.sync();
    // link is exclusive: an existing final object can never be overwritten by a retry.
    await link(partial, final); finalized = true;
    return {storageKey: 'uploads/' + id + '.bin', bytes, sha256};
  } catch (error) {
    if (finalized) await unlink(final).catch(() => {});
    throw error;
  } finally {
    clearTimeout(timeout); await handle.close(); await unlink(partial).catch(() => {});
  }
}
export async function readStagedUpload(record: {storageKey: string; expectedBytes: number; expectedSha256: string; mimeType: string}, root: string) {
  if (!keyPattern.test(record.storageKey)) throw new ApiError(404, 'NOT_FOUND', 'Файл не найден.');
  const {base} = await directory(root);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const location = await realpath(path.join(base, record.storageKey));
    if (!location.startsWith(base + path.sep)) throw Error('path');
    handle = await open(location, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== record.expectedBytes || stat.size > uploadMaxBytes) throw Error('size');
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of handle.createReadStream({autoClose: false})) {
      size += chunk.length; if (size > record.expectedBytes || size > uploadMaxBytes) throw Error('size');
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks);
    if (size !== record.expectedBytes || createHash('sha256').update(bytes).digest('hex') !== record.expectedSha256 || signature(bytes) !== record.mimeType) throw Error('checksum');
    return bytes;
  } catch {
    throw new ApiError(404, 'NOT_FOUND', 'Файл не найден.');
  } finally {await handle?.close();}
}
export async function removeStagedUpload(storageKey: string, root: string) {
  if (!keyPattern.test(storageKey)) throw Error('Invalid owned upload key');
  const {folder} = await directory(root);
  await unlink(path.join(folder, path.basename(storageKey))).catch(error => {if (error.code !== 'ENOENT') throw error;});
}
