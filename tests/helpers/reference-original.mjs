import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const priceOriginal = {
 sha256: '6480e6fd39bbf0f48c7c8396028da57d29cbec405c44a83a3ede7d575fad3b8f',
 bytes: 1636084,
 pages: 15,
};

// Check the actual public download, not just a successful seed command.
export async function verifyPriceOriginal(origin) {
 const page = await fetch(origin + '/api/content/archive-paid-services-info');
 assert.equal(page.status, 200);
 const {item} = await page.json();
 const response = await fetch(origin + '/api/discovery/materials/cms/' + item.id + '/attachments?locale=ru');
 assert.equal(response.status, 200);
 const {items} = await response.json();
 const originals = items.filter(row => row.variant === 'master' && row.sha256 === priceOriginal.sha256);
 assert.equal(originals.length, 1, 'Exactly one published official R01 original');
 const original = originals[0];
 assert.equal(original.bytes, priceOriginal.bytes);
 const download = await fetch(origin + original.href);
 assert.equal(download.status, 200);
 assert.match(download.headers.get('content-type'), /application\/pdf/);
 const bytes = Buffer.from(await download.arrayBuffer());
 assert.equal(bytes.length, priceOriginal.bytes);
 assert.equal(createHash('sha256').update(bytes).digest('hex'), priceOriginal.sha256);
 return original;
}
