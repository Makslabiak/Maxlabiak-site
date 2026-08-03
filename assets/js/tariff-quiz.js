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

   Тот же попап открывается и напрямую с кнопок в карточках тарифов
   ([data-pack-open="start|plus|corp"]) — тогда без вопросов квиза,
   сразу карточка + форма. Источник лида (source) в обоих случаях
   разный, чтобы на бэкенде различать, откуда пришла заявка.
   В форме — не только кнопка "Отправить", но и прямые ссылки на
   Telegram/WhatsApp с предзаполненным текстом (какой пакет интересует) —
   часть аудитории предпочитает сразу написать, а не заполнять форму;
   без предзаполненного текста при этом терялся бы контекст заявки.
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

  var CONTACTS = { tg: 'maxlobyak', waNumber: '375257950710' };

  /* переключатель канала связи над полем контакта — у каждого канала
     свой набор разрешённых символов, свой плейсхолдер и своя проверка,
     вместо одной общей регулярки, пытавшейся угадать канал по виду
     введённого текста (путалась на WhatsApp-юзернеймах с точками) */
  var CHANNELS = {
    telegram: {
      icon: 'images/00-shapka/icon-telegram.svg', label: 'Telegram',
      placeholder: '@username', allowed: /[^a-zA-Z0-9_@]/g,
      validate: function (v) { return /^@[a-zA-Z0-9_]{5,32}$/.test(v.trim()); },
      error: 'Введите @username в Telegram (5–32 символа)'
    },
    whatsapp: {
      icon: 'images/10-faq/WhatsApp.svg', label: 'WhatsApp',
      placeholder: '+7 900 123-45-67', allowed: /[^0-9+\-\s()]/g,
      validate: function (v) { return /^\+?\d{6,15}$/.test(v.replace(/[\s\-()]/g, '')); },
      error: 'Введите номер телефона WhatsApp'
    },
    email: {
      icon: null, label: 'Email',
      placeholder: 'you@example.com', allowed: /[^a-zA-Z0-9@._\-+]/g,
      validate: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()); },
      error: 'Введите корректный email'
    }
  };
  var CHANNEL_ORDER = ['telegram', 'whatsapp', 'email'];

  function channelButtonsHtml() {
    return CHANNEL_ORDER.map(function (id, i) {
      var ch = CHANNELS[id];
      var inner = ch.icon ? '<img src="' + ch.icon + '" alt="">' : '<span class="tq-channel-at">@</span>';
      return '<button type="button" class="tq-channel' + (i === 0 ? ' is-active' : '') +
             '" data-channel="' + id + '" aria-label="' + ch.label + '">' + inner + '</button>';
    }).join('');
  }

  /* привязывает переключатель к полю: клик по иконке меняет плейсхолдер/
     allowed-символы/валидацию для этого поля; возвращает объект с
     текущим каналом и проверкой — используется при отправке формы */
  function setupChannelPicker(root) {
    var buttons = root.querySelectorAll('.tq-channel');
    var input = root.querySelector('[name="contact"]');
    var current = CHANNEL_ORDER[0];

    function apply(id) {
      current = id;
      input.placeholder = CHANNELS[id].placeholder;
      input.value = ''; // старое значение почти наверняка не подходит под новый формат
      buttons.forEach(function (btn) { btn.classList.toggle('is-active', btn.getAttribute('data-channel') === id); });
      clearFieldError(root, 'contact');
    }

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        apply(btn.getAttribute('data-channel'));
        input.focus();
      });
    });

    input.addEventListener('input', function () {
      var cleaned = input.value.replace(CHANNELS[current].allowed, '');
      if (cleaned !== input.value) input.value = cleaned;
    });

    return {
      getChannel: function () { return current; },
      isValid: function () { return CHANNELS[current].validate(input.value); },
      getError: function () { return CHANNELS[current].error; }
    };
  }

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* прямые ссылки на TG/WhatsApp с предзаполненным текстом — чтобы даже
     тот, кто пропускает форму и пишет напрямую, не терял контекст
     (какой пакет его интересовал), и не пришлось переспрашивать */
  function buildDirectLinks(packageId) {
    var pkg = PACKAGES[packageId];
    var text = encodeURIComponent('Здравствуйте! Интересует пакет «' + pkg.name + '», ' + pkg.price + '.');
    return {
      tg: 'https://t.me/' + CONTACTS.tg + '?text=' + text,
      wa: 'https://wa.me/' + CONTACTS.waNumber + '?text=' + text
    };
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

  /* ─────────────── запуск попапа прямо с кнопок в карточках тарифов ─────────────── */

  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-pack-open]');
    if (!opener) return;
    e.preventDefault();
    openPopup(opener.getAttribute('data-pack-open'), [], 'pricing_card_' + opener.getAttribute('data-pack-open'));
  });

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

  function openPopup(packageId, answers, source) {
    if (!pop.root) buildPopup();
    pop.answers = answers || [];
    pop.source = source || 'quiz_calculate';

    /* карточка — реальный клон из блока тарифов, не переписанный текст:
       характеристики/состав пакета не могут разъехаться с оригиналом.
       Кнопку внизу клона убираем — она заменена формой справа. */
    var sourceCard = document.querySelector('.pack[data-pack="' + packageId + '"]');
    pop.card.innerHTML = '';
    if (sourceCard) {
      var clone = sourceCard.cloneNode(true);
      /* тёмный вариант карточки — уже готовый .pack--hl (сейчас на
         странице им пользуется только Plus), просто раздаём его всем
         клонам в попапе, вместо того чтобы красить карточку заново */
      clone.classList.add('pack--hl');
      var cta = clone.querySelector('a.btn, button.btn');
      if (cta) cta.remove();
      clone.querySelectorAll('.pack__tip').forEach(function (tip) { tip.remove(); }); // без JS-обработчика в клоне кнопка не работала бы
      pop.card.appendChild(clone);
    }

    pop.reco.hidden = pop.source !== 'quiz_calculate';
    if (!pop.reco.hidden) {
      pop.reco.innerHTML = '<b>Рекомендую ' + esc(PACKAGES[packageId].name) + '</b> — ' + esc(REASONS[packageId]);
    }
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
    var direct = buildDirectLinks(packageId);
    pop.formSlot.innerHTML =
      '<h3 class="tq-title">Оставьте заявку</h3>' +
      '<p class="tq-subtitle">Свяжусь и уточню детали.</p>' +
      '<form data-tq-form novalidate data-package-id="' + esc(packageId) + '">' +
        '<div class="tq-field">' +
          '<label class="tq-label" for="tqmName">Как вас зовут</label>' +
          '<input class="tq-input" id="tqmName" name="name" maxlength="80" autocomplete="name" placeholder="Максим">' +
          '<p class="tq-field-error" data-error-for="name"></p>' +
        '</div>' +
        '<div class="tq-field">' +
          '<label class="tq-label">Способ связи</label>' +
          '<div class="tq-channels">' + channelButtonsHtml() + '</div>' +
          '<input class="tq-input" id="tqmContact" name="contact" maxlength="120" placeholder="' + CHANNELS[CHANNEL_ORDER[0]].placeholder + '">' +
          '<p class="tq-field-error" data-error-for="contact"></p>' +
        '</div>' +
        '<p class="tq-error" data-tq-error></p>' +
        '<label class="tq-check">' +
          '<input type="checkbox" name="consent" required>' +
          '<span>Согласен на обработку <a href="/" class="tq-check-link">персональным данным</a></span>' +
        '</label>' +
        '<button type="submit" class="btn btn--lime tq-btn-wide">Отправить</button>' +
      '</form>' +
      '<p class="tq-or">или сразу напишите</p>' +
      '<div class="tq-direct">' +
        '<a class="tq-direct-link" href="' + direct.tg + '" target="_blank" rel="noopener">Telegram</a>' +
        '<a class="tq-direct-link" href="' + direct.wa + '" target="_blank" rel="noopener">WhatsApp</a>' +
      '</div>';

    pop.channelPicker = setupChannelPicker(pop.formSlot);

    /* ошибку убираем сразу по клику/фокусу на поле, не дожидаясь ввода —
       не ждём повторной отправки формы, чтобы это заметить */
    pop.formSlot.querySelectorAll('.tq-input').forEach(function (input) {
      input.addEventListener('focus', function () { clearFieldError(pop.formSlot, input.name); });
      input.addEventListener('input', function () { clearFieldError(pop.formSlot, input.name); });
    });
    // отдельно: чекбокс согласия не .tq-input, ошибка на нём — общий tq-error
    var consentInput = pop.formSlot.querySelector('[name="consent"]');
    consentInput.addEventListener('change', function () {
      if (consentInput.checked) {
        var generalError = pop.formSlot.querySelector('[data-tq-error]');
        generalError.classList.remove('is-visible');
      }
    });
  }

  function setFieldError(root, fieldName, message) {
    var input = root.querySelector('[name="' + fieldName + '"]');
    var errorEl = root.querySelector('[data-error-for="' + fieldName + '"]');
    if (input) input.classList.add('is-error');
    if (errorEl) { errorEl.textContent = message; errorEl.classList.add('is-visible'); }
  }

  function clearFieldError(root, fieldName) {
    var input = root.querySelector('[name="' + fieldName + '"]');
    var errorEl = root.querySelector('[data-error-for="' + fieldName + '"]');
    if (input) input.classList.remove('is-error');
    if (errorEl) { errorEl.textContent = ''; errorEl.classList.remove('is-visible'); }
  }

  function onPopupSubmit(e) {
    var form = e.target.closest('[data-tq-form]');
    if (!form) return;
    e.preventDefault();

    var errorEl = form.querySelector('[data-tq-error]');
    errorEl.classList.remove('is-visible');
    clearFieldError(form, 'name');
    clearFieldError(form, 'contact');

    var name = form.name.value.trim();
    var contact = form.contact.value.trim();
    var consent = form.consent.checked;
    var hasError = false;

    if (name.length < 2) { setFieldError(form, 'name', 'Укажите имя'); hasError = true; }
    if (!pop.channelPicker.isValid()) {
      setFieldError(form, 'contact', pop.channelPicker.getError());
      hasError = true;
    }
    if (!consent) return showFormError(errorEl, 'Нужно согласие на обработку данных');
    if (hasError) return;

    var submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляю…';

    var pkg = PACKAGES[form.getAttribute('data-package-id')];
    var payload = {
      source: pop.source,
      name: name,
      contact: contact,
      channel: pop.channelPicker.getChannel(),
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
