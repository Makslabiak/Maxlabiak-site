/**
 * scoring.service.js — превращает список найденных проблем в баллы.
 *
 * Принцип: каждая категория стартует со 100 и теряет очки за проблемы.
 * Штрафы пологие, есть нижний порог — чтобы отчёт не выглядел приговором
 * из-за пары мелочей.
 */

import {
  CATEGORY_WEIGHTS, CATEGORY_LABELS, SEVERITY_PENALTY, CATEGORY_FLOOR,
  CRITICAL_CAPS, HIGH_CAPS,
  SUMMARY_BANDS, CATEGORY_SUMMARY_BANDS, bandText
} from '../config/score-weights.js';

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));

/**
 * @param {Array} issues — проблемы с полями category и severity
 * @param {object} pagespeed — компактный отчёт или null
 * @param {Set<string>} unavailable — категории без данных (например, скорость без PageSpeed)
 */
export function calculateScores(issues, pagespeed, unavailable = new Set()) {
  const categories = {};

  for (const key of Object.keys(CATEGORY_WEIGHTS)) {
    if (unavailable.has(key)) {
      categories[key] = {
        score: null,
        label: CATEGORY_LABELS[key],
        summary: 'Данные для этой части проверки получить не удалось',
        available: false
      };
      continue;
    }

    const penalty = issues
      .filter((i) => i.category === key && i.severity !== 'positive')
      .reduce((sum, i) => sum + (SEVERITY_PENALTY[i.severity] || 0), 0);

    let score;
    if (key === 'performance' && typeof pagespeed?.scores?.performance === 'number') {
      // Для скорости у Google уже есть выверенная оценка — не изобретаем свою,
      // а лишь слегка корректируем её собственными находками (тяжёлые ресурсы и т.п.)
      score = clamp(pagespeed.scores.performance - penalty * 0.25, CATEGORY_FLOOR);
    } else {
      score = clamp(100 - penalty, CATEGORY_FLOOR);
    }

    categories[key] = {
      score,
      label: CATEGORY_LABELS[key],
      summary: bandText(CATEGORY_SUMMARY_BANDS[key], score),
      available: true
    };
  }

  // Веса пересчитываем только по доступным категориям, иначе отсутствие
  // PageSpeed автоматически срезало бы 25 баллов ни за что.
  const active = Object.entries(categories).filter(([, c]) => c.available);
  const weightSum = active.reduce((s, [k]) => s + CATEGORY_WEIGHTS[k], 0) || 1;
  const weighted = clamp(active.reduce((s, [k, c]) => s + c.score * CATEGORY_WEIGHTS[k], 0) / weightSum);

  const total = applyCaps(weighted, issues);

  return { score: total, categories, summary: bandText(SUMMARY_BANDS, total) };
}

/**
 * Ограничение итога сверху по тяжести находок.
 *
 * Средневзвешенное сглаживает провалы: сайт с шестнадцатисекундной
 * загрузкой первого экрана выходил на 69 баллов за счёт аккуратной
 * мобильной вёрстки. Потолок возвращает картину к реальности —
 * одна сломанная опора важнее трёх целых.
 */
function applyCaps(score, issues) {
  const criticals = issues.filter((i) => i.severity === 'critical').length;
  const highs = issues.filter((i) => i.severity === 'high').length;

  let cap = 100;
  for (const rule of CRITICAL_CAPS) {
    if (criticals >= rule.count) { cap = Math.min(cap, rule.max); break; }
  }
  for (const rule of HIGH_CAPS) {
    if (highs >= rule.count) { cap = Math.min(cap, rule.max); break; }
  }
  return Math.min(score, cap);
}
