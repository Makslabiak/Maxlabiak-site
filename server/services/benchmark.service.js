/**
 * benchmark.service.js — сравнение сайта клиента с типичным сайтом ниши.
 *
 * Возвращает пустой массив, пока в niche-benchmark.js не выставлен
 * ENABLED = true. Это намеренно: показывать сравнение с придуманными
 * цифрами — обман, который вскрывается одним прогоном конкурента через
 * тот же инструмент и убивает доверие ко всему отчёту, а не только
 * к этому блоку.
 *
 * Каждая строка сравнения — это факт про сайт клиента (мы его измерили)
 * и факт про нишу (заранее посчитан и лежит в конфиге), без утверждений
 * про конкретных поимённых конкурентов, которых мы не проверяли сейчас.
 */

import * as bench from '../config/niche-benchmark.js';

const sec = (ms) => (ms / 1000).toFixed(1).replace('.', ',') + ' сек.';

export function buildBenchmark(data) {
  if (!bench.ENABLED) return [];

  const rows = [];

  /* ── скорость ── */
  const lcpValue = data.ps?.metrics?.lcp?.value;
  if (typeof lcpValue === 'number' && bench.SPEED_BENCHMARK.lcp.value) {
    const clientDisplay = data.ps.metrics.lcp.displayValue || sec(lcpValue);
    const diff = lcpValue - bench.SPEED_BENCHMARK.lcp.value;
    rows.push({
      id: 'lcp',
      label: 'Скорость загрузки первого экрана',
      client: clientDisplay,
      niche: bench.SPEED_BENCHMARK.lcp.displayValue,
      // slower/faster относится к клиенту: slower — сайт клиента медленнее ниши
      comparison: diff > 300 ? 'slower' : diff < -300 ? 'faster' : 'similar'
    });
  }

  /* ── доля сайтов ниши с признаком ── */
  addFeatureRow(rows, 'calculator', 'Расчёт стоимости на сайте',
    data.html.calculator.found, bench.FEATURE_BENCHMARK.calculator);
  addFeatureRow(rows, 'priceNumbers', 'Конкретные цифры цен',
    data.html.prices.hasNumbers, bench.FEATURE_BENCHMARK.priceNumbers);
  addFeatureRow(rows, 'warrantyTerm', 'Гарантия с указанным сроком',
    data.html.trust.hasWarrantyTerm, bench.FEATURE_BENCHMARK.warrantyTerm);
  addFeatureRow(rows, 'casesEnough', 'Примеры выполненных работ',
    data.html.proof.cases.enough, bench.FEATURE_BENCHMARK.casesEnough);
  addFeatureRow(rows, 'reviewsEnough', 'Отзывы клиентов',
    data.html.proof.reviews.enough, bench.FEATURE_BENCHMARK.reviewsEnough);

  const hasInstantAnswer = data.html.contacts.chatWidget.found || data.html.contacts.telegram ||
    data.html.contacts.whatsapp || data.html.contacts.callback;
  addFeatureRow(rows, 'instantAnswer', 'Быстрый ответ на вопрос',
    hasInstantAnswer, bench.FEATURE_BENCHMARK.instantAnswer);

  return rows;
}

function addFeatureRow(rows, id, label, clientHas, nicheShare) {
  if (typeof nicheShare !== 'number') return;
  rows.push({
    id,
    label,
    client: clientHas ? 'есть' : 'нет',
    niche: Math.round(nicheShare * 100) + '% конкурентов',
    comparison: clientHas ? 'ahead' : 'behind'
  });
}

export function sampleInfo() {
  return { enabled: bench.ENABLED, sampleSize: bench.SAMPLE_SIZE, updatedAt: bench.UPDATED_AT };
}
