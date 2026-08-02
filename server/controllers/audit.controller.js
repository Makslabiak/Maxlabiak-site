/**
 * audit.controller.js — оркестрация одного аудита.
 *
 * Ключевой принцип: частичный результат лучше пустого. PageSpeed и
 * скриншот запускаются параллельно и оба могут упасть — отчёт всё равно
 * соберётся из того, что получилось. Падение одного источника не должно
 * заставлять посетителя начинать всё заново.
 */

import { randomUUID } from 'node:crypto';
import { assertSafeUrl, normalizeUrl, cacheKeyFor, AuditError } from '../utils/validate-url.js';
import { fetchHtml } from '../utils/safe-fetch.js';
import { auditHtml } from '../services/html-audit.service.js';
import { runPageSpeed } from '../services/pagespeed.service.js';
import { captureScreenshot } from '../services/screenshot.service.js';
import { calculateScores } from '../services/scoring.service.js';
import { buildIssues, buildPositives, buildMetrics } from '../services/report.service.js';
import { buildBenchmark } from '../services/benchmark.service.js';
import { buildMockReport } from '../services/mock.service.js';
import * as cache from '../services/cache.service.js';
import { log } from '../utils/logger.js';

const ANALYSIS_VERSION = '1.0.0';

const PAGESPEED_FAIL_TEXT = {
  quota: 'Сервис оценки скорости временно ограничил количество запросов',
  timeout: 'Сервис оценки скорости не ответил вовремя',
  network: 'Не удалось связаться с сервисом оценки скорости',
  api_error: 'Сервис оценки скорости временно недоступен',
  target_unreachable: 'Сервис оценки скорости не смог открыть этот сайт',
  bad_response: 'Сервис оценки скорости вернул неожиданный ответ',
  disabled: 'Проверка скорости не настроена на сервере'
};

export async function runAudit(rawUrl) {
  const auditId = randomUUID();
  const mockMode = process.env.AUDIT_MOCK_MODE === 'true';
  const cacheTtlMs = Number(process.env.AUDIT_CACHE_TTL_MIN || 45) * 60 * 1000;

  /* В mock-режиме проверяем только синтаксис, без DNS: смысл режима в том,
     чтобы верстать интерфейс на любом выдуманном домене и без сети. */
  if (mockMode) {
    const parsed = normalizeUrl(rawUrl);
    log.info('audit_started', { auditId, domain: parsed.domain, mock: true });
    const report = buildMockReport(parsed.url, parsed.domain, auditId, process.env.AUDIT_MOCK_SCENARIO || 'average');
    cache.set('report:' + auditId, report, cacheTtlMs);
    log.info('audit_completed', { auditId, score: report.score, mock: true });
    return report;
  }

  // Полная проверка (синтаксис + DNS + IP) — до любых сетевых действий
  const safe = await assertSafeUrl(rawUrl);
  const key = 'audit:' + cacheKeyFor(safe.url);

  log.info('audit_started', { auditId, domain: safe.domain, mock: false });

  // Свежий результат по тому же адресу — отдаём его, не тратя квоту.
  // auditId выдаём новый, чтобы заявка привязалась к текущему обращению.
  const cached = cache.get(key);
  if (cached) {
    const copy = { ...cached, auditId, fromCache: true };
    cache.set('report:' + auditId, copy, cacheTtlMs);
    log.info('audit_cache_hit', { auditId, domain: safe.domain });
    return copy;
  }

  /* ── 1. HTML: обязательный этап, без него отчёта не будет ── */
  const page = await fetchHtml(safe.url);
  const htmlSignals = auditHtml({ html: page.html, finalUrl: page.finalUrl });

  /* ── 2. Скорость и скриншот — параллельно, оба необязательные ── */
  const pagespeedEnabled = !!process.env.PAGESPEED_API_KEY || process.env.PAGESPEED_ALLOW_NO_KEY === 'true';
  const [psResult, shotResult] = await Promise.all([
    pagespeedEnabled ? runPageSpeed(page.finalUrl, 'mobile') : Promise.resolve({ ok: false, reason: 'disabled' }),
    captureScreenshot(page.finalUrl, auditId)
  ]);

  const notices = [];
  if (!psResult.ok) notices.push(PAGESPEED_FAIL_TEXT[psResult.reason] || PAGESPEED_FAIL_TEXT.api_error);
  if (!shotResult.ok && shotResult.reason !== 'playwright_missing') {
    notices.push('Не удалось сделать скриншот первого экрана');
  }

  /* ── 3. Сборка отчёта ── */
  const data = {
    html: htmlSignals,
    ps: psResult.ok ? psResult.data : null,
    viewport: shotResult.ok ? shotResult.viewport : null,
    isHttps: page.isHttps
  };

  const issues = buildIssues(data);
  const positives = buildPositives(data);
  const benchmark = buildBenchmark(data); // пусто, пока ENABLED=false в niche-benchmark.js

  // Без PageSpeed категорию «Скорость» не выдумываем, а честно помечаем
  // как недоступную — и исключаем её вес из общего балла.
  const unavailable = new Set(psResult.ok ? [] : ['performance']);
  const { score, categories, summary } = calculateScores(issues, data.ps, unavailable);

  const report = {
    success: true,
    partial: notices.length > 0,
    auditId,
    url: page.finalUrl,
    domain: safe.domain,
    createdAt: new Date().toISOString(),
    screenshotUrl: shotResult.ok ? shotResult.url : null,
    screenshotStatus: shotResult.ok ? 'ok' : shotResult.reason,
    score,
    summary,
    categories,
    metrics: buildMetrics(data.ps),
    issues,
    positives,
    benchmark,
    notices,
    meta: {
      analysisVersion: ANALYSIS_VERSION,
      strategy: 'mobile',
      pagespeed: psResult.ok,
      screenshot: shotResult.ok,
      htmlTruncated: page.truncated
    }
  };

  cache.set(key, report, cacheTtlMs);
  cache.set('report:' + auditId, report, cacheTtlMs);

  log[report.partial ? 'warn' : 'info'](report.partial ? 'audit_partial' : 'audit_completed', {
    auditId, domain: safe.domain, score, issues: issues.length, notices: notices.length
  });

  return report;
}

export function getStoredReport(auditId) {
  return cache.get('report:' + auditId);
}

export { AuditError };
