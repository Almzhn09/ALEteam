// Test-only stand-ins for Artur's services (contract in docs/API.md). Not a real filter or LLM.
import { createServer } from 'node:http';
const read = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(JSON.parse(b || '{}'))); });
const send = (res, data) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
createServer(async (req, res) => {
  const { text } = await read(req);
  if (/(^|\s)мат(\s|$)/i.test(text)) return send(res, { status: 'REJECTED', reason: 'PROFANITY', version: 'stub-v1' });
  if (/спорн/i.test(text)) return send(res, { status: 'PENDING', reason: 'REVIEW_REQUIRED', version: 'stub-v1' });
  send(res, { status: 'PUBLISHED', reason: 'CLEAN', version: 'stub-v1' });
}).listen(4001, '127.0.0.1');
createServer(async (req, res) => {
  const { question } = await read(req);
  if (/библиотек/i.test(question)) return send(res, { answer: 'Заглушка: найдены демо-записи о библиотеке. <b>не HTML</b>', sourceIds: ['demo-doc-01', 'demo-doc-06'], noAnswer: false });
  if (/сбой/i.test(question)) { res.writeHead(500); return res.end(); }
  send(res, { answer: 'В корпусе нет ответа.', sourceIds: [], noAnswer: true });
}).listen(4002, '127.0.0.1');
console.log('STUBS READY');
