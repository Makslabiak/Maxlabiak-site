/* =========================================================
   ЭКСПРЕСС-АУДИТ САЙТА — фронтенд модального окна

   Подключается с defer, разметка окна создаётся лениво — при первом
   клике по кнопке. До этого момента скрипт не трогает DOM вообще,
   поэтому на загрузку первого экрана он не влияет.

   Состояния (не смешаны в один обработчик, у каждого свой рендер):
     initial → validating → loading → success | partial | error
     success → lead-form → lead-success
   ========================================================= */
(function () {
  'use strict';

  /* ─────────────── конфигурация ─────────────── */

  var API_BASE = (function () {
    // Сайт и API живут на одном порту (Express отдаёт и то, и другое).
    // Исключение — когда статику открыли отдельным сервером (python -m
    // http.server 8080 или Live Server): тогда стучимся на localhost:3000.
    if (window.SITE_AUDIT_API) return window.SITE_AUDIT_API;
    var isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    if (isLocal && location.port !== '3000') return 'http://localhost:3000';
    if (location.protocol === 'file:') return 'http://localhost:3000';
    return '';
  })();

  var STAGES = [
    { text: 'Открываем сайт',            until: 14 },
    { text: 'Проверяем мобильную скорость', until: 52 },
    { text: 'Анализируем первый экран',  until: 68 },
    { text: 'Ищем точки потери заявок',  until: 82 },
    { text: 'Формируем рекомендации',    until: 90 }
  ];

  var PROGRESS_CAP = 90; // выше без ответа сервера не поднимаемся — иначе обман

  var SEVERITY_LABELS = {
    critical: 'Критично',
    high: 'Важно',
    medium: 'Стоит поправить',
    low: 'Мелочь'
  };

  var TOP_ISSUES = 4; // сколько проблем показываем сразу, остальные под кнопкой

  /* ─────────────── состояние ─────────────── */

  var state = {
    screen: 'initial',
    report: null,
    lastUrl: '',
    busy: false,
    openerButton: null,
    showAllIssues: false
  };

  var el = {};           // ссылки на узлы окна
  var timers = [];       // всё, что нужно погасить при закрытии
  var abortController = null;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ─────────────── утилиты ─────────────── */

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function timer(fn, ms) {
    var id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers.forEach(clearInterval);
    timers = [];
  }

  function scoreClass(score) {
    if (score == null) return '';
    if (score >= 80) return 'good';
    if (score >= 50) return 'warn';
    return 'bad';
  }

  function formatDate(iso) {
    var d = iso ? new Date(iso) : new Date();
    if (isNaN(d)) d = new Date();
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /* ─────────────── проверка адреса на клиенте ───────────────
     Дублирует серверную не «на всякий случай», а ради скорости:
     очевидные опечатки ловим мгновенно, без запроса. Настоящая
     защита всё равно на сервере — клиентскую легко обойти. */

  var BAD_HOSTS = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1)/i;

  function validateInput(raw) {
    var value = String(raw || '').replace(/[\u200b-\u200f\uFEFF]/g, '').trim();
    if (!value) return { ok: false, error: 'Введите адрес сайта' };

    // Схемой считаем только запись с "//" — иначе "example.ru:8080"
    // разбирается как протокол "example.ru" (точка допустима в имени схемы)
    var dangerous = /^(javascript|data|vbscript|blob|about|mailto|tel|sms|file|ftp):/i;
    var scheme = value.match(/^([a-z][a-z0-9+.-]*):\/\//i);

    if (dangerous.test(value)) return { ok: false, error: 'Этот адрес нельзя использовать для проверки' };
    if (scheme && !/^https?$/i.test(scheme[1])) {
      return { ok: false, error: 'Этот адрес нельзя использовать для проверки' };
    }
    if (!scheme) value = 'https://' + value.replace(/^\/+/, '');

    var url;
    try { url = new URL(value); } catch (e) { return { ok: false, error: 'Проверьте правильность адреса' }; }

    if (url.port && url.port !== '80' && url.port !== '443') {
      return { ok: false, error: 'Проверяются только сайты на стандартных портах' };
    }

    if (BAD_HOSTS.test(url.hostname)) return { ok: false, error: 'Этот адрес нельзя использовать для проверки' };
    if (!/^([a-z0-9](([a-z0-9-]{0,61})[a-z0-9])?\.)+[a-z]{2,63}$/i.test(url.hostname)) {
      return { ok: false, error: 'Проверьте правильность адреса' };
    }
    return { ok: true, url: url.toString() };
  }

  /* ─────────────── создание окна ─────────────── */

  function buildModal() {
    var root = document.createElement('div');
    root.className = 'sa';
    root.id = 'siteAudit';
    root.hidden = true;
    root.innerHTML =
      '<div class="sa__overlay" data-sa-close></div>' +
      '<div class="sa__modal" role="dialog" aria-modal="true" aria-labelledby="saTitle" tabindex="-1">' +
        '<button type="button" class="sa__close" data-sa-close aria-label="Закрыть окно">&times;</button>' +
        '<div class="sa__scroll" data-sa-body></div>' +
      '</div>';

    document.body.appendChild(root);

    el.root = root;
    el.modal = root.querySelector('.sa__modal');
    el.body = root.querySelector('[data-sa-body]');

    root.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-sa-close')) requestClose();
    });
    // Клики внутри окна разбираем делегированием — так не нужно
    // переподключать обработчики при каждой перерисовке экрана
    el.body.addEventListener('click', onBodyClick);
    el.body.addEventListener('submit', onBodySubmit);

    return root;
  }

  /* ─────────────── открытие / закрытие ─────────────── */

  function open(opener) {
    if (!el.root) buildModal();
    state.openerButton = opener || null;

    document.body.classList.add('sa-lock');
    el.root.hidden = false;
    // Двойной rAF: даём браузеру применить hidden=false до старта
    // transition, иначе окно появится без анимации
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { el.root.classList.add('is-open'); });
    });

    document.addEventListener('keydown', onKeydown, true);
    renderStart();
  }

  /** Закрытие с проверкой: во время анализа сначала спрашиваем. */
  function requestClose() {
    if (state.screen === 'loading' && !el.body.querySelector('[data-sa-confirm]')) {
      showCloseConfirm();
      return;
    }
    close();
  }

  function close() {
    if (!el.root || el.root.hidden) return;

    if (abortController) { abortController.abort(); abortController = null; }
    clearTimers();
    state.busy = false;

    el.root.classList.remove('is-open');
    document.removeEventListener('keydown', onKeydown, true);

    var finish = function () {
      el.root.hidden = true;
      el.body.innerHTML = ''; // освобождаем узлы и обработчики отчёта
      document.body.classList.remove('sa-lock');
      state.screen = 'initial';
      state.showAllIssues = false;
      // Возвращаем фокус туда, откуда пришли — иначе после закрытия
      // клавиатурный фокус улетает в начало страницы
      if (state.openerButton && document.contains(state.openerButton)) state.openerButton.focus();
    };

    if (reduceMotion) finish(); else setTimeout(finish, 320);
  }

  function onKeydown(e) {
    if (el.root.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); requestClose(); return; }
    if (e.key === 'Tab') trapFocus(e);
  }

  /** Фокус не должен уходить на страницу под окном. */
  function trapFocus(e) {
    var nodes = el.modal.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select, [tabindex]:not([tabindex="-1"])'
    );
    var list = Array.prototype.filter.call(nodes, function (n) { return n.offsetParent !== null || n === document.activeElement; });
    if (!list.length) return;

    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ─────────────── общий рендер ─────────────── */

  function render(html, screen) {
    state.screen = screen;
    el.body.innerHTML = html;
    el.body.scrollTop = 0;
  }

  /* ─────────────── ЭКРАН 1: ввод адреса ─────────────── */

  function renderStart(prefill, errorText) {
    render(
      '<h2 class="sa__title" id="saTitle">Узнайте, где сайт теряет заявки</h2>' +
      '<p class="sa__subtitle">Проверим скорость, мобильную версию, первый экран и основные точки потери клиентов.</p>' +
      '<form class="sa-start" data-sa-form="start" novalidate>' +
        '<div class="sa-start__row">' +
          '<input type="text" class="sa-input" name="url" data-sa-url placeholder="example.ru" ' +
                 'autocomplete="url" inputmode="url" spellcheck="false" maxlength="300" value="' + esc(prefill || '') + '">' +
          '<button type="submit" class="sa-btn sa-btn--primary">Начать проверку</button>' +
        '</div>' +
        '<p class="sa-error' + (errorText ? ' is-visible' : '') + '" data-sa-error>' + esc(errorText || '') + '</p>' +
        '<div class="sa-start__meta">' +
          '<span class="sa__note">Экспресс-анализ займёт около 1–2 минут</span>' +
          '<span class="sa__note">Без регистрации и звонков</span>' +
        '</div>' +
      '</form>',
      'initial'
    );

    var input = el.body.querySelector('[data-sa-url]');
    if (input && !('ontouchstart' in window)) timer(function () { input.focus(); }, 340);
  }

  function showStartError(text) {
    var box = el.body.querySelector('[data-sa-error]');
    var input = el.body.querySelector('[data-sa-url]');
    if (box) { box.textContent = text; box.classList.add('is-visible'); }
    if (input) { input.classList.add('is-error'); input.focus(); }
  }

  /* ─────────────── ЭКРАН 2: процесс анализа ─────────────── */

  function renderLoading(domain) {
    var stages = STAGES.map(function (s, i) {
      return '<div class="sa-stage" data-sa-stage="' + i + '"><span class="sa-stage__dot"></span><span>' + esc(s.text) + '</span></div>';
    }).join('');

    render(
      '<h2 class="sa__title" id="saTitle">Проверяем сайт</h2>' +
      '<p class="sa__subtitle">Анализируем <span class="sa-loading__domain">' + esc(domain) + '</span></p>' +
      '<div class="sa-progress"><div class="sa-progress__bar" data-sa-bar></div></div>' +
      '<div class="sa-stages">' + stages + '</div>' +
      '<div data-sa-confirm-slot></div>',
      'loading'
    );
  }

  /** Плавное движение прогресса без привязки к реальным этапам сервера:
      API отдаёт результат одним ответом, промежуточных событий нет.
      Поэтому шкала асимптотически подползает к 90% и замирает там,
      пока не придёт ответ — и только тогда быстро доезжает до 100%. */
  function startProgress() {
    var value = 0;
    var bar = el.body.querySelector('[data-sa-bar]');

    var tick = setInterval(function () {
      // Чем ближе к потолку, тем медленнее движение
      value += Math.max(0.12, (PROGRESS_CAP - value) * 0.018);
      if (value > PROGRESS_CAP) value = PROGRESS_CAP;
      applyProgress(value);
    }, 180);
    timers.push(tick);

    applyProgress(1);

    function applyProgress(v) {
      if (bar) bar.style.width = v + '%';
      var active = 0;
      for (var i = 0; i < STAGES.length; i++) { if (v >= STAGES[i].until) active = i + 1; }
      setStages(Math.min(active, STAGES.length - 1), 'active');
    }
  }

  function setStages(activeIndex, mode) {
    var nodes = el.body.querySelectorAll('[data-sa-stage]');
    Array.prototype.forEach.call(nodes, function (node, i) {
      node.classList.remove('is-active', 'is-done', 'is-error');
      if (mode === 'done') { node.classList.add('is-done'); return; }
      if (mode === 'error' && i === activeIndex) { node.classList.add('is-error'); return; }
      if (i < activeIndex) node.classList.add('is-done');
      else if (i === activeIndex) node.classList.add('is-active');
    });
  }

  function finishProgress(cb) {
    clearTimers();
    var bar = el.body.querySelector('[data-sa-bar]');
    if (bar) bar.style.width = '100%';
    setStages(STAGES.length, 'done');
    timer(cb, reduceMotion ? 60 : 700);
  }

  /** Предупреждение при попытке закрыть окно во время проверки. */
  function showCloseConfirm() {
    var slot = el.body.querySelector('[data-sa-confirm-slot]');
    if (!slot) { close(); return; }
    slot.innerHTML =
      '<div class="sa-notice" data-sa-confirm style="margin-top:24px;flex-direction:column;gap:14px">' +
        '<span>Проверка ещё выполняется. Закрыть окно?</span>' +
        '<span style="display:flex;gap:10px;flex-wrap:wrap">' +
          '<button type="button" class="sa-btn sa-btn--ghost" data-sa-action="confirm-close" style="height:44px;padding:0 20px">Закрыть</button>' +
          '<button type="button" class="sa-btn sa-btn--ghost" data-sa-action="cancel-close" style="height:44px;padding:0 20px">Продолжить проверку</button>' +
        '</span>' +
      '</div>';
  }

  /* ─────────────── ЭКРАН 3: результат ─────────────── */

  function renderResult(report) {
    state.report = report;

    var visible = state.showAllIssues ? report.issues : report.issues.slice(0, TOP_ISSUES);
    var hidden = report.issues.length - visible.length;

    render(
      '<h2 class="sa__title" id="saTitle">Экспресс-аудит готов</h2>' +

      '<div class="sa-result__head">' +
        gaugeHtml(report.score) +
        '<div style="flex:1 1 220px;min-width:0">' +
          '<p class="sa-result__domain">' + esc(report.domain) + '</p>' +
          '<p class="sa-result__date">Проверка от ' + esc(formatDate(report.createdAt)) + '</p>' +
        '</div>' +
      '</div>' +
      '<p class="sa-result__summary">' + esc(report.summary) + '</p>' +
      noticesHtml(report) +
      screenshotHtml(report) +

      '<div class="sa-divider"></div>' +
      '<h3 class="sa__section-title">По направлениям</h3>' +
      '<div class="sa-cats">' + categoriesHtml(report.categories) + '</div>' +

      (report.issues.length
        ? '<div class="sa-divider"></div>' +
          '<h3 class="sa__section-title">Что стоит исправить</h3>' +
          '<div class="sa-issues">' + visible.map(issueHtml).join('') + '</div>' +
          (hidden > 0
            ? '<p style="margin-top:16px"><button type="button" class="sa-link" data-sa-action="show-all">' +
              'Показать все найденные проблемы (' + report.issues.length + ')</button></p>'
            : '')
        : '') +

      benchmarkHtml(report) +

      /* «Что сделано хорошо» — намеренно компактный однострочник, а не
         отдельная секция с заголовком. Полноразмерный блок с галочками
         прямо перед продающим CTA гасил тревогу, которую только что
         создали проблемы выше, — посетитель читал «в целом всё неплохо»
         и терял мотивацию нажимать кнопку. */
      (report.positives && report.positives.length
        ? '<p class="sa-positives-line">' +
            '<span class="sa-positives-line__label">Также в порядке:</span> ' +
            esc(report.positives.slice(0, 4).map(function (p) { return p.text; }).join(' · ')) +
          '</p>'
        : '') +

      (report.metrics && report.metrics.length ? metricsHtml(report.metrics) : '') +

      ctaHtml(report.score),
      report.partial ? 'partial-success' : 'success'
    );

    animateResult(report);
  }

  function gaugeHtml(score) {
    // r=52 при viewBox 120 — окружность 2πr ≈ 326.7, это и есть длина шкалы
    return '<div class="sa-gauge is-' + scoreClass(score) + '" data-sa-gauge>' +
      '<svg width="116" height="116" viewBox="0 0 120 120" aria-hidden="true">' +
        '<circle class="sa-gauge__track" cx="60" cy="60" r="52" fill="none" stroke-width="9"></circle>' +
        '<circle class="sa-gauge__value" cx="60" cy="60" r="52" fill="none" stroke-width="9" ' +
                'stroke-dasharray="326.7" stroke-dashoffset="326.7" data-sa-arc></circle>' +
      '</svg>' +
      '<div class="sa-gauge__num"><b data-sa-score>0</b><span>из 100</span></div>' +
    '</div>';
  }

  function noticesHtml(report) {
    if (!report.notices || !report.notices.length) return '';
    return '<div class="sa-notice"><span>' +
      '<b>Часть проверки завершена.</b> ' + esc(report.notices.join('. ')) + '. ' +
      'Остальные результаты ниже — они получены полностью.' +
      '</span></div>';
  }

  function screenshotHtml(report) {
    if (!report.screenshotUrl) return '';
    return '<img class="sa-shot" src="' + esc(API_BASE + report.screenshotUrl) + '" ' +
           'alt="Первый экран сайта ' + esc(report.domain) + ' на телефоне" loading="lazy">';
  }

  function categoriesHtml(categories) {
    var order = ['performance', 'mobile', 'conversion', 'trust', 'technical'];
    return order.map(function (key) {
      var c = categories[key];
      if (!c) return '';
      if (c.score == null) {
        return '<div class="sa-cat">' +
          '<div class="sa-cat__top"><span class="sa-cat__name">' + esc(c.label) + '</span>' +
          '<span class="sa-cat__score" style="opacity:.4">—</span></div>' +
          '<div class="sa-cat__bar"></div>' +
          '<p class="sa-cat__note">' + esc(c.summary) + '</p></div>';
      }
      var cls = scoreClass(c.score);
      return '<div class="sa-cat">' +
        '<div class="sa-cat__top">' +
          '<span class="sa-cat__name">' + esc(c.label) + '</span>' +
          '<span class="sa-cat__score sa-' + cls + '">' + c.score + '</span>' +
        '</div>' +
        '<div class="sa-cat__bar"><span class="sa-cat__fill sa-fill-' + cls + '" data-sa-fill="' + c.score + '"></span></div>' +
        '<p class="sa-cat__note">' + esc(c.summary) + '</p>' +
      '</div>';
    }).join('');
  }

  /** Сравнение с типичным сайтом ниши — только когда сервер прислал
      непустой массив (это происходит, только если в конфиге вписаны
      реальные цифры конкурентов, см. server/config/niche-benchmark.js).
      Приоритет строк: сначала где клиент отстаёт — это то, что продаёт. */
  function benchmarkHtml(report) {
    var rows = report.benchmark;
    if (!rows || !rows.length) return '';

    var sorted = rows.slice().sort(function (a, b) {
      var weak = { behind: 0, slower: 1, similar: 2, faster: 3, ahead: 4 };
      return (weak[a.comparison] ?? 2) - (weak[b.comparison] ?? 2);
    });

    return '<div class="sa-divider"></div>' +
      '<h3 class="sa__section-title">Сравнение с конкурентами в вашей нише</h3>' +
      '<div class="sa-bench">' +
        sorted.map(function (r) {
          var weak = r.comparison === 'behind' || r.comparison === 'slower';
          return '<div class="sa-bench__row' + (weak ? ' is-weak' : '') + '">' +
            '<span class="sa-bench__label">' + esc(r.label) + '</span>' +
            '<span class="sa-bench__values">' +
              '<b>' + esc(r.client) + '</b>' +
              '<span class="sa-bench__vs">у вас</span>' +
              '<span class="sa-bench__niche">' + esc(r.niche) + ' — типично для ниши</span>' +
            '</span>' +
          '</div>';
        }).join('') +
      '</div>';
  }

  function issueHtml(issue, index) {
    return '<article class="sa-issue" style="--sa-i:' + index + '">' +
      '<div class="sa-issue__top">' +
        '<span class="sa-badge sa-badge--' + esc(issue.severity) + '">' + esc(SEVERITY_LABELS[issue.severity] || '') + '</span>' +
        (issue.displayValue ? '<span class="sa-issue__metric">' + esc(issue.displayValue) + '</span>' : '') +
      '</div>' +
      '<h4 class="sa-issue__title">' + esc(issue.title) + '</h4>' +
      '<p class="sa-issue__text">' + esc(issue.description) + '</p>' +
      (issue.businessImpact ? '<p class="sa-issue__impact">' + esc(issue.businessImpact) + '</p>' : '') +
      (issue.recommendation ? '<p class="sa-issue__fix">' + esc(issue.recommendation) + '</p>' : '') +
    '</article>';
  }

  function metricsHtml(metrics) {
    return '<div class="sa-divider"></div>' +
      '<div class="sa-collapse" data-sa-collapse>' +
        '<button type="button" class="sa-collapse__head" data-sa-action="toggle-metrics" aria-expanded="false">' +
          '<span>Технические показатели</span>' +
          '<span class="sa-collapse__arrow">▾</span>' +
        '</button>' +
        '<div class="sa-collapse__body" data-sa-collapse-body>' +
          '<div class="sa-collapse__inner">' +
            metrics.map(function (m) {
              return '<div class="sa-metric">' +
                '<span class="sa-metric__name">' + esc(m.label) +
                  '<span class="sa-metric__hint">' + esc(m.hint || '') + '</span>' +
                '</span>' +
                '<span class="sa-metric__value">' + esc(m.displayValue || '—') + '</span>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* Продающий блок зависит от балла.
     Высокий балл — не потерянная сделка, а другой разговор: у такого
     клиента сайт технически в порядке, значит причина нехватки заявок
     в предложении, ценах или трафике. Один универсальный текст на все
     случаи звучал бы мимо и там, и там. */
  var CTA_VARIANTS = [
    {
      min: 70,
      title: 'Сайт в порядке. Тогда почему заявок мало?',
      text: 'Технически претензий немного — значит, дело не в вёрстке, а в предложении, ценах или в том, ' +
            'какой трафик на сайт приходит. Разберу вручную первый экран, оффер и путь до заявки ' +
            'и покажу, где именно теряются обращения.',
      primary: 'Разобрать предложение',
      note: 'Без обязательств. Свяжусь в Telegram и пришлю разбор с конкретными правками.'
    },
    {
      min: 40,
      title: 'Хотите понять, что исправлять в первую очередь?',
      text: 'Автоматическая проверка показывает основные слабые места, но не отвечает, что даст результат быстрее всего. ' +
            'Я разберу ваш сайт вручную, сравню с конкурентами в вашей нише и покажу конкретный план ' +
            'от самого прибыльного изменения к остальным.',
      primary: 'Получить полный разбор',
      note: 'Без обязательств. Свяжусь с вами в Telegram и пришлю основные рекомендации.'
    },
    {
      min: 0,
      title: 'Такой сайт дешевле собрать заново, чем чинить',
      text: 'Проблемы затрагивают и скорость, и структуру, и путь до заявки одновременно. ' +
            'Точечные правки здесь обычно обходятся дороже новой сборки. ' +
            'Могу посчитать оба варианта и честно сказать, что выгоднее именно в вашем случае.',
      primary: 'Посчитать оба варианта',
      note: 'Без обязательств. Скажу прямо, если чинить окажется дешевле.'
    }
  ];

  function ctaHtml(score) {
    var v = CTA_VARIANTS.find(function (item) { return score >= item.min; }) || CTA_VARIANTS[CTA_VARIANTS.length - 1];
    return '<div class="sa-cta">' +
      '<h3 class="sa-cta__title">' + esc(v.title) + '</h3>' +
      '<p class="sa-cta__text">' + esc(v.text) + '</p>' +
      '<div class="sa-cta__buttons">' +
        '<button type="button" class="sa-btn sa-btn--primary" data-sa-action="lead">' + esc(v.primary) + '</button>' +
        '<button type="button" class="sa-btn sa-btn--ghost" data-sa-action="brief">Рассчитать новый сайт</button>' +
      '</div>' +
      '<p class="sa-cta__note">' + esc(v.note) + '</p>' +
    '</div>';
  }

  /** Числа и шкалы доезжают до значений после появления карточек. */
  function animateResult(report) {
    var arc = el.body.querySelector('[data-sa-arc]');
    var num = el.body.querySelector('[data-sa-score]');
    var fills = el.body.querySelectorAll('[data-sa-fill]');

    if (reduceMotion) {
      if (arc) arc.style.strokeDashoffset = String(326.7 - 326.7 * report.score / 100);
      if (num) num.textContent = report.score;
      Array.prototype.forEach.call(fills, function (f) { f.style.width = f.getAttribute('data-sa-fill') + '%'; });
      return;
    }

    timer(function () {
      if (arc) arc.style.strokeDashoffset = String(326.7 - 326.7 * report.score / 100);
      Array.prototype.forEach.call(fills, function (f, i) {
        timer(function () { f.style.width = f.getAttribute('data-sa-fill') + '%'; }, i * 80);
      });
    }, 80);

    // Счётчик балла: 900 мс на весь путь независимо от значения
    if (num) {
      var start = performance.now();
      var step = function (now) {
        var p = Math.min(1, (now - start) / 900);
        num.textContent = Math.round(report.score * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  /* ─────────────── ЭКРАН: ошибка ─────────────── */

  function renderError(message, canRetry) {
    render(
      '<div class="sa-final">' +
        '<div class="sa-final__icon sa-final__icon--error">!</div>' +
        '<h2 class="sa__title" id="saTitle" style="padding:0">Проверка не завершилась</h2>' +
        '<p class="sa-final__text">' + esc(message) + '</p>' +
        '<div class="sa-cta__buttons" style="justify-content:center">' +
          (canRetry !== false
            ? '<button type="button" class="sa-btn sa-btn--primary" data-sa-action="retry">Попробовать ещё раз</button>'
            : '') +
          '<a class="sa-btn sa-btn--ghost" href="https://t.me/maxlobyak" target="_blank" rel="noopener">Написать в Telegram</a>' +
        '</div>' +
      '</div>',
      'error'
    );
  }

  /* ─────────────── ЭКРАН: форма заявки ─────────────── */

  function renderLeadForm() {
    var r = state.report || {};
    var cats = r.categories || {};
    var catsLine = Object.keys(cats).map(function (k) {
      return cats[k].label + ': ' + (cats[k].score == null ? '—' : cats[k].score);
    }).join('; ');
    var topIssues = (r.issues || []).slice(0, 5).map(function (i) { return i.title; }).join('; ');

    render(
      '<h2 class="sa__title" id="saTitle">Отправить сайт на разбор</h2>' +
      '<p class="sa__subtitle">Результаты проверки ' + esc(r.domain || '') +
        ' приложатся автоматически — повторно вводить адрес не нужно.</p>' +

      '<form data-sa-form="lead" novalidate>' +
        '<div class="sa-field">' +
          '<label class="sa-field__label" for="saName">Как вас зовут</label>' +
          '<input class="sa-input" id="saName" name="name" maxlength="80" autocomplete="name" placeholder="Максим">' +
        '</div>' +
        '<div class="sa-field">' +
          '<label class="sa-field__label" for="saContact">Telegram или телефон</label>' +
          '<input class="sa-input" id="saContact" name="contact" maxlength="120" placeholder="@username или +7 900 000-00-00">' +
        '</div>' +
        '<div class="sa-field">' +
          '<label class="sa-field__label" for="saComment">Комментарий — необязательно</label>' +
          '<textarea class="sa-textarea" id="saComment" name="comment" maxlength="1000" ' +
                    'placeholder="Что беспокоит больше всего"></textarea>' +
        '</div>' +

        /* Скрытые поля — для полноты формы и на случай ручной обработки.
           Сервер их НЕ использует: он берёт отчёт из своего хранилища
           по auditId, чтобы присланным баллам нельзя было подыграть. */
        '<input type="hidden" name="url" value="' + esc(r.url || '') + '">' +
        '<input type="hidden" name="score" value="' + esc(r.score) + '">' +
        '<input type="hidden" name="categories" value="' + esc(catsLine) + '">' +
        '<input type="hidden" name="issues" value="' + esc(topIssues) + '">' +
        '<input type="hidden" name="checkedAt" value="' + esc(r.createdAt || '') + '">' +
        '<input type="hidden" name="auditId" value="' + esc(r.auditId || '') + '">' +

        '<label class="sa-check">' +
          '<input type="checkbox" name="consent" value="1">' +
          '<span>Согласен с обработкой персональных данных в соответствии с политикой конфиденциальности</span>' +
        '</label>' +

        '<p class="sa-error" data-sa-error></p>' +
        '<button type="submit" class="sa-btn sa-btn--primary sa-btn--wide" data-sa-submit>Отправить сайт на разбор</button>' +
        '<p style="margin-top:16px;text-align:center">' +
          '<button type="button" class="sa-link" data-sa-action="back">Вернуться к отчёту</button>' +
        '</p>' +
      '</form>',
      'lead-form'
    );

    var first = el.body.querySelector('#saName');
    if (first && !('ontouchstart' in window)) timer(function () { first.focus(); }, 120);
  }

  function renderLeadSuccess() {
    render(
      '<div class="sa-final">' +
        '<div class="sa-final__icon">✓</div>' +
        '<h2 class="sa__title" id="saTitle" style="padding:0">Заявка отправлена</h2>' +
        '<p class="sa-final__text">Я посмотрю результаты и свяжусь с вами в ближайшее рабочее время.</p>' +
        '<button type="button" class="sa-btn sa-btn--ghost" data-sa-action="close">Закрыть</button>' +
      '</div>',
      'lead-success'
    );
  }

  /* ─────────────── обработчики ─────────────── */

  function onBodyClick(e) {
    var trigger = e.target.closest('[data-sa-action]');
    if (!trigger) return;
    var action = trigger.getAttribute('data-sa-action');

    if (action === 'retry') { renderStart(state.lastUrl); return; }
    if (action === 'close') { close(); return; }
    if (action === 'confirm-close') { close(); return; }
    if (action === 'cancel-close') {
      var box = el.body.querySelector('[data-sa-confirm]');
      if (box) box.parentNode.innerHTML = '';
      return;
    }
    if (action === 'show-all') { state.showAllIssues = true; renderResult(state.report); return; }
    if (action === 'lead') { renderLeadForm(); return; }
    if (action === 'back') { renderResult(state.report); return; }
    if (action === 'toggle-metrics') { toggleMetrics(trigger); return; }
    if (action === 'brief') {
      // Вторичное действие ведёт в существующий бриф-квиз на странице
      close();
      timer(function () {
        var brief = document.getElementById('brief');
        if (brief) brief.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      }, 340);
    }
  }

  function toggleMetrics(button) {
    var wrap = button.closest('[data-sa-collapse]');
    var body = wrap.querySelector('[data-sa-collapse-body]');
    var open = wrap.classList.toggle('is-open');
    // max-height по scrollHeight — иначе transition не отработает с auto
    body.style.maxHeight = open ? body.scrollHeight + 'px' : '0px';
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function onBodySubmit(e) {
    e.preventDefault();
    var form = e.target;
    var kind = form.getAttribute('data-sa-form');
    if (kind === 'start') submitAudit(form);
    if (kind === 'lead') submitLead(form);
  }

  /* ─────────────── запросы ─────────────── */

  function submitAudit(form) {
    if (state.busy) return; // защита от второго запроса

    var input = form.querySelector('[data-sa-url]');
    var check = validateInput(input.value);
    if (!check.ok) { showStartError(check.error); return; }

    state.busy = true;
    state.lastUrl = input.value.trim();
    var domain = check.url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

    renderLoading(domain);
    startProgress();

    abortController = new AbortController();

    fetch(API_BASE + '/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: check.url }),
      signal: abortController.signal
    })
      .then(function (res) {
        return res.json().then(function (data) { return { status: res.status, data: data }; });
      })
      .then(function (r) {
        state.busy = false;
        if (r.data && r.data.success) {
          finishProgress(function () { renderResult(r.data); });
          return;
        }
        // Ошибка от сервера: возвращаем на экран ввода с подсказкой —
        // не заставляем начинать «с нуля» и сохраняем введённый адрес
        var message = (r.data && r.data.error) || 'Не удалось завершить проверку';
        clearTimers();
        if (r.status === 429) { renderError(message, false); return; }
        renderStart(state.lastUrl, message);
      })
      .catch(function (err) {
        state.busy = false;
        clearTimers();
        if (err && err.name === 'AbortError') return; // окно закрыли — молча выходим
        renderError('Сервис проверки сейчас недоступен. Попробуйте позже или напишите мне в Telegram — посмотрю сайт вручную.');
      });
  }

  function submitLead(form) {
    if (state.busy) return;

    var errorBox = form.querySelector('[data-sa-error]');
    var button = form.querySelector('[data-sa-submit]');
    var payload = {
      auditId: form.auditId.value || undefined,
      name: form.name.value.trim(),
      contact: form.contact.value.trim(),
      comment: form.comment.value.trim(),
      consent: form.consent.checked
    };

    var fail = function (text) {
      errorBox.textContent = text;
      errorBox.classList.add('is-visible');
    };

    if (payload.name.length < 2) return fail('Укажите, как к вам обращаться');
    if (payload.contact.length < 3) return fail('Укажите Telegram или телефон для связи');
    if (!payload.consent) return fail('Нужно согласие на обработку данных');

    errorBox.classList.remove('is-visible');
    state.busy = true;
    button.disabled = true;
    button.textContent = 'Отправляем…';

    fetch(API_BASE + '/api/audit-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        state.busy = false;
        if (data && data.success) { renderLeadSuccess(); return; }
        button.disabled = false;
        button.textContent = 'Отправить сайт на разбор';
        fail((data && data.error) || 'Не удалось отправить заявку');
      })
      .catch(function () {
        state.busy = false;
        button.disabled = false;
        button.textContent = 'Отправить сайт на разбор';
        fail('Не удалось отправить заявку. Напишите мне в Telegram');
      });
  }

  /* ─────────────── подключение к кнопкам ─────────────── */

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-audit-open]');
    if (!trigger) return;
    e.preventDefault(); // у кнопки остаётся href="#brief" как запасной путь без JS
    open(trigger);
  });

  // Внешний доступ: window.SiteAudit.open() — если понадобится
  // запускать аудит из другого места (баннер, другая секция)
  window.SiteAudit = { open: open, close: close };
})();
