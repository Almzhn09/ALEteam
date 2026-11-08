import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const commit = '65727574dfcd264acbb0c3e07860e4e9e9b22185';
const models = {
  rus: 'e16e5e036cce1d9ec2b00063cf8b54472625b9e14d893a169e2b0dedeb4df225',
  kaz: 'fcc01eed3815a42b9c6321c4c9d3606f39b166cbf95ade98b7d8d12063eae53d',
};
await mkdir('.local/ocr/models', { recursive: true });
for (const [language, expected] of Object.entries(models)) {
  const filename = `.local/ocr/models/${language}.traineddata`;
  let bytes;
  try { bytes = await readFile(filename); } catch { /* first install */ }
  if (!bytes) {
    const response = await fetch(`https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${commit}/${language}.traineddata`, { signal: AbortSignal.timeout(60000), redirect: 'error' });
    if (!response.ok) throw new Error(`OCR_MODEL_DOWNLOAD_FAILED: ${language}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`OCR_MODEL_INTEGRITY_FAILED: ${language}`);
  await writeFile(filename, bytes);
  console.log(`${language}: pinned Tesseract fast model verified`);
}
