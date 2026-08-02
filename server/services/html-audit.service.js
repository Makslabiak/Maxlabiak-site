/**
 * html-audit.service.js — разбор разметки через cheerio.
 *
 * РЕДАКЦИЯ 2. Здесь только ФАКТЫ (есть/нет/сколько), без формулировок —
 * тексты живут в report.service.js.
 *
 * Ключевой принцип этой редакции: не «встретилось ли слово», а «есть ли
 * сущность». Слово «гарантия» в подвале — не гарантия. Заголовок «Отзывы»
 * без единого отзыва — не отзывы. Проверки, которые проходятся написанием
 * слова, ничего не измеряют и завышают балл проблемным сайтам.
 */

import * as cheerio from 'cheerio';
import {
  CONTENT_MARKERS, CTA_WORDS, CTA_MIN_REPEAT, GENERIC_HEADLINES,
  LENGTH_RULES, MAX_EXTERNAL_SCRIPTS, FIRST_SCREEN_TEXT_LIMIT,
  PRICE_NUMBER_RE, PRICE_PER_METER_RE, CALCULATOR_SELECTORS, CALCULATOR_WORDS,
  PHONE_FIELD_RE, STOCK_HOSTS, STOCK_FILENAME_RE,
  TRUST_MARKERS, WARRANTY_TERM_RE, CHAT_WIDGETS, CALLBACK_WORDS,
  PROOF_SELECTORS, PROOF_MIN_COUNT
} from '../config/audit-rules.js';

const RU_PHONE_RE = /(\+7|8|\+375|\+380)[\s\-(]*\d{2,3}[\s\-)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/;

const includesAny = (haystack, words) => words.some((w) => haystack.includes(w));

export function auditHtml({ html, finalUrl }) {
  const $ = cheerio.load(html);
  const hostname = new URL(finalUrl).hostname.replace(/^www\./, '');

  /* Всё, что связано со <script>, считаем ДО удаления этих тегов:
     виджеты чатов, внешние скрипты и JSON-LD живут именно там. */
  const externalScripts = $('script[src]').filter((_, el) => {
    const src = $(el).attr('src') || '';
    return /^https?:\/\//i.test(src) && !src.includes(hostname);
  }).length;
  const hasJsonLd = $('script[type="application/ld+json"]').length > 0;
  const chatWidget = detectChatWidget(html);

  // Разметку до очистки сохраняем — по ней ищем классы блоков
  const structural = {
    calculatorNodes: countAny($, CALCULATOR_SELECTORS),
    caseNodes: countAny($, PROOF_SELECTORS.cases),
    reviewNodes: countAny($, PROOF_SELECTORS.reviews),
    processNodes: countAny($, PROOF_SELECTORS.process)
  };

  const images = collectImages($, hostname);

  // Убираем невидимое, иначе в «текст страницы» попадут скрипты и стили
  $('script, style, noscript, template, svg').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const lowerText = bodyText.toLowerCase();
  const rawHtmlLower = html.toLowerCase();

  const title = ($('head title').first().text() || '').trim();
  const description = ($('meta[name="description"]').attr('content') || '').trim();
  const h1s = $('h1').map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean);

  /* ── контакты ── */
  const telLinks = $('a[href^="tel:"]').length;
  const contacts = {
    telLinks,
    phoneInText: RU_PHONE_RE.test(bodyText),
    telegram: $('a[href*="t.me"], a[href*="telegram.me"]').length > 0,
    whatsapp: $('a[href*="wa.me"], a[href*="whatsapp.com"], a[href*="api.whatsapp"]').length > 0,
    email: $('a[href^="mailto:"]').length > 0,
    chatWidget,
    callback: includesAny(lowerText, CALLBACK_WORDS)
  };

  /* ── CTA ── */
  const clickable = $('a, button, [role=button], input[type=submit]')
    .map((_, el) => ($(el).attr('value') || $(el).text() || '').replace(/\s+/g, ' ').trim().toLowerCase())
    .get().filter(Boolean);
  const ctaTexts = clickable.filter((t) => t.length < 60 && includesAny(t, CTA_WORDS));
  const cta = {
    count: ctaTexts.length,
    // Повторяется ли главное действие по странице: одна кнопка в самом низу
    // длинного лендинга работает хуже, чем та же кнопка через каждый экран
    repeated: ctaTexts.length >= CTA_MIN_REPEAT,
    samples: [...new Set(ctaTexts)].slice(0, 5)
  };

  /* ── формы и первый шаг ── */
  const forms = analyzeForms($, bodyText);

  /* ── 01: предварительный расчёт ── */
  const calculator = {
    found: structural.calculatorNodes > 0 || includesAny(lowerText, CALCULATOR_WORDS),
    byMarkup: structural.calculatorNodes > 0,
    byText: includesAny(lowerText, CALCULATOR_WORDS)
  };

  const prices = {
    hasNumbers: PRICE_NUMBER_RE.test(bodyText),
    perSquareMeter: PRICE_PER_METER_RE.test(bodyText),
    // Слово про стоимость есть, а цифр нет — самый частый случай
    wordOnly: /цен|стоимост|прайс/i.test(lowerText) && !PRICE_NUMBER_RE.test(bodyText)
  };

  /* ── 04: смета, договор, гарантии ── */
  const trust = analyzeTrust(lowerText, bodyText);

  /* ── доказательства ── */
  const proof = {
    cases: {
      blocks: structural.caseNodes,
      // Кейс без фотографии объекта доказывает мало
      withImages: structural.caseNodes > 0 && images.total >= PROOF_MIN_COUNT.cases,
      enough: structural.caseNodes >= PROOF_MIN_COUNT.cases
    },
    reviews: {
      blocks: structural.reviewNodes,
      enough: structural.reviewNodes >= PROOF_MIN_COUNT.reviews,
      mentioned: /отзыв|что говорят|благодарност/i.test(lowerText)
    },
    process: {
      blocks: structural.processNodes,
      enough: structural.processNodes >= PROOF_MIN_COUNT.process,
      mentioned: /этап|как мы работаем|как проходит|порядок работ/i.test(lowerText)
    }
  };

  /* ── прочие смысловые маркеры (география, сроки, FAQ) ── */
  const markers = {};
  for (const [key, cfg] of Object.entries(CONTENT_MARKERS)) {
    markers[key] = { label: cfg.label, found: includesAny(lowerText, cfg.words) };
  }

  const firstH1 = h1s[0] || '';

  return {
    meta: {
      title: { present: !!title, length: title.length, value: title.slice(0, 120), ok: inRange(title.length, LENGTH_RULES.title) },
      description: { present: !!description, length: description.length, ok: inRange(description.length, LENGTH_RULES.description) },
      h1: { count: h1s.length, exactlyOne: h1s.length === 1, first: firstH1.slice(0, 160) },
      lang: !!$('html').attr('lang'),
      viewport: $('meta[name="viewport"]').length > 0,
      canonical: $('link[rel="canonical"]').length > 0,
      favicon: $('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').length > 0,
      openGraph: $('meta[property^="og:"]').length > 0,
      structuredData: hasJsonLd || /itemscope|itemtype=/.test(rawHtmlLower),
      charset: $('meta[charset]').length > 0
    },
    contacts,
    forms,
    cta,
    calculator,
    prices,
    trust,
    proof,
    images,
    scripts: { external: externalScripts, tooMany: externalScripts > MAX_EXTERNAL_SCRIPTS },
    markers,
    firstScreen: {
      hasH1: h1s.length > 0,
      // Общим считаем заголовок, который ЦЕЛИКОМ состоит из шаблонной фразы.
      // Проверять startsWith нельзя: «Ремонт квартир в Москве за 30 дней»
      // начинается с «ремонт квартир», но общим уже не является.
      genericHeadline: firstH1
        ? GENERIC_HEADLINES.includes(firstH1.toLowerCase().trim().replace(/[.!?]+$/, ''))
        : null,
      hasCta: cta.count > 0,
      hasContact: contacts.telLinks > 0 || contacts.phoneInText || contacts.telegram || contacts.whatsapp,
      tooMuchText: null,   // считается по видимой области в screenshot.service
      ctaAboveFold: null,
      h1AboveFold: null
    },
    text: { length: bodyText.length, firstScreenApproxLength: Math.min(bodyText.length, FIRST_SCREEN_TEXT_LIMIT * 3) }
  };
}

/* ═══════════════ вспомогательные разборы ═══════════════ */

function countAny($, selectors) {
  let total = 0;
  for (const sel of selectors) {
    try { total += $(sel).length; } catch { /* некорректный селектор — пропускаем */ }
  }
  return total;
}

function detectChatWidget(html) {
  for (const [name, re] of Object.entries(CHAT_WIDGETS)) {
    if (re.test(html)) return { found: true, vendor: name };
  }
  return { found: false, vendor: null };
}

/**
 * Формы: главное — что просят на ПЕРВОМ шаге.
 * Телефон в качестве входного билета отсекает всех, кто ещё не решился, —
 * это и есть проблема 02 с сайта.
 */
function analyzeForms($, bodyText) {
  const $forms = $('form');
  const inputs = $forms.find('input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select');

  let phoneFields = 0;
  let onlyPhoneAsked = false;

  inputs.each((_, el) => {
    const attrs = [$(el).attr('type'), $(el).attr('name'), $(el).attr('id'),
                   $(el).attr('placeholder'), $(el).attr('autocomplete')].join(' ');
    if (PHONE_FIELD_RE.test(attrs)) phoneFields++;
  });

  // Форма из одного-двух полей, где одно из них телефон, и никакого
  // промежуточного шага — классический «оставьте номер, мы перезвоним»
  if (inputs.length > 0 && inputs.length <= 2 && phoneFields > 0) onlyPhoneAsked = true;

  const policyNear = $forms.find('a[href*="polic"], a[href*="privacy"], a[href*="konfiden"], a[href*="soglas"]').length > 0
    || /политик[аи] конфиденциальност|обработк[уи] персональных данных|соглас(ен|ие) на обработку/i.test(bodyText);

  return {
    count: $forms.length,
    fields: inputs.length,
    requiredFields: $forms.find('[required]').length,
    phoneFields,
    asksPhoneUpfront: phoneFields > 0,
    onlyPhoneAsked,
    policyNear
  };
}

/**
 * Доверие: считаем, сколько РАЗНЫХ групп признаков встретилось.
 * Одно слово «гарантия» — это одна группа из четырёх, и этого мало.
 */
function analyzeTrust(lowerText, bodyText) {
  const groups = [];
  for (const [key, words] of Object.entries(TRUST_MARKERS)) {
    if (includesAny(lowerText, words)) groups.push(key);
  }
  const term = bodyText.match(WARRANTY_TERM_RE);
  return {
    groups,
    groupCount: groups.length,
    // Срок гарантии числом — самый сильный сигнал, его нельзя написать «на всякий случай»
    warrantyTerm: term ? term[0].trim().slice(0, 40) : null,
    hasWarrantyTerm: !!term,
    enough: groups.length >= 2 || !!term
  };
}

/**
 * Изображения: помимо alt и lazy ищем следы фотобанков.
 * Стоковые фото — проблема 03 с сайта: одинаковые картинки не доказывают,
 * что компания вообще делала ремонт.
 */
function collectImages($, hostname) {
  const $imgs = $('img');
  let noAlt = 0;
  let stock = 0;
  let external = 0;
  const stockSources = new Set();

  $imgs.each((_, el) => {
    const $el = $(el);
    if (!($el.attr('alt') || '').trim()) noAlt++;

    const src = $el.attr('src') || $el.attr('data-src') || $el.attr('data-lazy-src') || '';
    if (!src) return;

    const host = STOCK_HOSTS.find((h) => src.includes(h));
    if (host || STOCK_FILENAME_RE.test(src)) {
      stock++;
      stockSources.add(host || 'по имени файла');
    }
    if (/^https?:\/\//i.test(src) && !src.includes(hostname)) external++;
  });

  const total = $imgs.length;
  return {
    total,
    noAlt,
    lazy: $('img[loading="lazy"]').length,
    external,
    stock: {
      count: stock,
      // Доля важнее числа: три стоковых из ста — случайность, три из пяти — подход
      share: total ? Math.round((stock / total) * 100) : 0,
      sources: [...stockSources].slice(0, 3)
    }
  };
}

function inRange(len, { min, max }) {
  if (!len) return false;
  return len >= min && len <= max;
}
