/**
 * Тесты разбора HTML — РЕДАКЦИЯ 2.
 * Главное, что здесь проверяется: детектор нельзя пройти,
 * просто написав нужное слово.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditHtml } from '../server/services/html-audit.service.js';

const page = (body, head = '') => auditHtml({
  html: `<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width">${head}</head><body>${body}</body></html>`,
  finalUrl: 'https://example.ru/'
});

/* ── мета ── */

test('находит title, description и h1', () => {
  const r = page('<h1>Ремонт квартир под ключ в Москве</h1>',
    '<title>Ремонт квартир под ключ в Москве — недорого</title><meta name="description" content="Делаем ремонт квартир под ключ в Москве и области с гарантией два года и фиксированной сметой в договоре.">');
  assert.equal(r.meta.title.ok, true);
  assert.equal(r.meta.description.ok, true);
  assert.equal(r.meta.h1.exactlyOne, true);
});

test('считает несколько h1', () => {
  assert.equal(page('<h1>Один</h1><h1>Два</h1>').meta.h1.count, 2);
});

test('считает только внешние скрипты', () => {
  const r = page('', '<script src="/local.js"></script>' +
    '<script src="https://cdn.other.com/a.js"></script>' +
    '<script src="https://example.ru/own.js"></script>');
  assert.equal(r.scripts.external, 1);
});

/* ── 01. Цены и расчёт ── */

test('слово «цена» без цифр не считается ценами', () => {
  const r = page('<h2>Наши цены</h2><p>Стоимость рассчитывается индивидуально</p>');
  assert.equal(r.prices.hasNumbers, false);
  assert.equal(r.prices.wordOnly, true, 'должен быть помечен как «слово есть, цифр нет»');
});

test('находит настоящие цены с цифрами', () => {
  assert.equal(page('<p>Ремонт от 4 500 руб за м2</p>').prices.hasNumbers, true);
  assert.equal(page('<p>Стоимость 12000 ₽</p>').prices.hasNumbers, true);
});

test('отдельно отмечает цену за квадратный метр', () => {
  assert.equal(page('<p>от 4500 ₽/м²</p>').prices.perSquareMeter, true);
  assert.equal(page('<p>Диван за 30000 руб</p>').prices.perSquareMeter, false);
});

test('находит калькулятор по разметке и по тексту', () => {
  assert.equal(page('<div class="calculator"></div>').calculator.byMarkup, true);
  assert.equal(page('<div id="quiz-block"></div>').calculator.byMarkup, true);
  assert.equal(page('<input type="range" min="20" max="200">').calculator.byMarkup, true);
  assert.equal(page('<p>Рассчитать стоимость ремонта</p>').calculator.byText, true);
  assert.equal(page('<p>Просто текст</p>').calculator.found, false);
});

/* ── 02. Форма ── */

test('распознаёт форму, которая просит только телефон', () => {
  const r = page('<form><input type="tel" name="phone" required><button>Отправить</button></form>');
  assert.equal(r.forms.onlyPhoneAsked, true);
  assert.equal(r.forms.phoneFields, 1);
});

test('форма с расчётом и несколькими полями не считается «только телефон»', () => {
  const r = page('<form><input name="name"><input name="area"><input name="type"><input type="tel" name="phone"></form>');
  assert.equal(r.forms.onlyPhoneAsked, false);
  assert.equal(r.forms.fields, 4);
});

test('находит телефонное поле по placeholder и по name', () => {
  assert.equal(page('<form><input placeholder="Ваш телефон"></form>').forms.phoneFields, 1);
  assert.equal(page('<form><input name="user_phone"></form>').forms.phoneFields, 1);
  assert.equal(page('<form><input name="email"></form>').forms.phoneFields, 0);
});

/* ── 03. Стоковые фото ── */

test('находит фото из фотобанков по домену', () => {
  const r = page('<img src="https://images.unsplash.com/photo-1689043528099-2ba014dd7c64">' +
                 '<img src="https://st.depositphotos.com/123/file.jpg">' +
                 '<img src="/own/object-1.jpg">');
  assert.equal(r.images.stock.count, 2);
  assert.ok(r.images.stock.share > 60);
});

test('находит стоковые фото по имени файла', () => {
  assert.equal(page('<img src="/img/shutterstock_1234567.jpg">').images.stock.count, 1);
  assert.equal(page('<img src="/img/pexels-photo.jpg">').images.stock.count, 1);
});

test('свои фото стоковыми не считаются', () => {
  const r = page('<img src="/objects/kvartira-1.jpg"><img src="/objects/kvartira-2.jpg">');
  assert.equal(r.images.stock.count, 0);
  assert.equal(r.images.stock.share, 0);
});

test('считает изображения без alt', () => {
  const r = page('<img src="a.jpg" alt="Объект"><img src="b.jpg"><img src="c.jpg" alt="">');
  assert.equal(r.images.noAlt, 2, 'пустой alt считается отсутствующим');
});

/* ── 04. Гарантии ── */

test('одного слова «гарантия» недостаточно', () => {
  const r = page('<p>Гарантия качества на все работы</p>');
  assert.equal(r.trust.groupCount, 1);
  assert.equal(r.trust.hasWarrantyTerm, false);
  assert.equal(r.trust.enough, false, 'одна группа без срока — это не гарантии');
});

test('срок гарантии числом засчитывается сразу', () => {
  const r = page('<p>Гарантия 3 года на все виды работ</p>');
  assert.equal(r.trust.hasWarrantyTerm, true);
  assert.equal(r.trust.enough, true);
  assert.match(r.trust.warrantyTerm, /3 года/);
});

test('две разные группы признаков засчитываются', () => {
  const r = page('<p>Работаем по договору, смета фиксируется и не меняется</p>');
  assert.ok(r.trust.groupCount >= 2);
  assert.equal(r.trust.enough, true);
});

/* ── 05. Быстрый ответ ── */

test('находит виджеты чатов', () => {
  const r = page('', '<script src="//code.jivosite.com/widget/xxx"></script>');
  assert.equal(r.contacts.chatWidget.found, true);
  assert.equal(r.contacts.chatWidget.vendor, 'JivoChat');
});

test('находит обратный звонок и мессенджеры', () => {
  assert.equal(page('<button>Заказать звонок</button>').contacts.callback, true);
  const r = page('<a href="https://wa.me/79001234567">WhatsApp</a><a href="https://t.me/x">TG</a>');
  assert.equal(r.contacts.whatsapp, true);
  assert.equal(r.contacts.telegram, true);
});

test('различает кликабельный номер и номер текстом', () => {
  assert.equal(page('<a href="tel:+79001234567">+7 900 123-45-67</a>').contacts.telLinks, 1);
  const plain = page('<p>Звоните: +7 900 123-45-67</p>');
  assert.equal(plain.contacts.telLinks, 0);
  assert.equal(plain.contacts.phoneInText, true);
});

/* ── доказательства ── */

test('заголовок «Отзывы» без самих отзывов не засчитывается', () => {
  const r = page('<h2>Отзывы наших клиентов</h2>');
  assert.equal(r.proof.reviews.mentioned, true);
  assert.equal(r.proof.reviews.blocks, 0);
  assert.equal(r.proof.reviews.enough, false);
});

test('три и более блока отзывов засчитываются', () => {
  const r = page('<div class="review">1</div><div class="review">2</div><div class="review">3</div>');
  assert.equal(r.proof.reviews.blocks, 3);
  assert.equal(r.proof.reviews.enough, true);
});

test('кейсы считаются по блокам, а не по заголовку', () => {
  assert.equal(page('<h2>Наши работы</h2>').proof.cases.enough, false);
  const r = page('<div class="case-item"></div><div class="case-item"></div><div class="case-item"></div>');
  assert.equal(r.proof.cases.enough, true);
});

/* ── CTA ── */

test('находит кнопки действия и отличает их от навигации', () => {
  const r = page('<button>Оставить заявку</button><a href="#">Вызвать замерщика</a><a href="#">Главная</a>');
  assert.equal(r.cta.count, 2);
});

test('отмечает, повторяется ли кнопка по странице', () => {
  assert.equal(page('<button>Оставить заявку</button>').cta.repeated, false);
  const many = page('<button>Оставить заявку</button><button>Заказать замер</button><a href="#">Получить расчёт</a>');
  assert.equal(many.cta.repeated, true);
});

/* ── прочее ── */

test('текст из script и style не попадает в анализ', () => {
  const r = page('<script>var t = "гарантия 5 лет и отзывы";</script><style>.x{content:"от 5000 руб"}</style><p>Ничего</p>');
  assert.equal(r.trust.hasWarrantyTerm, false);
  assert.equal(r.prices.hasNumbers, false);
});

test('распознаёт слишком общий заголовок', () => {
  assert.equal(page('<h1>Добро пожаловать</h1>').firstScreen.genericHeadline, true);
  assert.equal(page('<h1>Ремонт квартир в Москве за 30 дней</h1>').firstScreen.genericHeadline, false);
});

test('не падает на битой разметке', () => {
  const r = auditHtml({ html: '<div><p>незакрытые теги<span>', finalUrl: 'https://example.ru/' });
  assert.ok(r.meta);
  assert.equal(r.meta.h1.count, 0);
});
