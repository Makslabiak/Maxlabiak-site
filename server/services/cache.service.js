/**
 * cache.service.js — in-memory кэш с TTL.
 *
 * Две задачи:
 *  1) не тратить квоту PageSpeed на повторную проверку того же сайта;
 *  2) хранить готовый отчёт по auditId, чтобы при отправке заявки брать
 *     результаты с сервера, а не верить тому, что прислал фронт.
 *
 * Интерфейс намеренно как у Redis (get/set/del) — заменить хранилище
 * потом можно, не трогая вызывающий код.
 */

const store = new Map();

function purgeExpired() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}

export function set(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  // Чистим лениво — отдельный таймер ради нескольких десятков записей не нужен
  if (store.size > 200) purgeExpired();
}

export function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function del(key) {
  store.delete(key);
}

export function size() {
  purgeExpired();
  return store.size;
}
