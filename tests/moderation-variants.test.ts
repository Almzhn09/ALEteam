import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moderateText } from '../src/server/moderation';

const roots = ['хуй', 'сука', 'пизда', 'мудак', 'қотақ', 'боқ'];
const separators = [' ', '.', '-', '/', ':', ',', '🐱', '\u200b'];
for (const [rootIndex, root] of roots.entries()) for (const [separatorIndex, separator] of separators.entries()) {
  test(`contextual separator regression ${rootIndex}-${separatorIndex}`, () => {
    const text = `ты ${[...root].join(separator)} да`;
    assert.notEqual(moderateText(text).status, 'PUBLISHED');
    assert.equal(moderateText(`Цитата «${text}».`).status, 'PENDING');
  });
}
test('HTML entity obfuscation is queued rather than published', () => {
  assert.equal(moderateText('х&#1091;й').status, 'PENDING');
});
test('short-word windows preserve ordinary sentences in Russian and Kazakh', () => {
  for (const text of ['Я и ты идём в архив.', 'У нас на фото сук дерева.', 'Мы нашли три рубля.', 'Сукно на столе у окна.', 'Қор туралы не білуге болады?', 'Бұл құжат мен үшін маңызды.', 'Ескі мектеп пен музей туралы жазба.', 'У нас есть карта.', 'Подстрахуй меня у окна.']) {
    assert.equal(moderateText(text).status, 'PUBLISHED', text);
  }
});
