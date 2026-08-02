/**
 * lead.service.js — отправка заявки на ручной разбор.
 *
 * Основной канал — Telegram. Файловый fallback существует только
 * для локальной разработки: JSON на диске не годится для production
 * (нет резервных копий, гонки при параллельной записи, нет поиска).
 * Для боевого запуска сюда подключается CRM или база.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { TEMP_DIR } from './screenshot.service.js';
import { log } from '../utils/logger.js';

const TELEGRAM_TIMEOUT = 10000;

/** Экранирование под parse_mode: HTML — иначе имя вида <b>x</b> сломает сообщение. */
function esc(value) {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildMessage(lead, audit) {
  const cat = audit?.categories || {};
  const score = (key) => (cat[key]?.score ?? '—');
  const topIssues = (audit?.issues || []).slice(0, 5)
    .map((i, idx) => `${idx + 1}. ${esc(i.title)}`)
    .join('\n') || '—';

  return [
    '<b>Новая заявка на аудит сайта</b>',
    '',
    `<b>Имя:</b> ${esc(lead.name)}`,
    `<b>Контакт:</b> ${esc(lead.contact)}`,
    `<b>Сайт:</b> ${esc(audit?.url || lead.url)}`,
    '',
    `<b>Общий балл:</b> ${esc(audit?.score)} / 100`,
    `Скорость: ${esc(score('performance'))} · Мобильная: ${esc(score('mobile'))} · Конверсия: ${esc(score('conversion'))}`,
    `Доверие: ${esc(score('trust'))} · Техническое: ${esc(score('technical'))}`,
    '',
    '<b>Основные проблемы:</b>',
    topIssues,
    '',
    lead.comment ? `<b>Комментарий:</b> ${esc(lead.comment)}` : '',
    `<i>Проверка: ${esc(audit?.createdAt || new Date().toISOString())}</i>`
  ].filter(Boolean).join('\n');
}

function buildQuizMessage(lead) {
  const pkg = lead.package || {};
  const answersText = (lead.answers || [])
    .map((a, idx) => `${idx + 1}. ${esc(a.question)} — ${esc(a.answer)}`)
    .join('\n') || '—';

  return [
    '<b>Новая заявка — квиз «Подобрать пакет»</b>',
    '',
    `<b>Имя:</b> ${esc(lead.name)}`,
    `<b>Контакт:</b> ${esc(lead.contact)}`,
    '',
    `<b>Рекомендован пакет:</b> ${esc(pkg.name)} (${esc(pkg.price)})`,
    '',
    '<b>Ответы:</b>',
    answersText,
    '',
    lead.comment ? `<b>Комментарий:</b> ${esc(lead.comment)}` : '',
    `<i>Источник: ${esc(lead.source || 'quiz_calculate')}</i>`
  ].filter(Boolean).join('\n');
}

/**
 * Заявка из квиза подбора пакета — отдельно от sendLead(), потому что
 * та жёстко завязана на структуру audit-отчёта (buildMessage читает
 * audit.categories/issues). Канал доставки (Telegram → файл-фолбэк)
 * тот же, сообщение и данные для сохранения — свои.
 */
export async function sendQuizLead(lead) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const text = buildQuizMessage(lead);

  if (token && chatId) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
        signal: AbortSignal.timeout(TELEGRAM_TIMEOUT)
      });
      if (res.ok) return { ok: true, channel: 'telegram' };
      log.error('telegram_send_failed', { status: res.status, source: 'quiz' });
    } catch (err) {
      log.error('telegram_network_error', { name: err?.name, source: 'quiz' });
    }
    return saveQuizToFile(lead, 'telegram_failed');
  }

  return saveQuizToFile(lead, 'not_configured');
}

/** DEV-ONLY fallback, отдельный файл — чтобы не путать со структурой audit-лидов. */
async function saveQuizToFile(lead, reason) {
  const file = path.join(TEMP_DIR, 'quiz-leads.json');
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    let list = [];
    try {
      list = JSON.parse(await fs.readFile(file, 'utf8'));
      if (!Array.isArray(list)) list = [];
    } catch { /* файла ещё нет */ }

    list.push({
      receivedAt: new Date().toISOString(),
      reason,
      source: lead.source || 'quiz_calculate',
      lead: { name: lead.name, contact: lead.contact, comment: lead.comment || null },
      package: lead.package || null,
      answers: lead.answers || []
    });
    await fs.writeFile(file, JSON.stringify(list, null, 2), 'utf8');
    log.warn('quiz_lead_saved_to_file', { reason });
    return { ok: true, channel: 'file' };
  } catch (err) {
    log.error('quiz_lead_save_failed', { message: String(err?.message).slice(0, 120) });
    return { ok: false };
  }
}

export async function sendLead(lead, audit) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const text = buildMessage(lead, audit);

  if (token && chatId) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
        signal: AbortSignal.timeout(TELEGRAM_TIMEOUT)
      });
      if (res.ok) return { ok: true, channel: 'telegram' };
      log.error('telegram_send_failed', { status: res.status });
    } catch (err) {
      log.error('telegram_network_error', { name: err?.name });
    }
    // Telegram настроен, но не ответил — не теряем заявку, кладём на диск
    return saveToFile(lead, audit, 'telegram_failed');
  }

  return saveToFile(lead, audit, 'not_configured');
}

/** DEV-ONLY fallback. Для production заменить на БД или CRM. */
async function saveToFile(lead, audit, reason) {
  const file = path.join(TEMP_DIR, 'leads.json');
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    let list = [];
    try {
      list = JSON.parse(await fs.readFile(file, 'utf8'));
      if (!Array.isArray(list)) list = [];
    } catch { /* файла ещё нет */ }

    list.push({
      receivedAt: new Date().toISOString(),
      reason,
      lead: { name: lead.name, contact: lead.contact, comment: lead.comment || null },
      audit: audit ? { url: audit.url, score: audit.score, auditId: audit.auditId } : null
    });
    await fs.writeFile(file, JSON.stringify(list, null, 2), 'utf8');
    log.warn('lead_saved_to_file', { reason });
    return { ok: true, channel: 'file' };
  } catch (err) {
    log.error('lead_save_failed', { message: String(err?.message).slice(0, 120) });
    return { ok: false };
  }
}
