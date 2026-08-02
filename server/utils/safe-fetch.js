/**
 * safe-fetch.js — загрузка HTML чужого сайта с ограничениями.
 *
 * Редиректы обрабатываем ВРУЧНУЮ (redirect: 'manual'), потому что при
 * автоматическом следовании браузерный fetch увёл бы нас куда угодно:
 * публичный домен может редиректить на http://192.168.1.1 и обойти
 * всю проверку, сделанную до запроса. Поэтому каждый следующий адрес
 * проходит валидацию заново.
 */

import { assertSafeUrl, AuditError } from './validate-url.js';

const USER_AGENT = 'Mozilla/5.0 (compatible; DarsSiteAudit/1.0; +https://dars.studio)';
const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 МБ — дальше уже не разметка, а мусор
const TIMEOUT_MS = 15000;

/**
 * @returns {Promise<{html: string, finalUrl: string, status: number, isHttps: boolean, truncated: boolean}>}
 */
export async function fetchHtml(startUrl) {
  let currentUrl = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Валидация на каждом шаге, не только на первом
    const safe = await assertSafeUrl(currentUrl);
    currentUrl = safe.url;

    let response;
    try {
      response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ru-RU,ru;q=0.9'
        }
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new AuditError('timeout', 'Сайт отвечает слишком долго');
      }
      throw new AuditError('unreachable', 'Не удалось открыть сайт. Возможно, он временно недоступен');
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new AuditError('unreachable', 'Не удалось открыть сайт. Возможно, он временно недоступен');
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (response.status === 403 || response.status === 429) {
      throw new AuditError('bot_blocked', 'Сайт закрыт от автоматических проверок');
    }
    if (!response.ok) {
      throw new AuditError('http_error', `Сайт ответил ошибкой ${response.status}`, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
      throw new AuditError('not_html', 'По этому адресу не обычная веб-страница');
    }

    const { text, truncated } = await readCapped(response);
    return {
      html: text,
      finalUrl: currentUrl,
      status: response.status,
      isHttps: new URL(currentUrl).protocol === 'https:',
      truncated
    };
  }

  throw new AuditError('too_many_redirects', 'Сайт слишком много раз перенаправляет запрос');
}

/**
 * Читаем поток кусками и обрываем на лимите — чтобы 500-мегабайтный
 * ответ не съел память сервера.
 */
async function readCapped(response) {
  if (!response.body) return { text: await response.text(), truncated: false };

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > MAX_HTML_BYTES) {
      chunks.push(value.slice(0, value.length - (received - MAX_HTML_BYTES)));
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }

  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { text: buffer.toString('utf8'), truncated };
}
