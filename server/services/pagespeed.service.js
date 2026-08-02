/**
 * pagespeed.service.js — обращение к Google PageSpeed Insights API
 * и сжатие огромного отчёта Lighthouse в компактную структуру.
 *
 * Пользователю сырой отчёт не отдаём никогда: там несколько мегабайт
 * служебных данных, которые ничего ему не объясняют.
 */

import { log } from '../utils/logger.js';

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const TIMEOUT_MS = 70000; // PageSpeed на медленных сайтах реально думает под минуту

/**
 * @param {string} url
 * @param {'mobile'|'desktop'} strategy
 * @returns {Promise<{ok: boolean, data?: object, reason?: string}>}
 *
 * Никогда не бросает исключение наружу: если скорость не проверилась,
 * остальной аудит должен продолжаться (частичный результат лучше пустого).
 */
export async function runPageSpeed(url, strategy = 'mobile') {
  const key = process.env.PAGESPEED_API_KEY;

  const params = new URLSearchParams({ url, strategy });
  for (const c of ['performance', 'accessibility', 'best-practices', 'seo']) params.append('category', c);
  if (key) params.set('key', key);

  let response;
  try {
    response = await fetch(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    log.warn('pagespeed_network_error', { name: err?.name });
    return { ok: false, reason: err?.name === 'TimeoutError' ? 'timeout' : 'network' };
  }

  if (response.status === 429) return { ok: false, reason: 'quota' };
  if (!response.ok) {
    log.warn('pagespeed_http_error', { status: response.status });
    return { ok: false, reason: response.status === 400 ? 'target_unreachable' : 'api_error' };
  }

  let json;
  try {
    json = await response.json();
  } catch {
    return { ok: false, reason: 'bad_response' };
  }

  const lh = json?.lighthouseResult;
  if (!lh?.categories) return { ok: false, reason: 'bad_response' };

  return { ok: true, data: compact(lh, strategy) };
}

/** score в Lighthouse — доля 0..1, наружу отдаём привычные 0..100 */
const pct = (v) => (typeof v === 'number' ? Math.round(v * 100) : null);

function metric(audit) {
  if (!audit) return null;
  return {
    value: typeof audit.numericValue === 'number' ? Math.round(audit.numericValue * 1000) / 1000 : null,
    displayValue: ruDisplay(audit)
  };
}

/** Google отдаёт "4.8 s" — переводим в «4,8 сек.» */
function ruDisplay(audit) {
  const raw = audit?.displayValue;
  if (!raw) return null;
  return String(raw)
    .replace(/\s*s$/i, ' сек.')
    .replace(/\s*ms$/i, ' мс')
    .replace(/(\d),(\d{3})/g, '$1 $2') // разделитель тысяч
    .replace(/(\d)\.(\d)/g, '$1,$2');  // десятичная запятая
}

/** Диагностика: сколько можно сэкономить, если починить конкретный пункт. */
function opportunity(audits, id) {
  const a = audits?.[id];
  if (!a) return null;
  const savingsMs = a.details?.overallSavingsMs ?? a.numericValue ?? null;
  const savingsBytes = a.details?.overallSavingsBytes ?? null;
  return {
    id,
    title: a.title || null,
    score: typeof a.score === 'number' ? a.score : null,
    savingsMs: savingsMs ? Math.round(savingsMs) : null,
    savingsKb: savingsBytes ? Math.round(savingsBytes / 1024) : null,
    items: Array.isArray(a.details?.items) ? a.details.items.length : null
  };
}

function compact(lh, strategy) {
  const a = lh.audits || {};
  const c = lh.categories || {};

  // Суммарный вес страницы и число запросов лежат в служебном аудите
  const resourceItems = a['resource-summary']?.details?.items || [];
  const total = resourceItems.find((i) => i.resourceType === 'total');

  return {
    strategy,
    fetchedAt: lh.fetchTime || null,
    scores: {
      performance: pct(c.performance?.score),
      accessibility: pct(c.accessibility?.score),
      seo: pct(c.seo?.score),
      bestPractices: pct(c['best-practices']?.score)
    },
    metrics: {
      fcp: metric(a['first-contentful-paint']),
      lcp: metric(a['largest-contentful-paint']),
      cls: metric(a['cumulative-layout-shift']),
      tbt: metric(a['total-blocking-time']),
      si: metric(a['speed-index']),
      inp: metric(a['interaction-to-next-paint'] || a['experimental-interaction-to-next-paint'])
    },
    page: {
      totalKb: total?.transferSize ? Math.round(total.transferSize / 1024) : null,
      requests: total?.requestCount ?? null
    },
    opportunities: [
      opportunity(a, 'uses-optimized-images'),
      opportunity(a, 'modern-image-formats'),
      opportunity(a, 'uses-responsive-images'),
      opportunity(a, 'unused-javascript'),
      opportunity(a, 'unused-css-rules'),
      opportunity(a, 'render-blocking-resources'),
      opportunity(a, 'uses-long-cache-ttl'),
      opportunity(a, 'font-display'),
      opportunity(a, 'total-byte-weight'),
      opportunity(a, 'third-party-summary')
    ].filter(Boolean),
    // Мобильная эргономика — отдельные аудиты, по ним считаем категорию «Мобильная версия»
    mobileChecks: {
      viewport: a.viewport?.score,
      tapTargets: a['tap-targets']?.score,
      fontSize: a['font-size']?.score,
      contentWidth: a['content-width']?.score
    }
  };
}
