/**
 * network-security.js — защита от SSRF.
 *
 * Задача: не дать посетителю через поле «адрес сайта» заставить наш сервер
 * постучаться внутрь нашей же сети (роутер, база, docker-контейнер) или в
 * metadata-сервис облака (169.254.169.254), откуда утекают ключи доступа.
 *
 * Проверяем не домен, а РЕАЛЬНЫЕ IP, в которые он резолвится: домен вида
 * internal.example.com может указывать на 10.0.0.5, и по имени это не видно.
 */

import { isIP } from 'node:net';
import dns from 'node:dns/promises';

/* ── IPv4 ── */

function ipv4ToLong(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function inCidr4(ip, cidr) {
  const [base, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const ipLong = ipv4ToLong(ip);
  const baseLong = ipv4ToLong(base);
  if (ipLong === null || baseLong === null) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ipLong & mask) === (baseLong & mask);
}

/** Диапазоны, куда наш сервер ходить не должен ни при каких условиях. */
const BLOCKED_V4 = [
  '0.0.0.0/8',         // «этот хост»
  '10.0.0.0/8',        // приватная сеть
  '100.64.0.0/10',     // CGNAT
  '127.0.0.0/8',       // loopback / localhost
  '169.254.0.0/16',    // link-local, сюда же metadata 169.254.169.254
  '172.16.0.0/12',     // приватная сеть
  '192.0.0.0/24',      // IETF protocol assignments
  '192.0.2.0/24',      // TEST-NET-1
  '192.88.99.0/24',    // 6to4 relay
  '192.168.0.0/16',    // приватная сеть
  '198.18.0.0/15',     // benchmark
  '198.51.100.0/24',   // TEST-NET-2
  '203.0.113.0/24',    // TEST-NET-3
  '224.0.0.0/4',       // multicast
  '240.0.0.0/4'        // reserved + broadcast
];

/* ── IPv6 ── */

function expandIPv6(ip) {
  let addr = ip.split('%')[0].toLowerCase(); // отбрасываем zone id (fe80::1%en0)
  if (addr.includes('.')) {
    // ::ffff:192.168.0.1 → переводим хвост в hex
    const idx = addr.lastIndexOf(':') + 1;
    const v4 = addr.slice(idx);
    const long = ipv4ToLong(v4);
    if (long === null) return null;
    addr = addr.slice(0, idx) +
      ((long >>> 16) & 0xffff).toString(16) + ':' + (long & 0xffff).toString(16);
  }
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = 8 - head.length - tail.length;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = halves.length === 2
    ? [...head, ...Array(fill).fill('0'), ...tail]
    : head;
  return groups.map((g) => parseInt(g || '0', 16));
}

function inCidr6(ip, cidr) {
  const [base, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const a = expandIPv6(ip);
  const b = expandIPv6(base);
  if (!a || !b) return false;
  let left = bits;
  for (let i = 0; i < 8 && left > 0; i++) {
    const take = Math.min(16, left);
    const mask = take === 16 ? 0xffff : (0xffff << (16 - take)) & 0xffff;
    if ((a[i] & mask) !== (b[i] & mask)) return false;
    left -= take;
  }
  return true;
}

const BLOCKED_V6 = [
  '::/128',       // неопределённый
  '::1/128',      // loopback
  'fc00::/7',     // unique local (приватная сеть)
  'fe80::/10',    // link-local
  'ff00::/8',     // multicast
  '2001:db8::/32' // документация
];

/**
 * Разрешён ли публичный доступ к этому IP.
 * ::ffff:10.0.0.1 разбирается как IPv4 — иначе через mapped-адрес
 * можно было бы обойти проверку приватных диапазонов.
 */
export function isPublicIp(ip) {
  const kind = isIP(ip);
  if (kind === 4) return !BLOCKED_V4.some((c) => inCidr4(ip, c));
  if (kind === 6) {
    const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicIp(mapped[1]);
    return !BLOCKED_V6.some((c) => inCidr6(ip, c));
  }
  return false;
}

/** Имена, которые блокируем ещё до DNS — они всегда указывают внутрь. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'ip6-localhost',
  'ip6-loopback'
]);

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home.arpa', '.corp', '.private'];

export function isBlockedHostname(hostname) {
  const h = String(hostname).toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  return BLOCKED_SUFFIXES.some((s) => h.endsWith(s));
}

/**
 * Резолвит домен и проверяет ВСЕ полученные адреса.
 * Если хоть один смотрит внутрь сети — отказ (домен может отдавать
 * несколько A-записей, и брать только первую небезопасно).
 *
 * @returns {Promise<{ok: true, addresses: string[]} | {ok: false, reason: string}>}
 */
export async function resolveAndCheck(hostname) {
  if (isBlockedHostname(hostname)) return { ok: false, reason: 'blocked_host' };

  // На вход мог прийти голый IP — тогда DNS не нужен
  if (isIP(hostname)) {
    return isPublicIp(hostname)
      ? { ok: true, addresses: [hostname] }
      : { ok: false, reason: 'private_ip' };
  }

  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: 'dns_failed' };
  }
  if (!records.length) return { ok: false, reason: 'dns_failed' };

  const addresses = records.map((r) => r.address);
  if (!addresses.every(isPublicIp)) return { ok: false, reason: 'private_ip' };
  return { ok: true, addresses };
}
