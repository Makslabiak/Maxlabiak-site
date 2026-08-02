/**
 * screenshot.service.js — снимок первого экрана через Playwright.
 *
 * Заодно снимаем то, что по голому HTML не определить: реально ли
 * заголовок и кнопка видны без прокрутки. Позиции элементов читаем
 * в браузере через getBoundingClientRect().
 *
 * Playwright грузим динамическим import: если браузер не установлен,
 * аудит должен продолжать работать без скриншота, а не падать.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCREENSHOT, CTA_WORDS, FIRST_SCREEN_TEXT_LIMIT } from '../config/audit-rules.js';
import { log } from '../utils/logger.js';

const TEMP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'temp');

// Всё, что не влияет на первый экран, но тормозит загрузку
const BLOCKED_RESOURCES = new Set(['media', 'websocket', 'eventsource']);
const BLOCKED_URL_RE = /(googletagmanager|google-analytics|mc\.yandex|vk\.com\/rtrg|facebook\.net|hotjar|doubleclick|criteo)/i;

export async function captureScreenshot(url, auditId) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    log.warn('playwright_missing', { auditId });
    return { ok: false, reason: 'playwright_missing' };
  }

  await fs.mkdir(TEMP_DIR, { recursive: true });

  let browser;
  try {
    browser = await launchBrowser(chromium);
    const context = await browser.newContext({
      viewport: { width: SCREENSHOT.mobile.width, height: SCREENSHOT.mobile.height },
      deviceScaleFactor: SCREENSHOT.mobile.deviceScaleFactor,
      isMobile: true,
      hasTouch: true,
      locale: 'ru-RU',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      acceptDownloads: false
    });
    context.setDefaultTimeout(SCREENSHOT.timeoutMs);

    await context.route('**/*', (route) => {
      const req = route.request();
      if (BLOCKED_RESOURCES.has(req.resourceType()) || BLOCKED_URL_RE.test(req.url())) return route.abort();
      return route.continue();
    });

    const page = await context.newPage();
    page.on('dialog', (d) => d.dismiss().catch(() => {}));

    // domcontentloaded, а не networkidle: аналитика и чаты могут держать
    // соединение открытым бесконечно, а первый экран давно готов
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: SCREENSHOT.timeoutMs });
    await page.waitForTimeout(2500); // даём дорисоваться шрифтам и hero-картинке

    const viewportInfo = await analyzeViewport(page);

    const filename = `${auditId}.jpg`;
    await page.screenshot({
      path: path.join(TEMP_DIR, filename),
      type: 'jpeg',
      quality: SCREENSHOT.quality,
      fullPage: false
    });

    await context.close();
    return { ok: true, filename, url: `/audit-screenshots/${filename}`, viewport: viewportInfo };
  } catch (err) {
    log.warn('screenshot_failed', { auditId, name: err?.name, message: String(err?.message).slice(0, 120) });
    return { ok: false, reason: err?.name === 'TimeoutError' ? 'timeout' : 'failed' };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Запуск браузера с фолбэком на системный Chrome.
 *
 * Свежие версии Playwright не ставят собственный Chromium на старые
 * macOS (12 и ниже) — там установка падает с «does not support chromium
 * on mac12». В этом случае берём уже установленный в системе Google Chrome:
 * для снятия скриншота его достаточно. На сервере (Linux) отработает
 * первая ветка, и до фолбэка дело не дойдёт.
 */
async function launchBrowser(chromium) {
  const args = ['--disable-dev-shm-usage'];
  try {
    return await chromium.launch({ args });
  } catch (err) {
    log.warn('bundled_chromium_unavailable', { message: String(err?.message).slice(0, 100) });
    return await chromium.launch({ args, channel: 'chrome' });
  }
}

/**
 * Что видно без прокрутки. Считается ВНУТРИ страницы:
 * элемент попадает в первый экран, если его верх выше нижней границы окна.
 * Ничего не кликаем и не отправляем — только читаем.
 */
async function analyzeViewport(page) {
  try {
    return await page.evaluate((cfg) => {
      const vh = window.innerHeight;
      const visible = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || +style.opacity === 0) return false;
        return r.top < vh && r.bottom > 0 && r.width > 0 && r.height > 0;
      };

      const h1 = document.querySelector('h1');
      const clickables = [...document.querySelectorAll('a, button, [role=button], input[type=submit]')];
      const ctaVisible = clickables.some((el) => {
        const t = (el.value || el.textContent || '').trim().toLowerCase();
        return t.length < 60 && cfg.ctaWords.some((w) => t.includes(w)) && visible(el);
      });
      const contactVisible = [...document.querySelectorAll('a[href^="tel:"], a[href*="wa.me"], a[href*="t.me"]')]
        .some(visible);

      // Текст, реально попавший в первый экран
      let firstScreenText = 0;
      for (const el of document.querySelectorAll('body *')) {
        if (el.children.length) continue;
        const r = el.getBoundingClientRect();
        if (r.top < vh && r.bottom > 0) firstScreenText += (el.textContent || '').trim().length;
      }

      return {
        h1Visible: visible(h1),
        h1Text: h1 ? (h1.textContent || '').trim().slice(0, 160) : null,
        ctaVisible,
        contactVisible,
        firstScreenTextLength: firstScreenText,
        tooMuchText: firstScreenText > cfg.textLimit,
        documentHeight: document.documentElement.scrollHeight
      };
    }, { ctaWords: CTA_WORDS, textLimit: FIRST_SCREEN_TEXT_LIMIT });
  } catch {
    return null;
  }
}

/**
 * Удаление скриншотов старше TTL. Вызывается по расписанию из server.js —
 * без этого папка temp растёт бесконечно.
 */
export async function cleanupScreenshots(ttlHours = 24) {
  try {
    const files = await fs.readdir(TEMP_DIR);
    const deadline = Date.now() - ttlHours * 3600 * 1000;
    let removed = 0;
    for (const file of files) {
      if (!/\.(jpg|jpeg|png|webp)$/i.test(file)) continue;
      const full = path.join(TEMP_DIR, file);
      const stat = await fs.stat(full).catch(() => null);
      if (stat && stat.mtimeMs < deadline) {
        await fs.unlink(full).catch(() => {});
        removed++;
      }
    }
    if (removed) log.info('screenshots_cleaned', { removed });
  } catch { /* папки может ещё не быть — не страшно */ }
}

export { TEMP_DIR };
