/**
 * Тесты защиты от SSRF — самая критичная часть.
 * Ошибка здесь означает, что через поле «адрес сайта» можно достучаться
 * до внутренней сети или до metadata-сервиса облака.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicIp, isBlockedHostname } from '../server/utils/network-security.js';

test('loopback заблокирован', () => {
  assert.equal(isPublicIp('127.0.0.1'), false);
  assert.equal(isPublicIp('127.255.255.254'), false);
  assert.equal(isPublicIp('::1'), false);
});

test('приватные диапазоны IPv4 заблокированы', () => {
  ['10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255',
   '192.168.0.1', '192.168.255.255'].forEach((ip) => {
    assert.equal(isPublicIp(ip), false, ip + ' должен быть заблокирован');
  });
});

test('соседние с приватными публичные адреса НЕ блокируются', () => {
  // Классическая ошибка в самодельных проверках: 172.15/172.32 не приватные
  ['172.15.0.1', '172.32.0.1', '11.0.0.1', '9.255.255.255',
   '192.167.0.1', '192.169.0.1'].forEach((ip) => {
    assert.equal(isPublicIp(ip), true, ip + ' должен быть разрешён');
  });
});

test('metadata-сервисы облаков заблокированы', () => {
  assert.equal(isPublicIp('169.254.169.254'), false);
  assert.equal(isPublicIp('169.254.0.1'), false);
  assert.equal(isBlockedHostname('metadata.google.internal'), true);
});

test('служебные диапазоны заблокированы', () => {
  ['0.0.0.0', '0.1.2.3', '100.64.0.1', '192.0.0.1', '192.0.2.1',
   '198.18.0.1', '203.0.113.1', '224.0.0.1', '240.0.0.1',
   '255.255.255.255'].forEach((ip) => {
    assert.equal(isPublicIp(ip), false, ip + ' должен быть заблокирован');
  });
});

test('обычные публичные адреса разрешены', () => {
  ['8.8.8.8', '1.1.1.1', '93.184.216.34', '77.88.55.88'].forEach((ip) => {
    assert.equal(isPublicIp(ip), true, ip + ' должен быть разрешён');
  });
});

test('IPv6: приватные и служебные заблокированы', () => {
  ['::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1'].forEach((ip) => {
    assert.equal(isPublicIp(ip), false, ip + ' должен быть заблокирован');
  });
});

test('IPv6: публичные разрешены', () => {
  ['2606:4700:4700::1111', '2a02:6b8::feed:0ff'].forEach((ip) => {
    assert.equal(isPublicIp(ip), true, ip + ' должен быть разрешён');
  });
});

test('IPv4-mapped адреса не обходят проверку', () => {
  // Главная лазейка: ::ffff:127.0.0.1 — это тот же localhost, записанный как IPv6
  assert.equal(isPublicIp('::ffff:127.0.0.1'), false);
  assert.equal(isPublicIp('::ffff:10.0.0.1'), false);
  assert.equal(isPublicIp('::ffff:192.168.1.1'), false);
  assert.equal(isPublicIp('::ffff:8.8.8.8'), true);
});

test('мусор вместо IP не считается публичным', () => {
  ['', 'не ip', '999.999.999.999', '1.2.3', 'example.ru'].forEach((v) => {
    assert.equal(isPublicIp(v), false, JSON.stringify(v));
  });
});

test('внутренние имена хостов заблокированы', () => {
  ['localhost', 'router.local', 'db.internal', 'app.lan',
   'x.home.arpa', 'wiki.corp', 'metadata'].forEach((h) => {
    assert.equal(isBlockedHostname(h), true, h + ' должен быть заблокирован');
  });
});

test('обычные домены не блокируются по имени', () => {
  ['example.ru', 'localhost.ru', 'my-internal-blog.com'].forEach((h) => {
    assert.equal(isBlockedHostname(h), false, h + ' блокироваться не должен');
  });
});
