/**
 * logger.js — минимальные структурированные логи.
 * Все события аудита связаны между собой по auditId.
 * Секреты и полные пользовательские данные сюда не попадают.
 */

const SENSITIVE = /token|key|secret|password/i;

function clean(payload = {}) {
  const out = {};
  for (const [k, v] of Object.entries(payload)) {
    if (SENSITIVE.test(k)) continue;
    out[k] = typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '…' : v;
  }
  return out;
}

function write(level, event, payload) {
  const line = { ts: new Date().toISOString(), level, event, ...clean(payload) };
  const fn = level === 'error' ? console.error : console.log;
  fn(JSON.stringify(line));
}

export const log = {
  info: (event, payload) => write('info', event, payload),
  warn: (event, payload) => write('warn', event, payload),
  error: (event, payload) => write('error', event, payload)
};
