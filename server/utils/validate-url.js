/**
 * validate-url.js — нормализация и проверка адреса, который ввёл посетитель.
 *
 * Две разные задачи, специально разнесены:
 *   normalizeUrl()  — синтаксис, работает без сети (её же гоняют тесты)
 *   assertSafeUrl() — плюс DNS и проверка IP, требует сети
 */

import { resolveAndCheck } from './network-security.js';

export class AuditError extends Error {
  constructor(code, userMessage, meta = {}) {
    super(userMessage);
    this.code = code;             // машинный код для фронта
    this.userMessage = userMessage; // текст, который увидит посетитель
    this.meta = meta;
  }
}

const MAX_URL_LENGTH = 500;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_PORTS = new Set(['', '80', '443']);

/** Домен: латиница/цифры/дефис + минимум одна точка + TLD от 2 букв. Punycode (xn--) проходит. */
const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Приводит любой пользовательский ввод к каноническому https-URL.
 * Бросает AuditError с понятным русским текстом.
 *
 * @param {string} raw
 * @returns {{url: string, domain: string, origin: string}}
 */
export function normalizeUrl(raw) {
  if (typeof raw !== 'string') throw new AuditError('empty', 'Введите адрес сайта');

  // \u200b — невидимый zero-width space, часто прилетает копипастом из мессенджеров
  let input = raw.replace(/[\u200b-\u200f\uFEFF]/g, '').trim();
  if (!input) throw new AuditError('empty', 'Введите адрес сайта');
  if (input.length > MAX_URL_LENGTH) throw new AuditError('too_long', 'Адрес слишком длинный');

  /* Определение протокола.
     Наивная проверка «есть двоеточие → это схема» ломается на вводе
     "example.ru:8080": точка разрешена в именах схем, поэтому "example.ru"
     принималось за протокол. Поэтому: схемой считаем только запись
     с "//" после двоеточия, плюс отдельный список бессlash-евых опасных
     схем (javascript:, data: и подобные) — их надо отсечь ДО того, как
     мы допишем https:// и превратим мусор в валидный на вид адрес. */
  const DANGEROUS_SCHEMELESS = /^(javascript|data|vbscript|blob|about|mailto|tel|sms|callto|jar|view-source):/i;
  const withAuthority = input.match(/^([a-z][a-z0-9+.-]*):\/\//i);

  if (DANGEROUS_SCHEMELESS.test(input)) {
    throw new AuditError('bad_protocol', 'Этот адрес нельзя использовать для проверки');
  }
  if (withAuthority) {
    if (!ALLOWED_PROTOCOLS.has(withAuthority[1].toLowerCase() + ':')) {
      throw new AuditError('bad_protocol', 'Этот адрес нельзя использовать для проверки');
    }
  } else {
    input = 'https://' + input.replace(/^\/+/, '');
  }

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new AuditError('invalid', 'Проверьте правильность адреса');
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new AuditError('bad_protocol', 'Этот адрес нельзя использовать для проверки');
  }
  // Логин/пароль в URL — признак попытки достучаться до закрытого ресурса
  if (parsed.username || parsed.password) {
    throw new AuditError('credentials', 'Этот адрес нельзя использовать для проверки');
  }
  if (!ALLOWED_PORTS.has(parsed.port)) {
    throw new AuditError('bad_port', 'Проверяются только сайты на стандартных портах');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const isIpLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith('[');
  if (isIpLiteral) {
    // По голому IP аудит смысла не имеет, а список приватных диапазонов
    // проще не дублировать здесь — просто не принимаем IP вообще.
    throw new AuditError('ip_literal', 'Введите адрес сайта, а не IP-адрес');
  }
  if (!DOMAIN_RE.test(hostname)) {
    throw new AuditError('invalid', 'Проверьте правильность адреса');
  }

  parsed.hash = '';
  parsed.hostname = hostname;

  return {
    url: parsed.toString(),
    domain: hostname.replace(/^www\./, ''),
    origin: parsed.origin
  };
}

/**
 * Ключ кэша: два разных ввода одного сайта не должны тратить квоту дважды.
 * https://Example.RU/?utm_source=x → example.ru/
 */
export function cacheKeyFor(url) {
  const u = new URL(url);
  const params = new URLSearchParams(u.search);
  for (const key of [...params.keys()]) {
    if (/^(utm_|yclid|gclid|fbclid|_openstat)/i.test(key)) params.delete(key);
  }
  const search = params.toString();
  const path = u.pathname.replace(/\/+$/, '') || '/';
  return u.hostname.replace(/^www\./, '') + path + (search ? '?' + search : '');
}

/** Полная проверка: синтаксис + DNS + все IP публичные. */
export async function assertSafeUrl(raw) {
  const normalized = normalizeUrl(raw);
  const check = await resolveAndCheck(new URL(normalized.url).hostname);

  if (!check.ok) {
    if (check.reason === 'dns_failed') {
      throw new AuditError('dns_failed', 'Не удалось найти такой сайт. Проверьте адрес');
    }
    throw new AuditError('blocked_target', 'Этот адрес нельзя использовать для проверки');
  }
  return { ...normalized, addresses: check.addresses };
}
