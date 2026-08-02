/**
 * report.service.js — превращает сырые сигналы в человеческий отчёт.
 *
 * РЕДАКЦИЯ 2. Правила пересобраны вокруг шести причин, по которым сайт
 * ремонтной компании не даёт заявок (они же перечислены в секции
 * «Почему сайт не даёт заявок» на самом сайте). Смысл в том, чтобы аудит
 * находил ровно те проблемы, о которых потом идёт разговор, а не набор
 * абстрактных SEO-замечаний.
 *
 * Здесь и только здесь живут ФОРМУЛИРОВКИ. Правила описаны декларативно:
 * { id, when, build }. Добавить проверку = добавить объект.
 *
 * Тон: ничего не обещаем и не пугаем. «Может увеличивать отказы» — можно,
 * «вы теряете 70% клиентов» — нельзя, таких данных у нас нет.
 */

import { METRIC_THRESHOLDS, METRIC_HINTS } from '../config/audit-rules.js';
import { SEVERITY_ORDER } from '../config/score-weights.js';

const sec = (ms) => (ms == null ? null : (ms / 1000).toFixed(1).replace('.', ',') + ' сек.');
const num = (m) => (m && typeof m.value === 'number' ? m.value : null);
const opp = (d, id) => d.ps?.opportunities?.find((o) => o.id === id) || null;

/* ═══════════════════════════════════════════════════════════
   ШЕСТЬ ГЛАВНЫХ ПРОБЛЕМ
   Порядок и нумерация совпадают с секцией сайта. Эти правила
   идут первыми в файле намеренно: они важнее технических.
   ═══════════════════════════════════════════════════════════ */

const CORE_RULES = [
  /* ── 01. Нет предварительного расчёта ──
     Одно правило на две ситуации: цен нет вовсе и цены обещаны, но не
     показаны. Практическая проблема у клиента одна и та же — узнать
     порядок сумм нельзя, — поэтому и штраф должен быть один, а не два. */
  {
    id: 'no-price-estimate',
    when: (d) => !d.html.calculator.found && !d.html.prices.hasNumbers,
    build: (d) => ({
      category: 'conversion', severity: 'critical',
      title: d.html.prices.wordOnly
        ? 'О стоимости написано, но узнать её нельзя'
        : 'Узнать порядок цен на сайте невозможно',
      description: d.html.prices.wordOnly
        ? 'Слова «цена» и «стоимость» на странице есть, а конкретных сумм и калькулятора рядом с ними не найдено.'
        : 'На странице нет ни цифр стоимости, ни калькулятора или квиза для предварительного расчёта.',
      businessImpact: 'Первый вопрос клиента — сколько это стоит. Не получив даже вилки, он уходит сравнивать к тем, кто цену показал.',
      recommendation: 'Показать стоимость за квадратный метр по типам ремонта и добавить расчёт, который выдаёт сумму сразу на экране.',
      source: 'html', metric: 'priceEstimate',
      displayValue: d.html.prices.wordOnly ? 'цифр нет' : null
    })
  },
  {
    id: 'no-calculator',
    when: (d) => !d.html.calculator.found && d.html.prices.hasNumbers,
    build: () => ({
      category: 'conversion', severity: 'medium',
      title: 'Нет расчёта под конкретный объект',
      description: 'Цены на странице есть, но посчитать стоимость своей квартиры посетитель не может.',
      businessImpact: 'Общий прайс не отвечает на вопрос «сколько выйдет у меня» — за ответом человек идёт к конкуренту с калькулятором.',
      recommendation: 'Добавить калькулятор или квиз из 4–5 вопросов с расчётом прямо на экране.',
      source: 'html', metric: 'calculator', displayValue: null
    })
  },
  {
    id: 'no-price-per-meter',
    when: (d) => d.html.prices.hasNumbers && !d.html.prices.perSquareMeter,
    build: () => ({
      category: 'conversion', severity: 'low',
      title: 'Цены есть, но не за квадратный метр',
      description: 'Стоимость указана, однако привычного для ремонта ориентира «₽ за м²» найти не удалось.',
      businessImpact: 'Клиент считает бюджет от площади и не может быстро сопоставить ваши цифры с чужими.',
      recommendation: 'Привести цены к формату за квадратный метр — так их сравнивают.',
      source: 'html', metric: 'pricePerMeter', displayValue: null
    })
  },

  /* ── 02. Форма просит телефон сразу ── */
  {
    id: 'phone-upfront',
    when: (d) => d.html.forms.onlyPhoneAsked && !d.html.calculator.found,
    build: () => ({
      category: 'conversion', severity: 'high',
      title: 'Единственный способ связи — отдать телефон',
      description: 'Форма просит номер сразу, а промежуточного шага вроде расчёта или подбора на странице нет.',
      businessImpact: 'Оставлять контакт до того, как что-то узнал, готова малая часть посетителей — остальные закрывают страницу.',
      recommendation: 'Сначала дать пользу: расчёт, подбор, смету на почту. Телефон просить последним шагом, когда человек уже вовлечён.',
      source: 'html', metric: 'phoneUpfront', displayValue: null
    })
  },
  {
    id: 'form-too-long',
    when: (d) => d.html.forms.fields >= 5,
    build: (d) => ({
      category: 'conversion', severity: 'medium',
      title: 'Форма просит слишком много данных',
      description: `В формах на странице примерно ${d.html.forms.fields} полей для заполнения.`,
      businessImpact: 'Каждое лишнее поле снижает долю тех, кто дойдёт до отправки.',
      recommendation: 'Оставить минимум полей, остальное уточнять при разговоре.',
      source: 'html', metric: 'formFields', displayValue: `${d.html.forms.fields} полей`
    })
  },

  /* ── 03. Фото со стоков вместо объектов ── */
  {
    id: 'stock-photos',
    when: (d) => d.html.images.stock.count >= 3 || d.html.images.stock.share >= 30,
    build: (d) => ({
      category: 'trust',
      severity: d.html.images.stock.share >= 50 ? 'high' : 'medium',
      title: 'На странице найдены стоковые фотографии',
      description: `Обнаружено изображений из фотобанков: ${d.html.images.stock.count}` +
        (d.html.images.stock.sources.length ? ` (${d.html.images.stock.sources.join(', ')})` : '') + '.',
      businessImpact: 'Одинаковые картинки из фотобанков стоят на сотнях сайтов и не доказывают, что ремонт делали именно вы.',
      recommendation: 'Заменить на собственные фото объектов — даже снятые на телефон работают лучше идеальных стоковых.',
      source: 'html', metric: 'stockImages', displayValue: `${d.html.images.stock.share}% изображений`
    })
  },

  /* ── 04. Ни слова про смету и договор ── */
  {
    id: 'weak-guarantees',
    when: (d) => !d.html.trust.enough,
    build: (d) => ({
      category: 'trust', severity: 'high',
      title: 'Не удалось обнаружить внятных гарантий',
      description: d.html.trust.groupCount === 0
        ? 'На странице не нашлось упоминаний договора, сметы или гарантийного срока.'
        : 'Упоминание есть, но подробностей — срока гарантии, условий договора, порядка оплаты — обнаружить не удалось.',
      businessImpact: 'Главный страх заказчика ремонта — скрытые доплаты и срыв сроков. Без ответа на странице он остаётся с этим страхом.',
      recommendation: 'Написать срок гарантии числом, показать образец договора и объяснить, как фиксируется смета.',
      source: 'html', metric: 'guarantee', displayValue: null
    })
  },
  {
    id: 'no-warranty-term',
    when: (d) => d.html.trust.enough && !d.html.trust.hasWarrantyTerm,
    build: () => ({
      category: 'trust', severity: 'medium',
      title: 'Гарантия упомянута без конкретного срока',
      description: 'Слово «гарантия» на странице есть, а на сколько лет она даётся — не сказано.',
      businessImpact: 'Гарантия без срока звучит как формальность и почти не работает как аргумент.',
      recommendation: 'Указать срок числом: «гарантия 2 года по договору».',
      source: 'html', metric: 'warrantyTerm', displayValue: null
    })
  },
  {
    id: 'no-estimate-mention',
    // Только когда прочие признаки доверия есть: иначе накладывается
    // на weak-guarantees и наказывает дважды за один пробел
    when: (d) => d.html.trust.enough && !d.html.trust.groups.includes('estimate'),
    build: () => ({
      category: 'trust', severity: 'medium',
      title: 'Про смету и фиксацию цены ничего не сказано',
      description: 'Упоминаний сметы, фиксированной стоимости или отсутствия скрытых доплат обнаружить не удалось.',
      businessImpact: 'Страх, что итоговая сумма вырастет вдвое, — одна из главных причин не оставлять заявку.',
      recommendation: 'Добавить блок о том, как считается смета и что входит в цену.',
      source: 'html', metric: 'estimate', displayValue: null
    })
  },

  /* ── 05. Некому ответить на вопрос ── */
  {
    id: 'no-instant-answer',
    when: (d) => !d.html.contacts.chatWidget.found && !d.html.contacts.telegram &&
                 !d.html.contacts.whatsapp && !d.html.contacts.callback,
    build: () => ({
      category: 'conversion', severity: 'high',
      title: 'Задать быстрый вопрос негде',
      description: 'На странице не найдено ни онлайн-чата, ни мессенджеров, ни формы обратного звонка.',
      businessImpact: 'Пока клиент ждёт ответа на письмо или собирается позвонить, он успевает написать трём вашим конкурентам.',
      recommendation: 'Поставить кнопки WhatsApp и Telegram в шапку и добавить обратный звонок.',
      source: 'html', metric: 'instantAnswer', displayValue: null
    })
  },
  {
    id: 'no-messengers',
    when: (d) => !d.html.contacts.telegram && !d.html.contacts.whatsapp &&
                 (d.html.contacts.chatWidget.found || d.html.contacts.callback),
    build: () => ({
      category: 'conversion', severity: 'medium',
      title: 'Нет связи через мессенджеры',
      description: 'Ссылок на WhatsApp или Telegram на странице не обнаружено.',
      businessImpact: 'Значительная часть аудитории не звонит и не заполняет формы принципиально — только переписка.',
      recommendation: 'Добавить прямые ссылки на мессенджеры с заранее подставленным текстом сообщения.',
      source: 'html', metric: 'messengers', displayValue: null
    })
  }
];

/* ═══════════════════════════════════════════════════════════
   06. СКОРОСТЬ И МОБИЛЬНАЯ ВЁРСТКА
   ═══════════════════════════════════════════════════════════ */

const SPEED_RULES = [
  {
    id: 'slow-lcp',
    when: (d) => d.ps && num(d.ps.metrics.lcp) > METRIC_THRESHOLDS.lcp.good,
    build: (d) => ({
      category: 'performance',
      severity: num(d.ps.metrics.lcp) > METRIC_THRESHOLDS.lcp.poor ? 'critical' : 'high',
      title: 'Первый экран загружается слишком долго',
      description: `Основной контент становится видимым примерно через ${sec(num(d.ps.metrics.lcp))}`,
      businessImpact: 'Посетители из Директа и Авито могут закрыть страницу до появления предложения — деньги за клик уже потрачены.',
      recommendation: 'Оптимизировать главное изображение, шрифты и блокирующие скрипты.',
      source: 'pagespeed', metric: 'lcp', displayValue: d.ps.metrics.lcp.displayValue || sec(num(d.ps.metrics.lcp))
    })
  },
  {
    id: 'slow-fcp',
    when: (d) => d.ps && num(d.ps.metrics.fcp) > METRIC_THRESHOLDS.fcp.poor,
    build: (d) => ({
      category: 'performance', severity: 'medium',
      title: 'Долго держится пустой экран',
      description: `Первые элементы появляются примерно через ${sec(num(d.ps.metrics.fcp))}`,
      businessImpact: 'Часть посетителей может не дождаться загрузки.',
      recommendation: 'Уменьшить объём кода, загружаемого до первой отрисовки.',
      source: 'pagespeed', metric: 'fcp', displayValue: d.ps.metrics.fcp.displayValue
    })
  },
  {
    id: 'layout-shift',
    when: (d) => d.ps && num(d.ps.metrics.cls) > METRIC_THRESHOLDS.cls.good,
    build: (d) => ({
      category: 'performance',
      severity: num(d.ps.metrics.cls) > METRIC_THRESHOLDS.cls.poor ? 'high' : 'medium',
      title: 'Элементы прыгают во время загрузки',
      description: 'Пока страница грузится, блоки смещаются, и вёрстка «дёргается».',
      businessImpact: 'Пользователь может промахнуться по кнопке и раздражённо уйти.',
      recommendation: 'Задать явные размеры изображениям и зарезервировать место под баннеры и шрифты.',
      source: 'pagespeed', metric: 'cls', displayValue: d.ps.metrics.cls.displayValue
    })
  },
  {
    id: 'blocking-js',
    when: (d) => d.ps && num(d.ps.metrics.tbt) > METRIC_THRESHOLDS.tbt.poor,
    build: (d) => ({
      category: 'performance', severity: 'high',
      title: 'Скрипты подвешивают страницу',
      description: 'После загрузки страница какое-то время не реагирует на нажатия.',
      businessImpact: 'Нажатие на кнопку заявки может не сработать с первого раза.',
      recommendation: 'Отложить сторонние скрипты и убрать неиспользуемый JavaScript.',
      source: 'pagespeed', metric: 'tbt', displayValue: d.ps.metrics.tbt.displayValue
    })
  },
  {
    id: 'heavy-page',
    when: (d) => d.ps?.page?.totalKb > 3000,
    build: (d) => ({
      category: 'performance', severity: 'medium',
      title: 'Страница весит слишком много',
      description: `Для открытия страницы загружается около ${Math.round(d.ps.page.totalKb / 1024 * 10) / 10} МБ данных.`,
      businessImpact: 'На мобильном интернете это заметно увеличивает время ожидания.',
      recommendation: 'Сжать изображения и перевести их в современный формат.',
      source: 'pagespeed', metric: 'pageWeight', displayValue: `${Math.round(d.ps.page.totalKb / 1024 * 10) / 10} МБ`
    })
  },
  {
    id: 'unoptimized-images',
    when: (d) => opp(d, 'modern-image-formats')?.savingsKb > 300 || opp(d, 'uses-optimized-images')?.savingsKb > 300,
    build: (d) => {
      const o = opp(d, 'modern-image-formats')?.savingsKb > 300 ? opp(d, 'modern-image-formats') : opp(d, 'uses-optimized-images');
      return {
        category: 'performance', severity: 'medium',
        title: 'Изображения тяжелее, чем нужно',
        description: `Только на картинках можно сэкономить около ${Math.round(o.savingsKb / 1024 * 10) / 10} МБ.`,
        businessImpact: 'Фотографии объектов — главный вес страницы, и они же дольше всего грузятся.',
        recommendation: 'Пересохранить фото в WebP и отдавать разные размеры под телефон и десктоп.',
        source: 'pagespeed', metric: 'images', displayValue: `−${o.savingsKb} КБ`
      };
    }
  },
  {
    id: 'render-blocking',
    when: (d) => opp(d, 'render-blocking-resources')?.savingsMs > 500,
    build: (d) => ({
      category: 'performance', severity: 'medium',
      title: 'Стили и скрипты задерживают отрисовку',
      description: 'Браузер ждёт загрузки внешних файлов, прежде чем показать содержимое.',
      businessImpact: 'Экран остаётся пустым дольше, чем нужно.',
      recommendation: 'Вынести критические стили в разметку, остальное грузить отложенно.',
      source: 'pagespeed', metric: 'renderBlocking',
      displayValue: `−${Math.round(opp(d, 'render-blocking-resources').savingsMs / 100) / 10} сек.`
    })
  },
  {
    id: 'unused-code',
    when: (d) => (opp(d, 'unused-javascript')?.savingsKb || 0) + (opp(d, 'unused-css-rules')?.savingsKb || 0) > 400,
    build: () => ({
      category: 'performance', severity: 'low',
      title: 'Загружается неиспользуемый код',
      description: 'Часть скриптов и стилей скачивается, но на странице не применяется.',
      businessImpact: 'Лишний вес замедляет загрузку, особенно на слабых телефонах.',
      recommendation: 'Убрать неиспользуемые плагины и лишние библиотеки.',
      source: 'pagespeed', metric: 'unusedCode', displayValue: null
    })
  },
  {
    id: 'no-caching',
    when: (d) => opp(d, 'uses-long-cache-ttl')?.savingsKb > 500,
    build: () => ({
      category: 'performance', severity: 'low',
      title: 'Файлы не кешируются надолго',
      description: 'При повторном заходе браузер скачивает те же файлы заново.',
      businessImpact: 'Возвращающиеся посетители ждут загрузку так же долго, как в первый раз.',
      recommendation: 'Настроить заголовки кеширования на сервере.',
      source: 'pagespeed', metric: 'cache', displayValue: null
    })
  },
  {
    id: 'font-display',
    when: (d) => opp(d, 'font-display')?.savingsMs > 200,
    build: () => ({
      category: 'performance', severity: 'low',
      title: 'Текст ждёт загрузки шрифта',
      description: 'Пока шрифт не скачался, надписи не видны.',
      businessImpact: 'Заголовок появляется позже, чем мог бы.',
      recommendation: 'Добавить font-display: swap для веб-шрифтов.',
      source: 'pagespeed', metric: 'fonts', displayValue: null
    })
  },

  /* ── мобильная вёрстка ── */
  {
    id: 'no-viewport',
    when: (d) => !d.html.meta.viewport,
    build: () => ({
      category: 'mobile', severity: 'critical',
      title: 'Сайт не адаптирован под телефон',
      description: 'На странице нет настройки масштабирования для мобильных устройств.',
      businessImpact: 'На телефоне сайт открывается уменьшенной копией десктопа — читать и нажимать почти невозможно, а это больше половины трафика.',
      recommendation: 'Добавить meta viewport и мобильную вёрстку.',
      source: 'html', metric: 'viewport', displayValue: null
    })
  },
  {
    id: 'small-tap-targets',
    when: (d) => d.ps?.mobileChecks?.tapTargets === 0,
    build: () => ({
      category: 'mobile', severity: 'high',
      title: 'Кнопки и ссылки слишком мелкие для пальца',
      description: 'Часть интерактивных элементов меньше рекомендованного размера или стоят вплотную друг к другу.',
      businessImpact: 'Посетитель промахивается мимо кнопки заявки и часто не пробует второй раз.',
      recommendation: 'Увеличить кнопки минимум до 48×48 px и развести их по вертикали.',
      source: 'pagespeed', metric: 'tapTargets', displayValue: null
    })
  },
  {
    id: 'small-font',
    when: (d) => d.ps?.mobileChecks?.fontSize === 0,
    build: () => ({
      category: 'mobile', severity: 'medium',
      title: 'Мелкий текст на телефоне',
      description: 'Значительная часть текста меньше 12 px.',
      businessImpact: 'Читать приходится с увеличением — часть посетителей просто закрывает страницу.',
      recommendation: 'Поднять базовый размер шрифта до 16 px.',
      source: 'pagespeed', metric: 'fontSize', displayValue: null
    })
  },
  {
    id: 'content-width',
    when: (d) => d.ps?.mobileChecks?.contentWidth === 0,
    build: () => ({
      category: 'mobile', severity: 'high',
      title: 'Содержимое шире экрана телефона',
      description: 'Страницу приходится прокручивать вбок.',
      businessImpact: 'Горизонтальная прокрутка воспринимается как поломка сайта.',
      recommendation: 'Проверить блоки с фиксированной шириной и таблицы.',
      source: 'pagespeed', metric: 'contentWidth', displayValue: null
    })
  }
];

/* ═══════════════════════════════════════════════════════════
   ПЕРВЫЙ ЭКРАН И ПУТЬ ДО ЗАЯВКИ
   ═══════════════════════════════════════════════════════════ */

const FUNNEL_RULES = [
  {
    id: 'no-cta',
    when: (d) => d.html.cta.count === 0,
    build: () => ({
      category: 'conversion', severity: 'critical',
      title: 'На странице не найдено кнопки целевого действия',
      description: 'Не удалось обнаружить заметную кнопку вроде «Оставить заявку» или «Вызвать замерщика».',
      businessImpact: 'Посетителю некуда нажать, даже если предложение ему подошло.',
      recommendation: 'Добавить одну главную кнопку действия и повторить её по ходу страницы.',
      source: 'html', metric: 'cta', displayValue: null
    })
  },
  {
    id: 'cta-not-repeated',
    when: (d) => d.html.cta.count > 0 && !d.html.cta.repeated,
    build: (d) => ({
      category: 'conversion', severity: 'medium',
      title: 'Кнопка действия встречается всего один-два раза',
      description: `Найдено призывов к действию: ${d.html.cta.count}.`,
      businessImpact: 'Решение созревает в разный момент: кто-то готов после цен, кто-то после отзывов. Если кнопки рядом нет, момент теряется.',
      recommendation: 'Повторять главную кнопку после каждого смыслового блока — цены, кейсы, отзывы.',
      source: 'html', metric: 'ctaRepeat', displayValue: `${d.html.cta.count} шт.`
    })
  },
  {
    id: 'cta-below-fold',
    when: (d) => d.viewport && d.viewport.ctaVisible === false && d.html.cta.count > 0,
    build: () => ({
      category: 'conversion', severity: 'high',
      title: 'Кнопку действия не видно без прокрутки',
      description: 'На первом экране телефона кнопка заявки не появляется.',
      businessImpact: 'Посетитель из рекламы часто не прокручивает дальше первого экрана.',
      recommendation: 'Поднять основную кнопку в первый экран, рядом с заголовком.',
      source: 'screenshot', metric: 'ctaAboveFold', displayValue: null
    })
  },
  {
    id: 'no-quick-contact',
    when: (d) => !d.html.contacts.telLinks && !d.html.contacts.phoneInText &&
                 !d.html.contacts.telegram && !d.html.contacts.whatsapp,
    build: () => ({
      category: 'conversion', severity: 'critical',
      title: 'Не удалось найти телефон или мессенджер',
      description: 'На странице не обнаружено ни кликабельного номера, ни ссылки на Telegram или WhatsApp.',
      businessImpact: 'Часть клиентов не заполняет формы и уходит туда, где можно сразу написать.',
      recommendation: 'Вывести номер в шапку кликабельной ссылкой и добавить кнопку мессенджера.',
      source: 'html', metric: 'contacts', displayValue: null
    })
  },
  {
    id: 'phone-not-clickable',
    when: (d) => d.html.contacts.phoneInText && d.html.contacts.telLinks === 0,
    build: () => ({
      category: 'conversion', severity: 'medium',
      title: 'Номер написан текстом, но по нему нельзя позвонить',
      description: 'Телефон на странице есть, а ссылки tel: у него нет.',
      businessImpact: 'На телефоне номер приходится выделять и копировать вручную — на этом шаге часть звонков теряется.',
      recommendation: 'Обернуть номер в ссылку вида tel:+79001234567.',
      source: 'html', metric: 'telLink', displayValue: null
    })
  },
  {
    id: 'contact-below-fold',
    when: (d) => d.viewport && d.viewport.contactVisible === false &&
                 (d.html.contacts.telLinks > 0 || d.html.contacts.telegram),
    build: () => ({
      category: 'conversion', severity: 'medium',
      title: 'Контакты видны только после прокрутки',
      description: 'В первом экране телефона не видно ни номера, ни мессенджера.',
      businessImpact: 'Клиенту, готовому позвонить прямо сейчас, приходится искать способ связи.',
      recommendation: 'Закрепить номер или кнопку мессенджера в шапке.',
      source: 'screenshot', metric: 'contactAboveFold', displayValue: null
    })
  },
  {
    id: 'no-form',
    when: (d) => d.html.forms.count === 0,
    build: () => ({
      category: 'conversion', severity: 'high',
      title: 'На странице нет формы заявки',
      description: 'Форму для отправки контактов обнаружить не удалось.',
      businessImpact: 'Заявку можно оставить только звонком, а часть аудитории звонить не готова.',
      recommendation: 'Добавить короткую форму: имя и телефон, максимум два поля.',
      source: 'html', metric: 'forms', displayValue: null
    })
  },
  {
    id: 'generic-headline',
    when: (d) => d.html.firstScreen.genericHeadline === true,
    build: (d) => ({
      category: 'conversion', severity: 'medium',
      title: 'Заголовок первого экрана не сообщает о предложении',
      description: `Заголовок «${d.html.meta.h1.first}» подошёл бы почти любой компании.`,
      businessImpact: 'За первые секунды посетитель не понимает, чем именно вы отличаетесь от предыдущей вкладки.',
      recommendation: 'Написать в заголовке услугу, регион, срок и главный аргумент.',
      source: 'html', metric: 'headline', displayValue: null
    })
  },
  {
    id: 'too-much-text',
    when: (d) => d.viewport?.tooMuchText === true,
    build: () => ({
      category: 'conversion', severity: 'low',
      title: 'Первый экран перегружен текстом',
      description: 'В видимой области телефона слишком много текста сразу.',
      businessImpact: 'Пользователю сложнее быстро понять предложение.',
      recommendation: 'Оставить заголовок, одно предложение и кнопку, остальное — ниже.',
      source: 'screenshot', metric: 'firstScreenText', displayValue: null
    })
  },
  {
    id: 'no-timing',
    when: (d) => !d.html.markers.timing.found,
    build: () => ({
      category: 'conversion', severity: 'low',
      title: 'Не удалось найти информацию о сроках',
      description: 'На странице не обнаружено упоминания сроков выполнения работ.',
      businessImpact: 'Сроки — один из первых вопросов клиента, и без ответа он пишет конкурентам.',
      recommendation: 'Указать типовые сроки по объектам: «квартира 60 м² — 45 рабочих дней».',
      source: 'html', metric: 'timing', displayValue: null
    })
  }
];

/* ═══════════════════════════════════════════════════════════
   ДОВЕРИЕ: доказательства и техническая репутация
   ═══════════════════════════════════════════════════════════ */

const TRUST_RULES = [
  {
    id: 'no-https',
    when: (d) => d.isHttps === false,
    build: () => ({
      category: 'trust', severity: 'critical',
      title: 'Сайт работает без защищённого соединения',
      description: 'Страница открывается по http, без сертификата.',
      businessImpact: 'Браузер помечает такой сайт как небезопасный прямо в адресной строке — до предложения человек даже не доходит.',
      recommendation: 'Подключить бесплатный SSL-сертификат и настроить переадресацию на https.',
      source: 'html', metric: 'https', displayValue: null
    })
  },
  {
    id: 'no-cases',
    when: (d) => !d.html.proof.cases.enough,
    build: (d) => ({
      category: 'trust', severity: 'high',
      title: d.html.proof.cases.blocks === 0
        ? 'Примеров выполненных работ на странице нет'
        : 'Примеров работ слишком мало',
      description: d.html.proof.cases.blocks === 0
        ? 'Блока с объектами, кейсами или портфолио обнаружить не удалось.'
        : `Найдено блоков, похожих на примеры работ: ${d.html.proof.cases.blocks}. Для доказательства опыта этого мало.`,
      businessImpact: 'Без фотографий своих объектов невозможно доказать, что работы вообще выполнялись.',
      recommendation: 'Показать 5–10 объектов с реальными фото, площадью, сроком и бюджетом.',
      source: 'html', metric: 'cases', displayValue: `${d.html.proof.cases.blocks} блоков`
    })
  },
  {
    id: 'no-reviews',
    when: (d) => !d.html.proof.reviews.enough,
    build: (d) => ({
      category: 'trust', severity: 'medium',
      title: d.html.proof.reviews.mentioned && d.html.proof.reviews.blocks === 0
        ? 'Отзывы упомянуты, но самих отзывов не найдено'
        : 'Отзывов клиентов на странице недостаточно',
      description: d.html.proof.reviews.mentioned && d.html.proof.reviews.blocks === 0
        ? 'Слово «отзывы» на странице встречается, а блоков с самими отзывами обнаружить не удалось.'
        : `Найдено блоков с отзывами: ${d.html.proof.reviews.blocks}.`,
      businessImpact: 'Мнения других заказчиков — один из главных аргументов при выборе бригады.',
      recommendation: 'Добавить 5–7 отзывов с именем, объектом и по возможности фото или видео.',
      source: 'html', metric: 'reviews', displayValue: `${d.html.proof.reviews.blocks} блоков`
    })
  },
  {
    id: 'no-process',
    when: (d) => !d.html.proof.process.enough,
    build: () => ({
      category: 'trust', severity: 'low',
      title: 'Не удалось найти описание этапов работы',
      description: 'Блока «как мы работаем» с последовательными шагами на странице не обнаружено.',
      businessImpact: 'Непонятно, что произойдёт после заявки, — это тормозит решение.',
      recommendation: 'Показать 4–5 шагов от звонка до сдачи объекта.',
      source: 'html', metric: 'process', displayValue: null
    })
  },
  {
    id: 'no-geo',
    when: (d) => !d.html.markers.geo.found,
    build: () => ({
      category: 'trust', severity: 'medium',
      title: 'Не удалось определить географию работы',
      description: 'На странице не нашлось указания города или региона.',
      businessImpact: 'Посетитель не понимает, выезжаете ли вы к нему, и уходит.',
      recommendation: 'Указать город и радиус выезда в шапке и в первом экране.',
      source: 'html', metric: 'geo', displayValue: null
    })
  },
  {
    id: 'no-policy',
    when: (d) => d.html.forms.count > 0 && !d.html.forms.policyNear,
    build: () => ({
      category: 'trust', severity: 'medium',
      title: 'Рядом с формой нет согласия на обработку данных',
      description: 'Ссылку на политику конфиденциальности рядом с формой обнаружить не удалось.',
      businessImpact: 'Это требование закона о персональных данных и заодно вопрос доверия.',
      recommendation: 'Добавить чекбокс согласия и ссылку на политику конфиденциальности.',
      source: 'html', metric: 'policy', displayValue: null
    })
  }
];

/* ═══════════════════════════════════════════════════════════
   ТЕХНИЧЕСКОЕ СОСТОЯНИЕ
   ═══════════════════════════════════════════════════════════ */

const TECHNICAL_RULES = [
  {
    id: 'no-title',
    when: (d) => !d.html.meta.title.present,
    build: () => ({
      category: 'technical', severity: 'high',
      title: 'У страницы нет заголовка для поисковика',
      description: 'Тег title пустой или отсутствует.',
      businessImpact: 'В результатах поиска и во вкладке браузера показывается непонятная строка.',
      recommendation: 'Прописать title с услугой и городом, 50–60 символов.',
      source: 'html', metric: 'title', displayValue: null
    })
  },
  {
    id: 'title-length',
    when: (d) => d.html.meta.title.present && !d.html.meta.title.ok,
    build: (d) => ({
      category: 'technical', severity: 'low',
      title: 'Заголовок страницы неудачной длины',
      description: `Сейчас ${d.html.meta.title.length} символов, оптимально 20–65.`,
      businessImpact: 'Слишком длинный заголовок обрезается в поиске, слишком короткий — не информативен.',
      recommendation: 'Переписать title, уложившись в 50–60 символов.',
      source: 'html', metric: 'titleLength', displayValue: `${d.html.meta.title.length} симв.`
    })
  },
  {
    id: 'no-description',
    when: (d) => !d.html.meta.description.present,
    build: () => ({
      category: 'technical', severity: 'medium',
      title: 'Нет описания страницы для поиска',
      description: 'Мета-тег description отсутствует.',
      businessImpact: 'Поисковик сам выбирает текст сниппета, и он редко получается продающим.',
      recommendation: 'Добавить description на 120–160 символов с предложением и городом.',
      source: 'html', metric: 'description', displayValue: null
    })
  },
  {
    id: 'h1-problem',
    when: (d) => !d.html.meta.h1.exactlyOne,
    build: (d) => ({
      category: 'technical',
      severity: d.html.meta.h1.count === 0 ? 'high' : 'low',
      title: d.html.meta.h1.count === 0 ? 'На странице нет главного заголовка' : 'На странице несколько главных заголовков',
      description: d.html.meta.h1.count === 0
        ? 'Тег H1 не найден.'
        : `Найдено ${d.html.meta.h1.count} тегов H1, а должен быть один.`,
      businessImpact: 'Поисковику сложнее понять, о чём страница.',
      recommendation: 'Оставить один H1 с главным предложением, остальные сделать H2.',
      source: 'html', metric: 'h1', displayValue: `${d.html.meta.h1.count} шт.`
    })
  },
  {
    id: 'images-no-alt',
    when: (d) => d.html.images.total > 4 && d.html.images.noAlt / d.html.images.total > 0.5,
    build: (d) => ({
      category: 'technical', severity: 'low',
      title: 'У большинства изображений нет описания',
      description: `${d.html.images.noAlt} из ${d.html.images.total} изображений без атрибута alt.`,
      businessImpact: 'Фото объектов не попадают в поиск по картинкам — это бесплатный источник обращений.',
      recommendation: 'Добавить alt с описанием объекта и работ.',
      source: 'html', metric: 'imagesAlt', displayValue: `${d.html.images.noAlt} из ${d.html.images.total}`
    })
  },
  {
    id: 'no-lazy-loading',
    when: (d) => d.html.images.total >= 10 && d.html.images.lazy === 0,
    build: (d) => ({
      category: 'technical', severity: 'low',
      title: 'Все изображения грузятся сразу',
      description: `На странице ${d.html.images.total} изображений, и ни одно не отложено до прокрутки.`,
      businessImpact: 'Телефон скачивает все фото объектов сразу, хотя видно только первое.',
      recommendation: 'Добавить loading="lazy" всем картинкам ниже первого экрана.',
      source: 'html', metric: 'lazy', displayValue: null
    })
  },
  {
    id: 'too-many-scripts',
    when: (d) => d.html.scripts.tooMany,
    build: (d) => ({
      category: 'technical', severity: 'medium',
      title: 'Много сторонних скриптов',
      description: `На странице подключено внешних скриптов: ${d.html.scripts.external}.`,
      businessImpact: 'Каждый чужой скрипт замедляет загрузку и может сломаться независимо от вас.',
      recommendation: 'Оставить только реально нужную аналитику и виджеты.',
      source: 'html', metric: 'externalScripts', displayValue: `${d.html.scripts.external} шт.`
    })
  },
  {
    id: 'no-lang',
    when: (d) => !d.html.meta.lang,
    build: () => ({
      category: 'technical', severity: 'low',
      title: 'Не указан язык страницы',
      description: 'У тега html нет атрибута lang.',
      businessImpact: 'Браузеры и поисковики хуже определяют язык содержимого.',
      recommendation: 'Добавить lang="ru".',
      source: 'html', metric: 'lang', displayValue: null
    })
  },
  {
    id: 'no-og',
    when: (d) => !d.html.meta.openGraph,
    build: () => ({
      category: 'technical', severity: 'low',
      title: 'Нет разметки для ссылок в мессенджерах',
      description: 'Open Graph не найден.',
      businessImpact: 'При отправке ссылки в WhatsApp не появляется картинка и описание — а так клиенты и пересылают подрядчиков друг другу.',
      recommendation: 'Добавить og:title, og:description и og:image.',
      source: 'html', metric: 'openGraph', displayValue: null
    })
  },
  {
    id: 'no-favicon',
    when: (d) => !d.html.meta.favicon,
    build: () => ({
      category: 'technical', severity: 'low',
      title: 'Нет иконки сайта',
      description: 'Favicon не найден.',
      businessImpact: 'Во вкладках и закладках сайт выглядит незавершённым.',
      recommendation: 'Добавить favicon и apple-touch-icon.',
      source: 'html', metric: 'favicon', displayValue: null
    })
  },
  {
    id: 'no-schema',
    when: (d) => !d.html.meta.structuredData,
    build: () => ({
      category: 'technical', severity: 'low',
      title: 'Нет структурированных данных',
      description: 'Разметка Schema.org или JSON-LD не найдена.',
      businessImpact: 'Поисковик не показывает расширенный сниппет с контактами и рейтингом.',
      recommendation: 'Добавить JSON-LD с типом LocalBusiness.',
      source: 'html', metric: 'schema', displayValue: null
    })
  }
];

const ISSUE_RULES = [...CORE_RULES, ...SPEED_RULES, ...FUNNEL_RULES, ...TRUST_RULES, ...TECHNICAL_RULES];

/* ═══════════════════════════════════════════════════════════
   ЧТО СДЕЛАНО ХОРОШО
   Тоже ужесточены: хвалим за сущность, а не за упоминание.
   ═══════════════════════════════════════════════════════════ */

const POSITIVE_RULES = [
  { id: 'https-ok', when: (d) => d.isHttps === true, text: 'Сайт использует защищённое HTTPS-соединение' },
  { id: 'fast-lcp', when: (d) => d.ps && num(d.ps.metrics.lcp) && num(d.ps.metrics.lcp) <= METRIC_THRESHOLDS.lcp.good, text: 'Первый экран загружается быстро' },
  { id: 'stable-layout', when: (d) => d.ps && num(d.ps.metrics.cls) != null && num(d.ps.metrics.cls) <= METRIC_THRESHOLDS.cls.good, text: 'Вёрстка не прыгает при загрузке' },
  { id: 'calculator', when: (d) => d.html.calculator.byMarkup, text: 'На сайте есть расчёт стоимости — сильный аргумент для рекламного трафика' },
  { id: 'price-per-meter', when: (d) => d.html.prices.perSquareMeter, text: 'Цены указаны за квадратный метр — их легко сравнить' },
  { id: 'cta-visible', when: (d) => d.viewport?.ctaVisible === true, text: 'На первом экране есть заметная кнопка действия' },
  { id: 'cta-repeated', when: (d) => d.html.cta.repeated, text: 'Кнопка действия повторяется по ходу страницы' },
  { id: 'contact-easy', when: (d) => d.html.contacts.telLinks > 0, text: 'Контактный номер можно нажать прямо с телефона' },
  { id: 'messengers', when: (d) => d.html.contacts.telegram || d.html.contacts.whatsapp, text: 'Есть быстрая связь через мессенджер' },
  { id: 'chat-widget', when: (d) => d.html.contacts.chatWidget.found, text: 'Подключён онлайн-чат для быстрых вопросов' },
  { id: 'short-form', when: (d) => d.html.forms.count > 0 && d.html.forms.fields > 0 && d.html.forms.fields <= 3, text: 'Форма заявки короткая и не отпугивает' },
  { id: 'has-cases', when: (d) => d.html.proof.cases.enough, text: 'Показаны примеры выполненных работ' },
  { id: 'has-reviews', when: (d) => d.html.proof.reviews.enough, text: 'Есть отзывы клиентов' },
  { id: 'has-process', when: (d) => d.html.proof.process.enough, text: 'Описаны этапы работы — клиенту понятно, что будет после заявки' },
  { id: 'warranty-term', when: (d) => d.html.trust.hasWarrantyTerm, text: (d) => `Гарантия указана конкретным сроком: ${d.html.trust.warrantyTerm}` },
  { id: 'own-photos', when: (d) => d.html.images.total >= 6 && d.html.images.stock.count === 0, text: 'Используются собственные фотографии, а не стоковые' },
  { id: 'viewport-ok', when: (d) => d.html.meta.viewport, text: 'Мобильный viewport настроен корректно' },
  { id: 'seo-ok', when: (d) => d.ps?.scores?.seo >= 90, text: 'Техническая SEO-основа в порядке' },
  { id: 'meta-ok', when: (d) => d.html.meta.title.ok && d.html.meta.description.ok, text: 'Заголовок и описание страницы заполнены корректно' }
];

/* ═══════════════════════════════════════════════════════════
   СБОРКА
   ═══════════════════════════════════════════════════════════ */

export function buildIssues(data) {
  const issues = [];
  for (const rule of ISSUE_RULES) {
    let matched = false;
    try { matched = !!rule.when(data); } catch { matched = false; }
    if (!matched) continue;
    try {
      issues.push({ id: rule.id, ...rule.build(data) });
    } catch { /* правило не смогло собраться на этих данных — пропускаем молча */ }
  }
  return sortIssues(issues);
}

export function buildPositives(data) {
  const out = [];
  for (const rule of POSITIVE_RULES) {
    try {
      if (!rule.when(data)) continue;
      out.push({ id: rule.id, text: typeof rule.text === 'function' ? rule.text(data) : rule.text });
    } catch { /* пропускаем */ }
  }
  return out;
}

export function sortIssues(issues) {
  return [...issues].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
}

/** Метрики для сворачиваемого технического блока — с человеческими пояснениями. */
export function buildMetrics(ps) {
  if (!ps) return null;
  const entry = (key, label, value, displayValue) => ({
    key, label, value: value ?? null, displayValue: displayValue ?? null, hint: METRIC_HINTS[key]
  });
  return [
    entry('performance', 'Скорость (Performance)', ps.scores.performance, ps.scores.performance != null ? `${ps.scores.performance} / 100` : null),
    entry('lcp', 'Появление контента (LCP)', num(ps.metrics.lcp), ps.metrics.lcp?.displayValue),
    entry('fcp', 'Первая отрисовка (FCP)', num(ps.metrics.fcp), ps.metrics.fcp?.displayValue),
    entry('cls', 'Смещение вёрстки (CLS)', num(ps.metrics.cls), ps.metrics.cls?.displayValue),
    entry('si', 'Скорость наполнения (Speed Index)', num(ps.metrics.si), ps.metrics.si?.displayValue),
    entry('seo', 'SEO-основа', ps.scores.seo, ps.scores.seo != null ? `${ps.scores.seo} / 100` : null),
    entry('accessibility', 'Доступность', ps.scores.accessibility, ps.scores.accessibility != null ? `${ps.scores.accessibility} / 100` : null),
    entry('bestPractices', 'Практики разработки', ps.scores.bestPractices, ps.scores.bestPractices != null ? `${ps.scores.bestPractices} / 100` : null)
  ].filter((m) => m.value !== null);
}
