/**
 * Тесты нормализации и валидации адреса.
 * Запуск: npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, cacheKeyFor, AuditError } from '../server/utils/validate-url.js';

const expectError = (input, code) => {
  assert.throws(
    () => normalizeUrl(input),
    (err) => err instanceof AuditError && err.code === code,
    `ожидалась ошибка "${code}" для ввода: ${JSON.stringify(input)}`
  );
};

test('добавляет https:// к домену без протокола', () => {
  assert.equal(normalizeUrl('example.ru').url, 'https://example.ru/');
  assert.equal(normalizeUrl('www.example.ru').url, 'https://www.example.ru/');
});

test('принимает http и https как есть', () => {
  assert.equal(normalizeUrl('http://example.ru').url, 'http://example.ru/');
  assert.equal(normalizeUrl('https://example.ru/page').url, 'https://example.ru/page');
});

test('чистит пробелы и невидимые символы из копипаста', () => {
  assert.equal(normalizeUrl('  example.ru  ').url, 'https://example.ru/');
  assert.equal(normalizeUrl('\u200bexample.ru').url, 'https://example.ru/');
});

test('домен отдаётся без www', () => {
  assert.equal(normalizeUrl('https://www.example.ru').domain, 'example.ru');
  assert.equal(normalizeUrl('https://sub.example.ru').domain, 'sub.example.ru');
});

test('отбрасывает якорь', () => {
  assert.equal(normalizeUrl('example.ru/page#section').url, 'https://example.ru/page');
});

test('пустой ввод — ошибка', () => {
  expectError('', 'empty');
  expectError('   ', 'empty');
  expectError(null, 'empty');
});

test('опасные протоколы не проходят', () => {
  expectError('javascript:alert(1)', 'bad_protocol');
  expectError('data:text/html,<h1>x', 'bad_protocol');
  expectError('file:///etc/passwd', 'bad_protocol');
  expectError('ftp://example.ru', 'bad_protocol');
  expectError('gopher://example.ru', 'bad_protocol');
});

test('localhost и внутренние имена блокируются на уровне синтаксиса', () => {
  // localhost не проходит проверку домена (нет точки и TLD)
  expectError('localhost', 'invalid');
  expectError('http://localhost:3000', 'bad_port');
});

test('голые IP не принимаются', () => {
  expectError('127.0.0.1', 'ip_literal');
  expectError('http://192.168.1.1', 'ip_literal');
  expectError('0.0.0.0', 'ip_literal');
  expectError('169.254.169.254', 'ip_literal');
  expectError('10.0.0.5', 'ip_literal');
});

test('нестандартные порты не принимаются', () => {
  expectError('example.ru:8080', 'bad_port');
  expectError('example.ru:22', 'bad_port');
  assert.ok(normalizeUrl('example.ru:443').url);
  assert.ok(normalizeUrl('http://example.ru:80').url);
});

test('логин и пароль в адресе не принимаются', () => {
  expectError('https://user:pass@example.ru', 'credentials');
});

test('битые домены не принимаются', () => {
  expectError('не сайт', 'invalid');
  expectError('example', 'invalid');
  expectError('example.', 'invalid');
  expectError('.ru', 'invalid');
  expectError('exa mple.ru', 'invalid');
});

test('слишком длинный адрес не принимается', () => {
  expectError('https://example.ru/' + 'a'.repeat(600), 'too_long');
});

test('punycode-домены проходят', () => {
  assert.ok(normalizeUrl('xn--80ak6aa92e.com').url);
});

test('ключ кэша не зависит от регистра, www, слэша и utm-меток', () => {
  const a = cacheKeyFor('https://Example.RU/');
  const b = cacheKeyFor('https://www.example.ru');
  const c = cacheKeyFor('https://example.ru/?utm_source=ya&gclid=123');
  assert.equal(a, b);
  assert.equal(a, c);
});

test('ключ кэша сохраняет значимые параметры', () => {
  assert.notEqual(cacheKeyFor('https://example.ru/?id=1'), cacheKeyFor('https://example.ru/'));
  assert.notEqual(cacheKeyFor('https://example.ru/a'), cacheKeyFor('https://example.ru/b'));
});
