/**
 * mock.service.js — реалистичные тестовые отчёты без обращения
 * к PageSpeed и Playwright. Нужен, чтобы верстать и править интерфейс,
 * не тратя квоту API и не ожидая по минуте каждый прогон.
 *
 * РЕДАКЦИЯ 2: сигналы приведены к новой структуре с шестью основными
 * проверками. Сценарий average специально сделан типичным сайтом
 * ремонтной компании: технически терпимый, но без расчёта, без внятных
 * гарантий и со стоковыми фото — то есть внешне приличный, а заявок не даёт.
 *
 * Включается переменной AUDIT_MOCK_MODE=true. В production — только false.
 */

import { calculateScores } from './scoring.service.js';
import { buildIssues, buildPositives, buildMetrics } from './report.service.js';
import { buildBenchmark } from './benchmark.service.js';

const SCENARIOS = {
  good: {
    isHttps: true,
    ps: psMock({ performance: 84, seo: 96, accessibility: 90, bestPractices: 93, lcp: 2300, fcp: 1400, cls: 0.04, tbt: 120, si: 2600, totalKb: 1500 }),
    html: htmlMock('good'),
    viewport: { h1Visible: true, ctaVisible: true, contactVisible: true, firstScreenTextLength: 320, tooMuchText: false }
  },
  average: {
    isHttps: true,
    ps: psMock({ performance: 54, seo: 82, accessibility: 74, bestPractices: 78, lcp: 3900, fcp: 2600, cls: 0.14, tbt: 420, si: 4800, totalKb: 3600, imagesSavingsKb: 900, renderBlockingMs: 700 }),
    html: htmlMock('average'),
    viewport: { h1Visible: true, ctaVisible: false, contactVisible: true, firstScreenTextLength: 480, tooMuchText: false }
  },
  bad: {
    isHttps: false,
    ps: psMock({ performance: 24, seo: 62, accessibility: 55, bestPractices: 58, lcp: 6800, fcp: 4200, cls: 0.38, tbt: 1300, si: 8200, totalKb: 7200, imagesSavingsKb: 2600, renderBlockingMs: 1800, tapTargets: 0, fontSize: 0 }),
    html: htmlMock('bad'),
    viewport: { h1Visible: false, ctaVisible: false, contactVisible: false, firstScreenTextLength: 900, tooMuchText: true }
  }
};

function psMock(o) {
  const m = (v, d) => ({ value: v, displayValue: d });
  const s = (ms) => (ms / 1000).toFixed(1).replace('.', ',') + ' сек.';
  return {
    strategy: 'mobile',
    fetchedAt: new Date().toISOString(),
    scores: { performance: o.performance, accessibility: o.accessibility, seo: o.seo, bestPractices: o.bestPractices },
    metrics: {
      lcp: m(o.lcp, s(o.lcp)), fcp: m(o.fcp, s(o.fcp)),
      cls: m(o.cls, String(o.cls).replace('.', ',')),
      tbt: m(o.tbt, o.tbt + ' мс'), si: m(o.si, s(o.si)), inp: null
    },
    page: { totalKb: o.totalKb, requests: Math.round(o.totalKb / 45) },
    opportunities: [
      o.imagesSavingsKb ? { id: 'modern-image-formats', savingsKb: o.imagesSavingsKb, savingsMs: 900, score: 0.3 } : null,
      o.renderBlockingMs ? { id: 'render-blocking-resources', savingsMs: o.renderBlockingMs, savingsKb: 90, score: 0.4 } : null
    ].filter(Boolean),
    mobileChecks: { viewport: 1, tapTargets: o.tapTargets ?? 1, fontSize: o.fontSize ?? 1, contentWidth: 1 }
  };
}

/**
 * Три типовых сайта.
 *   good    — сделан по уму: расчёт, свои фото, гарантия сроком, отзывы
 *   average — самый частый случай: внешне прилично, но узнать цену
 *             невозможно, гарантии на словах, фото из фотобанка
 *   bad     — визитка десятилетней давности
 */
function htmlMock(kind) {
  const base = {
    meta: {
      title: { present: true, length: 54, value: 'Ремонт квартир под ключ в Москве', ok: true },
      description: { present: true, length: 140, ok: true },
      h1: { count: 1, exactlyOne: true, first: 'Ремонт квартир под ключ' },
      lang: true, viewport: true, canonical: true, favicon: true,
      openGraph: false, structuredData: false, charset: true
    },
    contacts: { telLinks: 2, phoneInText: true, telegram: false, whatsapp: true, email: true,
                chatWidget: { found: false, vendor: null }, callback: true },
    forms: { count: 1, fields: 3, requiredFields: 1, phoneFields: 1,
             asksPhoneUpfront: true, onlyPhoneAsked: false, policyNear: true },
    cta: { count: 5, repeated: true, samples: ['оставить заявку', 'вызвать замерщика'] },
    calculator: { found: false, byMarkup: false, byText: false },
    prices: { hasNumbers: false, perSquareMeter: false, wordOnly: true },
    trust: { groups: ['warranty'], groupCount: 1, warrantyTerm: null, hasWarrantyTerm: false, enough: false },
    proof: {
      cases: { blocks: 4, withImages: true, enough: true },
      reviews: { blocks: 0, enough: false, mentioned: true },
      process: { blocks: 4, enough: true, mentioned: true }
    },
    images: { total: 18, noAlt: 8, lazy: 0, external: 6,
              stock: { count: 6, share: 33, sources: ['unsplash.com'] } },
    scripts: { external: 9, tooMany: false },
    markers: {
      geo: { label: 'география работы', found: true },
      timing: { label: 'сроки работ', found: false },
      faq: { label: 'ответы на частые вопросы', found: false }
    },
    firstScreen: { hasH1: true, genericHeadline: false, hasCta: true, hasContact: true,
                   tooMuchText: null, ctaAboveFold: null, h1AboveFold: null },
    text: { length: 4200, firstScreenApproxLength: 700 }
  };

  if (kind === 'good') {
    return merge(base, {
      meta: { ...base.meta, openGraph: true, structuredData: true },
      contacts: { ...base.contacts, telegram: true, chatWidget: { found: true, vendor: 'JivoChat' } },
      forms: { ...base.forms, onlyPhoneAsked: false, fields: 2 },
      calculator: { found: true, byMarkup: true, byText: true },
      prices: { hasNumbers: true, perSquareMeter: true, wordOnly: false },
      trust: { groups: ['warranty', 'contract', 'estimate'], groupCount: 3,
               warrantyTerm: 'гарантия 3 года', hasWarrantyTerm: true, enough: true },
      proof: {
        cases: { blocks: 8, withImages: true, enough: true },
        reviews: { blocks: 6, enough: true, mentioned: true },
        process: { blocks: 5, enough: true, mentioned: true }
      },
      images: { total: 24, noAlt: 1, lazy: 18, external: 0, stock: { count: 0, share: 0, sources: [] } },
      markers: { ...base.markers, timing: { label: 'сроки работ', found: true }, faq: { label: 'FAQ', found: true } }
    });
  }

  if (kind === 'bad') {
    return merge(base, {
      meta: { title: { present: false, length: 0, value: '', ok: false },
              description: { present: false, length: 0, ok: false },
              h1: { count: 0, exactlyOne: false, first: '' },
              lang: false, viewport: false, canonical: false, favicon: false,
              openGraph: false, structuredData: false, charset: true },
      contacts: { telLinks: 0, phoneInText: true, telegram: false, whatsapp: false, email: true,
                  chatWidget: { found: false, vendor: null }, callback: false },
      forms: { count: 1, fields: 1, requiredFields: 1, phoneFields: 1,
               asksPhoneUpfront: true, onlyPhoneAsked: true, policyNear: false },
      cta: { count: 1, repeated: false, samples: ['заказать'] },
      trust: { groups: [], groupCount: 0, warrantyTerm: null, hasWarrantyTerm: false, enough: false },
      proof: {
        cases: { blocks: 0, withImages: false, enough: false },
        reviews: { blocks: 0, enough: false, mentioned: false },
        process: { blocks: 0, enough: false, mentioned: false }
      },
      images: { total: 12, noAlt: 11, lazy: 0, external: 9,
                stock: { count: 8, share: 67, sources: ['depositphotos', 'по имени файла'] } },
      scripts: { external: 18, tooMany: true },
      markers: {
        geo: { label: 'география работы', found: false },
        timing: { label: 'сроки работ', found: false },
        faq: { label: 'FAQ', found: false }
      }
    });
  }

  return base; // average
}

function merge(base, patch) {
  return { ...base, ...patch };
}

export function buildMockReport(url, domain, auditId, scenarioName) {
  const key = scenarioName === 'random'
    ? ['good', 'average', 'bad'][Math.floor(Math.random() * 3)]
    : (SCENARIOS[scenarioName] ? scenarioName : 'average');

  const data = SCENARIOS[key];
  const issues = buildIssues(data);
  const positives = buildPositives(data);
  const benchmark = buildBenchmark(data);
  const { score, categories, summary } = calculateScores(issues, data.ps);

  return {
    success: true,
    partial: false,
    auditId,
    url,
    domain,
    createdAt: new Date().toISOString(),
    screenshotUrl: null,
    screenshotStatus: 'mock',
    score, summary, categories,
    metrics: buildMetrics(data.ps),
    issues,
    positives,
    benchmark,
    notices: ['Тестовый режим: отчёт сгенерирован без реальной проверки сайта'],
    meta: { analysisVersion: '2.0.0', strategy: 'mobile', mock: true, scenario: key }
  };
}
