/**
 * Тесты подсчёта баллов, сортировки проблем и преобразования
 * ответа PageSpeed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateScores } from '../server/services/scoring.service.js';
import { sortIssues, buildIssues, buildMetrics } from '../server/services/report.service.js';
import { buildMockReport } from '../server/services/mock.service.js';

const issue = (category, severity, id = category + '-' + severity) => ({ id, category, severity });

test('идеальный сайт без проблем получает 100', () => {
  const { score, categories } = calculateScores([], null, new Set());
  assert.equal(score, 100);
  assert.equal(categories.conversion.score, 100);
});

test('одна мелочь не обрушивает балл', () => {
  const { score } = calculateScores([issue('technical', 'low')], null, new Set());
  assert.ok(score >= 95, 'ожидался балл не ниже 95, получено ' + score);
});

test('критическая проблема заметно снижает свою категорию', () => {
  const { categories } = calculateScores([issue('conversion', 'critical')], null, new Set());
  assert.equal(categories.conversion.score, 70);
  assert.equal(categories.trust.score, 100, 'другие категории не должны страдать');
});

test('балл категории не падает ниже нижнего порога', () => {
  const many = Array.from({ length: 12 }, (_, i) => issue('trust', 'critical', 'i' + i));
  const { categories } = calculateScores(many, null, new Set());
  assert.ok(categories.trust.score >= 8, 'ожидался пол 8, получено ' + categories.trust.score);
});

test('веса категорий влияют на общий балл', () => {
  // Берём medium: на critical сработал бы потолок и сравнил бы оба
  // случая к одному числу, спрятав разницу весов
  const a = calculateScores([issue('conversion', 'medium')], null, new Set()).score;
  const b = calculateScores([issue('technical', 'medium')], null, new Set()).score;
  assert.ok(a < b, `конверсия должна весить больше: ${a} vs ${b}`);
});

test('одна критическая проблема ограничивает итог сверху', () => {
  // Сайт может быть безупречен во всём остальном, но если первый экран
  // грузится 16 секунд — «хорошая основа» это не описывает
  const { score } = calculateScores([issue('performance', 'critical')], { scores: { performance: 90 } }, new Set());
  assert.ok(score <= 59, 'ожидался потолок 59, получено ' + score);
});

test('несколько критических опускают потолок дальше', () => {
  const two = calculateScores([issue('a', 'critical', 'c1'), issue('b', 'critical', 'c2')], null, new Set()).score;
  const three = calculateScores(
    [issue('a', 'critical', 'c1'), issue('b', 'critical', 'c2'), issue('c', 'critical', 'c3')], null, new Set()).score;
  assert.ok(two <= 45, 'две критические: ожидался потолок 45, получено ' + two);
  assert.ok(three <= 35, 'три критические: ожидался потолок 35, получено ' + three);
});

test('потолок не поднимает балл, а только ограничивает', () => {
  // Восемь критических проблем: средневзвешенное даёт около 45, потому что
  // нетронутые категории тянут вверх. Потолок для 3+ критических — 35,
  // и итог должен опуститься до него, а не остаться на 45.
  const many = Array.from({ length: 8 }, (_, i) => issue(['conversion', 'trust'][i % 2], 'critical', 'x' + i));
  const { score } = calculateScores(many, null, new Set(['performance']));
  assert.ok(score <= 35, 'ожидался потолок 35 или ниже, получено ' + score);
});

test('без критических и множественных high потолок не применяется', () => {
  const { score } = calculateScores([issue('technical', 'low')], null, new Set());
  assert.ok(score > 90, 'мелочь не должна включать потолок, получено ' + score);
});

test('без PageSpeed категория скорости помечается недоступной и не режет балл', () => {
  const { score, categories } = calculateScores([], null, new Set(['performance']));
  assert.equal(categories.performance.score, null);
  assert.equal(categories.performance.available, false);
  // Вес пересчитан по оставшимся категориям, штрафа за отсутствие данных нет
  assert.equal(score, 100);
});

test('балл скорости берётся из PageSpeed, а не выдумывается', () => {
  const ps = { scores: { performance: 42 } };
  const { categories } = calculateScores([], ps, new Set());
  assert.equal(categories.performance.score, 42);
});

test('итоговый текст соответствует диапазону балла', () => {
  assert.match(calculateScores([], { scores: { performance: 100 } }, new Set()).summary, /хорошем состоянии/);
  const bad = Array.from({ length: 10 }, (_, i) => issue(['conversion', 'trust', 'mobile', 'technical'][i % 4], 'critical', 'x' + i));
  assert.match(calculateScores(bad, null, new Set(['performance'])).summary, /серьёзная доработка/);
});

test('проблемы сортируются от критичных к мелким', () => {
  const sorted = sortIssues([
    issue('a', 'low'), issue('b', 'critical'), issue('c', 'medium'), issue('d', 'high')
  ]);
  assert.deepEqual(sorted.map((i) => i.severity), ['critical', 'high', 'medium', 'low']);
});

test('правила не падают на пустых данных', () => {
  const empty = {
    html: {
      meta: { title: { present: false, length: 0, ok: false }, description: { present: false, ok: false },
              h1: { count: 0, exactlyOne: false, first: '' }, lang: false, viewport: false,
              canonical: false, favicon: false, openGraph: false, structuredData: false },
      contacts: { telLinks: 0, phoneInText: false, telegram: false, whatsapp: false, email: false },
      forms: { count: 0, fields: 0, requiredFields: 0, policyNear: false },
      cta: { count: 0, samples: [] },
      images: { total: 0, noAlt: 0, lazy: 0 },
      scripts: { external: 0, tooMany: false },
      markers: Object.fromEntries(['prices', 'cases', 'guarantee', 'reviews', 'process', 'faq', 'geo', 'timing']
        .map((k) => [k, { label: k, found: false }])),
      firstScreen: { hasH1: false, genericHeadline: null, hasCta: false, hasContact: false },
      text: { length: 0 }
    },
    ps: null,
    viewport: null,
    isHttps: false
  };

  const issues = buildIssues(empty);
  assert.ok(issues.length > 5, 'на пустой странице должно найтись много проблем');
  assert.ok(issues.every((i) => i.title && i.description && i.recommendation),
    'у каждой проблемы должны быть заголовок, описание и рекомендация');
});

test('формулировки проблем не содержат недоказуемых обещаний', () => {
  const report = buildMockReport('https://example.ru', 'example.ru', 'test-id', 'bad');
  const forbidden = /теря[ею]те \d|\d+ ?% клиентов|заблокирует|вообще не работает|рублей/i;
  for (const i of report.issues) {
    const text = [i.title, i.description, i.businessImpact].join(' ');
    assert.ok(!forbidden.test(text), 'запугивающая формулировка: ' + text);
  }
});

test('метрики отдаются с человеческими пояснениями', () => {
  const ps = {
    scores: { performance: 50, seo: 80, accessibility: 70, bestPractices: 75 },
    metrics: {
      lcp: { value: 4800, displayValue: '4,8 сек.' },
      fcp: { value: 2700, displayValue: '2,7 сек.' },
      cls: { value: 0.18, displayValue: '0,18' },
      si: { value: 5100, displayValue: '5,1 сек.' },
      tbt: null, inp: null
    }
  };
  const metrics = buildMetrics(ps);
  assert.ok(metrics.length >= 6);
  assert.ok(metrics.every((m) => m.hint && m.hint.length > 10), 'у каждой метрики должно быть пояснение');
  const lcp = metrics.find((m) => m.key === 'lcp');
  assert.match(lcp.hint, /секунд/);
});

test('mock-сценарии дают ожидаемые уровни баллов', () => {
  const good = buildMockReport('https://a.ru', 'a.ru', 'id1', 'good');
  const avg = buildMockReport('https://b.ru', 'b.ru', 'id2', 'average');
  const bad = buildMockReport('https://c.ru', 'c.ru', 'id3', 'bad');

  assert.ok(good.score > avg.score, `good(${good.score}) должен быть выше average(${avg.score})`);
  assert.ok(avg.score > bad.score, `average(${avg.score}) должен быть выше bad(${bad.score})`);
  assert.ok(good.score >= 70, 'хороший сайт должен получать не меньше 70, получено ' + good.score);
  assert.ok(bad.score <= 45, 'проблемный сайт должен получать не больше 45, получено ' + bad.score);
});

test('mock-отчёт содержит всё, что нужно интерфейсу', () => {
  const r = buildMockReport('https://a.ru', 'a.ru', 'id', 'average');
  assert.equal(r.success, true);
  assert.ok(r.issues.length >= 3, 'должно быть минимум 3 проблемы');
  assert.ok(r.positives.length >= 2, 'должно быть минимум 2 положительных момента');
  assert.ok(r.metrics.length > 0);
  assert.equal(Object.keys(r.categories).length, 5);
  assert.equal(r.meta.mock, true);
});
