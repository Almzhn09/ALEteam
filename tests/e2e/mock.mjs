import { chromium } from 'playwright-core';
const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const OUT = '.local/e2e-shots/';
import { mkdirSync } from 'node:fs'; mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge', headless: true });
const errors = []; const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };

async function newPage(width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${width}] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${width}] pageerror ${e.message}`));
  return page;
}
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// Layout across widths
for (const width of [360, 768, 1440]) {
  const page = await newPage(width);
  for (const [name, path] of [['home', '/'], ['catalog', '/catalog?q=библиотека'], ['doc', '/documents/demo-doc-01'], ['favorites', '/favorites'], ['about', '/about'], ['login', '/login'], ['404', '/nope']]) {
    await page.goto(BASE + path); await page.waitForTimeout(900);
    check(`no h-scroll ${name}@${width}`, await noHScroll(page));
    await page.screenshot({ path: `${OUT}${name}-${width}.png`, fullPage: name !== 'doc' });
  }
  await page.context().close();
}

// Main path at phone width
const page = await newPage(360);
await page.goto(BASE + '/');
await page.fill('#hero-q', 'библиотека'); await page.keyboard.press('Enter');
await page.waitForURL(/catalog\?q=/); await page.waitForSelector('.doc-card');
const found = await page.locator('[role=status]').first().innerText();
check('search via home', /Найдено: 4/.test(found), found);
// filter type via URL + back keeps results
await page.goto(BASE + '/catalog?q=библиотека&yearFrom=1950&yearTo=2000'); await page.waitForTimeout(900);
const filtered = await page.locator('.results-head [role=status]').innerText();
check('year filter', /Найдено: 2/.test(filtered), filtered);
await page.locator('.doc-card h3 a').first().click(); await page.waitForURL(/documents\//);
await page.waitForSelector('#doc-title');
await page.goBack(); await page.waitForTimeout(900);
check('back keeps filters', page.url().includes('yearFrom=1950') && /Найдено: 2/.test(await page.locator('.results-head [role=status]').innerText()));
// invalid params
await page.goto(BASE + '/catalog?yearFrom=3000&type=XXX'); await page.waitForTimeout(900);
check('invalid url params notice', await page.getByText('Часть параметров ссылки не распознана').isVisible());
// empty
await page.goto(BASE + '/catalog?q=zzzzqqq'); await page.waitForTimeout(900);
check('empty state', await page.getByRole('heading', { name: 'Ничего не найдено' }).isVisible());

// Document + viewer + favorites
await page.goto(BASE + '/documents/demo-doc-01'); await page.waitForSelector('.viewer img', { state: 'visible' });
await page.locator('.viewer-stage').focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300);
check('viewer paging by keyboard', /Лист 2 из 3/.test(await page.locator('.viewer-toolbar').innerText()));
await page.keyboard.press('+');
check('viewer zoom', /150%/.test(await page.locator('.viewer-toolbar').innerText()));
await page.getByRole('button', { name: /Добавить в избранное/ }).first().click();
await page.goto(BASE + '/favorites'); await page.reload(); await page.waitForTimeout(500);
check('favorite persisted', await page.getByRole('link', { name: /история библиотеки №1/ }).isVisible());
await page.goto(BASE + '/documents/missing-doc'); await page.waitForTimeout(900);
check('doc 404', await page.getByRole('heading', { name: 'Документ не найден' }).isVisible());

// Guest prompts
await page.goto(BASE + '/documents/demo-doc-02'); await page.waitForTimeout(900);
check('guest comment prompt', await page.getByText('Войдите, чтобы оставить комментарий').isVisible());
await page.goto(BASE + '/moderation'); await page.waitForTimeout(600);
check('guest moderation prompt', await page.getByText('Требуется вход').isVisible());

// Author login and comments
async function login(email) {
  await page.goto(BASE + '/login?returnTo=%2Fdocuments%2Fdemo-doc-02%23comments');
  await page.getByLabel('Email').fill(email); await page.getByLabel('Пароль').fill('wrong-password');
  await page.getByRole('button', { name: 'Войти' }).last().click();
  await page.waitForSelector('text=Неверный email или пароль.');
  await page.getByLabel('Пароль').fill('demo-password-123');
  await page.getByRole('button', { name: 'Войти' }).last().click();
  await page.waitForURL(/documents\/demo-doc-02/);
}
await login('author@example.test');
check('login redirect', page.url().includes('/documents/demo-doc-02'));
await page.getByLabel('Ваш комментарий').fill('Очень полезный материал');
await page.getByRole('button', { name: 'Отправить', exact: true }).click();
await page.waitForSelector('text=Комментарий отправлен на проверку');
check('comment pending', true);
check('own pending shown', !!(await page.waitForSelector('text=Ваши комментарии, не видимые другим', { timeout: 5000 }).catch(() => null)));
await page.getByLabel('Ваш комментарий').fill('это мат');
await page.getByRole('button', { name: 'Отправить', exact: true }).click();
await page.waitForSelector('text=Комментарий отклонён');
check('comment rejected keeps text', (await page.getByLabel('Ваш комментарий').inputValue()) === 'это мат');
await page.getByLabel('Ваш комментарий').fill('x'.repeat(2001));
check('counter over limit disables', await page.getByRole('button', { name: 'Отправить', exact: true }).isDisabled());
await page.goto(BASE + '/moderation'); await page.waitForTimeout(600);
check('author has no moderation', await page.getByText('Нет доступа').isVisible());

// Assistant
await page.goto(BASE + '/assistant'); await page.waitForTimeout(600);
await page.getByLabel('Ваш вопрос').fill('Есть ли материалы о библиотеке?'); await page.keyboard.press('Enter');
await page.waitForSelector('.sources');
check('assistant sources', await page.locator('.sources a').count() > 0);
await page.getByLabel('Ваш вопрос').fill('Квантовая хромодинамика'); await page.keyboard.press('Enter');
await page.waitForSelector('text=В материалах архива ответа не найдено');
check('assistant no answer', true);
await page.getByLabel('Ваш вопрос').fill('ошибка сервиса'); await page.keyboard.press('Enter');
await page.waitForSelector('text=Помощник сейчас недоступен');
check('assistant 503', true);
await page.screenshot({ path: `${OUT}assistant-360.png`, fullPage: true });
await page.getByRole('button', { name: 'Выйти' }).click().catch(async () => { await page.getByRole('button', { name: 'Меню' }).click(); await page.getByRole('button', { name: 'Выйти' }).click(); });
await page.waitForTimeout(500);

// Moderator decisions
await login('moderator@example.test');
await page.goto(BASE + '/moderation'); await page.waitForSelector('.queue-item');
await page.locator('.queue-item').first().getByText('Опубликовать').click();
await page.locator('.queue-item').first().getByLabel('Причина решения').fill('Проверено');
await page.locator('.queue-item').first().getByRole('button', { name: 'Сохранить решение' }).click();
await page.waitForSelector('text=Решение сохранено');
check('moderator publish', true);
await page.screenshot({ path: `${OUT}moderation-360.png`, fullPage: true });
await page.goto(BASE + '/documents/demo-doc-02'); await page.waitForTimeout(900);
check('published visible', !!(await page.waitForSelector('.comment-list .comment:has-text("Очень полезный материал")', { timeout: 5000 }).catch(() => null)));
await page.getByRole('button', { name: 'Пожаловаться' }).first().click();
await page.getByLabel('Причина жалобы').fill('Проверка жалобы');
await page.getByRole('button', { name: 'Отправить жалобу' }).click();
await page.waitForSelector('text=Жалоба отправлена модератору.');
check('report sent', true);
await page.goto(BASE + '/moderation'); await page.waitForSelector('.queue-item');
check('reported in queue', await page.getByText('Жалобы (1)').isVisible());

// Keyboard: skip link
await page.goto(BASE + '/'); await page.keyboard.press('Tab');
check('skip link first', (await page.evaluate(() => document.activeElement?.textContent)) === 'Перейти к содержимому');

console.log(results.join('\n'));
console.log('console errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
