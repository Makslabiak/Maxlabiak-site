/**
 * server.js — Express-сервер: отдаёт статику сайта и API аудита с одного
 * порта. Один origin означает, что CORS не нужен и cookie/referer ведут
 * себя предсказуемо.
 */

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { runAudit, getStoredReport } from './controllers/audit.controller.js';
import { AuditError, normalizeUrl } from './utils/validate-url.js';
import { sendLead, sendQuizLead, sendContactLead } from './services/lead.service.js';
import { cleanupScreenshots, TEMP_DIR } from './services/screenshot.service.js';
import { log } from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.set('trust proxy', 1); // за nginx — иначе rate limit увидит один и тот же IP

app.use(helmet({
  // CSP выключен намеренно: index.html держит стили и скрипты инлайном,
  // грузит шрифты Google и картинки с внешних доменов. Включать CSP имеет
  // смысл вместе с выносом инлайнового кода — это отдельная задача.
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(express.json({ limit: '32kb' }));

/* ── Лимиты ── */

const auditLimiter = rateLimit({
  windowMs: Number(process.env.AUDIT_RATE_LIMIT_WINDOW_MIN || 15) * 60 * 1000,
  max: Number(process.env.AUDIT_RATE_LIMIT_MAX || 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, code: 'rate_limited', error: 'Вы уже запустили несколько проверок. Попробуйте немного позже.' }
});

const leadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, code: 'rate_limited', error: 'Слишком много отправок подряд. Попробуйте чуть позже.' }
});

/* ── API ── */

const auditSchema = z.object({
  url: z.string().min(1, 'Введите адрес сайта').max(500, 'Адрес слишком длинный')
});

/**
 * Проверка синтаксиса ДО лимитера — намеренно.
 * Иначе посетитель, сделавший пару опечаток, сжигал бы свою квоту
 * проверок ещё до первого реального аудита. Здесь только разбор строки,
 * без DNS и сети: нагрузки на сервер такой запрос не создаёт.
 */
function validateAuditBody(req, res, next) {
  const parsed = auditSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, code: 'invalid', error: 'Введите адрес сайта' });
  }
  try {
    normalizeUrl(parsed.data.url);
    req.auditUrl = parsed.data.url;
    next();
  } catch (err) {
    if (err instanceof AuditError) {
      return res.status(422).json({ success: false, code: err.code, error: err.userMessage });
    }
    return res.status(400).json({ success: false, code: 'invalid', error: 'Проверьте правильность адреса' });
  }
}

app.post('/api/audit', validateAuditBody, auditLimiter, async (req, res) => {
  try {
    const report = await runAudit(req.auditUrl);
    res.json(report);
  } catch (err) {
    if (err instanceof AuditError) {
      log.warn('audit_failed', { code: err.code });
      return res.status(422).json({ success: false, code: err.code, error: err.userMessage });
    }
    // Наружу — обобщённый текст: stack trace посетителю знать незачем
    log.error('audit_crashed', { message: String(err?.message).slice(0, 200) });
    res.status(500).json({
      success: false,
      code: 'internal',
      error: 'Не удалось завершить проверку. Попробуйте ещё раз через минуту'
    });
  }
});

const leadSchema = z.object({
  // uuid проверяем, но своим сообщением: дефолтное zod-«Invalid uuid»
  // посетителю ничего не говорит и вдобавок на английском
  auditId: z.string().uuid('Результаты проверки не найдены, запустите её заново').optional(),
  name: z.string().trim().min(2, 'Укажите имя').max(80),
  contact: z.string().trim().min(3, 'Укажите способ связи').max(120),
  comment: z.string().trim().max(1000).optional().or(z.literal('')),
  consent: z.literal(true, { errorMap: () => ({ message: 'Нужно согласие на обработку данных' }) })
});

app.post('/api/audit-lead', leadLimiter, async (req, res) => {
  const parsed = leadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false, code: 'invalid',
      error: parsed.error.issues[0]?.message || 'Проверьте заполнение формы'
    });
  }

  // Результаты аудита берём из серверного хранилища по auditId, а не из
  // тела запроса: присланному фронтом баллу доверять нельзя.
  const audit = parsed.data.auditId ? getStoredReport(parsed.data.auditId) : null;

  const result = await sendLead(parsed.data, audit);
  if (!result.ok) {
    return res.status(502).json({ success: false, code: 'send_failed', error: 'Не удалось отправить заявку. Напишите в Telegram' });
  }

  log.info('lead_submitted', { auditId: parsed.data.auditId || null, channel: result.channel, hasAudit: !!audit });
  res.json({ success: true });
});

const quizPackageSchema = z.object({
  id: z.string().max(20),
  name: z.string().max(80),
  price: z.string().max(40)
});

const quizAnswerSchema = z.object({
  question: z.string().max(200),
  answer: z.string().max(120)
});

const quizLeadSchema = z.object({
  source: z.string().max(60).optional(),
  name: z.string().trim().min(2, 'Укажите имя').max(80),
  contact: z.string().trim().min(3, 'Укажите способ связи').max(120),
  channel: z.enum(['telegram', 'whatsapp', 'email']).optional(),
  comment: z.string().trim().max(1000).optional().or(z.literal('')),
  consent: z.literal(true, { errorMap: () => ({ message: 'Нужно согласие на обработку данных' }) }),
  package: quizPackageSchema,
  answers: z.array(quizAnswerSchema).max(20)
});

app.post('/api/quiz-lead', leadLimiter, async (req, res) => {
  const parsed = quizLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false, code: 'invalid',
      error: parsed.error.issues[0]?.message || 'Проверьте заполнение формы'
    });
  }

  const result = await sendQuizLead(parsed.data);
  if (!result.ok) {
    return res.status(502).json({ success: false, code: 'send_failed', error: 'Не удалось отправить заявку. Напишите в Telegram' });
  }

  log.info('quiz_lead_submitted', { source: parsed.data.source || null, package: parsed.data.package.id, channel: result.channel });
  res.json({ success: true });
});

const contactLeadSchema = z.object({
  source: z.string().max(60).optional(),
  name: z.string().trim().min(2, 'Укажите имя').max(80),
  contact: z.string().trim().min(3, 'Укажите способ связи').max(120),
  channel: z.enum(['telegram', 'whatsapp', 'email']).optional(),
  comment: z.string().trim().max(1000).optional().or(z.literal('')),
  consent: z.literal(true, { errorMap: () => ({ message: 'Нужно согласие на обработку данных' }) })
});

app.post('/api/contact-lead', leadLimiter, async (req, res) => {
  const parsed = contactLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false, code: 'invalid',
      error: parsed.error.issues[0]?.message || 'Проверьте заполнение формы'
    });
  }

  const result = await sendContactLead(parsed.data);
  if (!result.ok) {
    return res.status(502).json({ success: false, code: 'send_failed', error: 'Не удалось отправить заявку. Напишите в Telegram' });
  }

  log.info('contact_lead_submitted', { source: parsed.data.source || null, channel: result.channel });
  res.json({ success: true });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mock: process.env.AUDIT_MOCK_MODE === 'true',
    pagespeed: !!process.env.PAGESPEED_API_KEY,
    telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
  });
});

/* ── Статика ── */

app.use('/audit-screenshots', express.static(TEMP_DIR, {
  maxAge: '1h',
  index: false,
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff')
}));

app.use(express.static(SITE_ROOT, {
  extensions: ['html'],
  setHeaders: (res, filePath) => {
    if (/\.(css|js|webp|jpg|png|svg)$/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}));

/* ── Уборка временных файлов ── */

const ttlHours = Number(process.env.AUDIT_SCREENSHOT_TTL_HOURS || 24);
cleanupScreenshots(ttlHours);
setInterval(() => cleanupScreenshots(ttlHours), 60 * 60 * 1000).unref();

app.listen(PORT, () => {
  log.info('server_started', {
    port: PORT,
    mock: process.env.AUDIT_MOCK_MODE === 'true',
    pagespeedKey: !!process.env.PAGESPEED_API_KEY
  });
  console.log(`\n  Сайт и API:  http://localhost:${PORT}\n`);
});
