/* =========================================================
   КВИЗ "ПОДОБРАТЬ ПАКЕТ" — 4 вопроса → рекомендация одного из
   трёх тарифов (Start / Plus / Корпоративный).

   Вопросы рендерятся в #tariffQuizBox (секция "09.6" под тарифами,
   .brief__box — та же вёрстка, что у брифа). После последнего ответа
   открывается попап (.tqm, по центру экрана): слева на десктопе —
   карточка рекомендованного тарифа (клон реальной .pack[data-pack] из
   блока тарифов, без CTA-кнопки — она теперь в форме), справа —
   короткая причина и форма контакта. Закрывается крестиком/оверлеем/Esc,
   квиз в фоне сразу обнуляется — готов к повторному проходу.
   ========================================================= */
(function () {
  'use strict';

  var box = document.getElementById('tariffQuizBox');
  if (!box) return; // блока квиза нет на странице — выходим

  var API_BASE = (function () {
    if (window.SITE_AUDIT_API) return window.SITE_AUDIT_API;
    var isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    if (isLocal && location.port !== '3000') return 'http://localhost:3000';
    if (location.protocol === 'file:') return 'http://localhost:3000';
    return '';
  })();

  var PACKAGES = {
    start: { id: 'start', name: 'Лендинг Start', price: '45 000 ₽' },
    plus:  { id: 'plus',  name: 'Лендинг Plus',  price: '85 000 ₽' },
    corp:  { id: 'corp',  name: 'Корпоративный сайт', price: 'от 150 000 ₽' }
  };

  var REASONS = {
    start: 'одно-два направления и старт с небольшим бюджетом на рекламу — без переплаты за лишнее.',
    plus: 'вы планируете активно запускать рекламу — без CRM-интеграции и автоответов часть заявок будет теряться.',
    corp: 'несколько услуг и большой объём выполненных объектов — нужны отдельные страницы и полноценный каталог.'
  };

  /* очки по вариантам ответа — пакет с максимальной суммой побеждает,
     при равенстве выигрывает более дешёвый (порядок start → plus → corp) */
  var QUESTIONS = [
    {
      id: 'services', q: 'Сколько услуг или направлений показываете на сайте?',
      options: [
        { label: 'Одно-два направления', scores: { start: 1, plus: 1, corp: 0 } },
        { label: 'Несколько разных услуг', scores: { start: 0, plus: 2, corp: 0 } },
        { label: 'Много, нужны отдельные страницы под каждое', scores: { start: 0, plus: 0, corp: 3 } }
      ]
    },
    {
      id: 'portfolio', q: 'Нужен каталог выполненных объектов?',
      options: [
        { label: 'Пары примеров хватит', scores: { start: 2, plus: 0, corp: 0 } },
        { label: 'Кейсы до/после', scores: { start: 0, plus: 2, corp: 0 } },
        { label: 'Полноценный каталог с категориями', scores: { start: 0, plus: 0, corp: 3 } }
      ]
    },
    {
      id: 'ads', q: 'Планируете запускать рекламу (Директ, Авито)?',
      options: [
        { label: 'Да, активно и сразу с заметным бюджетом', scores: { start: 0, plus: 2, corp: 0 } },
        { label: 'Да, но начинаем с малого', scores: { start: 2, plus: 0, corp: 0 } },
        { label: 'Реклама не в приоритете, важнее статус', scores: { start: 0, plus: 0, corp: 1 } }
      ]
    },
    {
      id: 'leads', q: 'Важно не терять заявки — нужны CRM и автоответы клиентам?',
      options: [
        { label: 'Да, критично', scores: { start: 0, plus: 2, corp: 1 } },
        { label: 'Пока не актуально', scores: { start: 2, plus: 0, corp: 0 } }
      ]
    }
  ];

  var state = { step: 0, answers: [] };
  var pop = {}; // ссылки на узлы попапа, заполняются в buildPopup()

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ─────────────── подсчёт рекомендованного пакета ─────────────── */

  function computePackage() {
    var totals = { start: 0, plus: 0, corp: 0 };
    state.answers.forEach(function (a) {
      totals.start += a.scores.start;
      totals.plus  += a.scores.plus;
      totals.corp  += a.scores.corp;
    });
    var best = 'start';
    ['start', 'plus', 'corp'].forEach(function (id) {
      if (totals[id] > totals[best]) best = id;
    });
    return best;
  }

  /* ─────────────── экран вопросов (#tariffQuizBox) ─────────────── */

  function renderQuestion() {
    var cur = QUESTIONS[state.step];
    var bars = QUESTIONS.map(function (_, i) {
      return '<span class="' + (i <= state.step ? 'is-on' : '') + '"></span>';
    }).join('');
    var opts = cur.options.map(function (o, i) {
      return '<button type="button" data-tq-answer="' + i + '">' + esc(o.label) + '</button>';
    }).join('');

    box.innerHTML =
      '<div class="brief__bars">' + bars + '</div>' +
      '<p class="brief__counter">Вопрос ' + (state.step + 1) + ' из ' + QUESTIONS.length + '</p>' +
      '<p class="brief__q">' + esc(cur.q) + '</p>' +
      '<div class="brief__opts">' + opts + '</div>';
  }

  function onBoxClick(e) {
    var answerBtn = e.target.closest('[data-tq-answer]');
    if (!answerBtn) return;

    var idx = Number(answerBtn.getAttribute('data-tq-answer'));
    var cur = QUESTIONS[state.step];
    state.answers.push({ id: cur.id, question: cur.q, label: cur.options[idx].label, scores: cur.options[idx].scores });
    state.step++;

    if (state.step >= QUESTIONS.length) {
      var pickedId = computePackage();
      var finishedAnswers = state.answers.slice();
      /* сразу обнуляем квиз в фоне — к моменту, когда человек закроет
         попап, он готов к повторному проходу без лишних действий.
         Сами ответы не теряем — уходят в openPopup() и попадут в заявку. */
      state.step = 0;
      state.answers = [];
      openPopup(pickedId, finishedAnswers);
    }
    renderQuestion();
  }

  box.addEventListener('click', onBoxClick);

  /* ─────────────── попап результата ─────────────── */

  function buildPopup() {
    var root = document.createElement('div');
    root.className = 'tqm';
    root.id = 'tqPopup';
    root.hidden = true;
    root.innerHTML =
      '<div class="tqm__overlay" data-tqm-close></div>' +
      '<div class="tqm__panel" role="dialog" aria-modal="true" aria-labelledby="tqmReco" tabindex="-1">' +
        '<button type="button" class="tqm__close" data-tqm-close aria-label="Закрыть окно">&times;</button>' +
        '<div class="tqm__scroll">' +
          '<div class="tqm__grid">' +
            '<div class="tqm__card" data-tqm-card></div>' +
            '<div class="tqm__right">' +
              '<p class="tqm__reco" id="tqmReco" data-tqm-reco></p>' +
              '<div data-tqm-form></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);

    pop.root = root;
    pop.card = root.querySelector('[data-tqm-card]');
    pop.reco = root.querySelector('[data-tqm-reco]');
    pop.formSlot = root.querySelector('[data-tqm-form]');

    root.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-tqm-close')) closePopup();
    });
    pop.formSlot.addEventListener('submit', onPopupSubmit);
  }

  function onPopupKeydown(e) {
    if (e.key === 'Escape') closePopup();
  }

  function openPopup(packageId, answers) {
    if (!pop.root) buildPopup();
    pop.answers = answers || [];

    /* карточка — реальный клон из блока тарифов, не переписанный текст:
       характеристики/состав пакета не могут разъехаться с оригиналом.
       Кнопку внизу клона убираем — она заменена формой справа. */
    var source = document.querySelector('.pack[data-pack="' + packageId + '"]');
    pop.card.innerHTML = '';
    if (source) {
      var clone = source.cloneNode(true);
      /* тёмный вариант карточки — уже готовый .pack--hl (сейчас на
         странице им пользуется только Plus), просто раздаём его всем
         клонам в попапе, вместо того чтобы красить карточку заново */
      clone.classList.add('pack--hl');
      var cta = clone.querySelector('a.btn, button.btn');
      if (cta) cta.remove();
      clone.querySelectorAll('.pack__tip').forEach(function (tip) { tip.remove(); }); // без JS-обработчика в клоне кнопка не работала бы
      pop.card.appendChild(clone);
    }

    pop.reco.innerHTML = '<b>Рекомендую ' + esc(PACKAGES[packageId].name) + '</b> — ' + esc(REASONS[packageId]);
    renderPopupForm(packageId);

    if (window.scrollLock) window.scrollLock.lock(); else document.body.classList.add('sa-lock');
    pop.root.hidden = false;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { pop.root.classList.add('is-open'); });
    });
    document.addEventListener('keydown', onPopupKeydown, true);
  }

  function closePopup() {
    if (!pop.root || pop.root.hidden) return;
    pop.root.classList.remove('is-open');
    document.removeEventListener('keydown', onPopupKeydown, true);
    setTimeout(function () {
      pop.root.hidden = true;
      if (window.scrollLock) window.scrollLock.unlock(); else document.body.classList.remove('sa-lock');
    }, 420); // чуть больше transition (.4s) у .tqm__panel — чтобы не хлопнуло на середине сдвига
  }

  function renderPopupForm(packageId) {
    pop.formSlot.innerHTML =
      '<h3 class="tq-title">Оставьте заявку</h3>' +
      '<p class="tq-subtitle">Свяжусь и уточню детали.</p>' +
      '<form data-tq-form novalidate data-package-id="' + esc(packageId) + '">' +
        '<div class="tq-field">' +
          '<label class="tq-label" for="tqmName">Как вас зовут</label>' +
          '<input class="tq-input" id="tqmName" name="name" maxlength="80" autocomplete="name" placeholder="Максим">' +
        '</div>' +
        '<div class="tq-field">' +
          '<label class="tq-label" for="tqmContact">Telegram или WhatsApp</label>' +
          '<input class="tq-input" id="tqmContact" name="contact" maxlength="120" placeholder="@username или WhatsApp">' +
        '</div>' +
        '<p class="tq-error" data-tq-error></p>' +
        '<label class="tq-check">' +
          '<input type="checkbox" name="consent" required>' +
          '<span>Согласен на обработку <a href="/" class="tq-check-link">персональным данным</a></span>' +
        '</label>' +
        '<button type="submit" class="btn btn--lime tq-btn-wide">Отправить</button>' +
      '</form>';
  }

  function onPopupSubmit(e) {
    var form = e.target.closest('[data-tq-form]');
    if (!form) return;
    e.preventDefault();

    var errorEl = form.querySelector('[data-tq-error]');
    var name = form.name.value.trim();
    var contact = form.contact.value.trim();
    var consent = form.consent.checked;

    if (name.length < 2) return showFormError(errorEl, 'Укажите имя');
    if (contact.length < 3) return showFormError(errorEl, 'Укажите способ связи');
    if (!consent) return showFormError(errorEl, 'Нужно согласие на обработку данных');

    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляю…';

    var pkg = PACKAGES[form.getAttribute('data-package-id')];
    var payload = {
      source: 'quiz_calculate',
      name: name,
      contact: contact,
      consent: true,
      package: pkg,
      answers: pop.answers.map(function (a) { return { question: a.question, answer: a.label }; })
    };

    fetch(API_BASE + '/api/quiz-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        if (!r.ok || !r.data.success) {
          throw new Error((r.data && r.data.error) || 'Не удалось отправить заявку');
        }
        pop.formSlot.innerHTML =
          '<div class="brief__done">' +
            '<div class="brief__done-check">✓</div>' +
            '<p class="brief__done-title">Отлично, спасибо!</p>' +
            '<p class="brief__done-text">Свяжусь в течение часа. В рабочее время — быстрее.</p>' +
          '</div>';
      })
      .catch(function (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Отправить';
        showFormError(errorEl, err.message || 'Не удалось отправить. Напишите в Telegram');
      });
  }

  function showFormError(errorEl, text) {
    if (!errorEl) return;
    errorEl.textContent = text;
    errorEl.classList.add('is-visible');
  }

  renderQuestion();
})();
