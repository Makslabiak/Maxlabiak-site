# Site Dars — Deploy Context

## 🗺️ РОАДМАП / ТЕКУЩИЙ ПЛАН (читать в первую очередь)

**Статус на 03.08.2026:** сайт live на Netlify (домен + SSL заработали
после ~6ч пропагации), бэкенд на Hetzner. Работает, но ВРЕМЕННО — конечная
цель другая, см. ниже.

**Почему уходим с Hetzner + Netlify:** оба варианта имеют риск блокировки
для российской аудитории (репаунт-компании — целевая аудитория из РФ):
- Hetzner — РКН периодически блокирует/душит подсети (волны в 2024, 2025).
- Netlify — есть свежие (февраль 2026) сообщения о полной блокировке в РФ.
Подробности и источники — см. историю чата, не дублирую здесь.

**План (по шагам, НЕ выполнено, кроме первого пункта):**
1. ✅ Куплен новый сервер на **Reg.ru** (Рег.облако) — российский хостинг,
   без риска блокировки для аудитории. Конфиг: 1 vCPU, 2GB RAM, 10GB SATA,
   Ubuntu 24.04 LTS, регион Москва-3, тариф Stdp C1-M2-D10, ~915₽/мес.
   SSH-ключ `claude_mac` уже добавлен при создании (публичный ключ — см.
   раздел "SSH-ключи" ниже, тот же, что и для Hetzner).
   **IP сервера пока не сообщён — нужно уточнить у пользователя.**
2. ⬜ Пользователь ДОДЕЛЫВАЕТ сайт (контент/дизайн/правки) в текущем виде —
   фронт на Netlify, бэкенд на Hetzner. НЕ трогать эту связку без явной
   просьбы, пока сайт не готов к финалу.
3. ⬜ Когда сайт готов — перенести бэкенд (`site-dars`) с Hetzner на новый
   сервер Reg.ru: Node.js, PM2, Playwright+Chromium, Nginx, `.env`,
   код — по аналогии с тем, как разворачивали на Hetzner (см. секции ниже,
   те же команды/подход, просто другой IP).
4. ⬜ Задеплоить статику ТУДА ЖЕ, на Reg.ru-сервер (Nginx отдаёт напрямую,
   Netlify для этого проекта больше не нужен) — то есть в итоге ВСЁ
   (фронт + бэкенд) съезжает на один российский сервер.
5. ⬜ Переключить DNS `maxlabiak.pro`: с Netlify DNS (dns1-4.p08.nsone.net)
   обратно на простую A-запись → IP нового Reg.ru-сервера. Через Reg.ru
   как регистратора это должно быть быстрее, чем было с Netlify.
6. ⬜ Выпустить SSL на новом сервере (Let's Encrypt / certbot).
7. ⬜ Убедиться, что всё работает с нового домена, и только ПОСЛЕ этого:
   сделать снапшот старого Hetzner-сервера (сохранит Darts AI Studio,
   там же 8 других ботов) и удалить сам сервер — деньги за него капают
   независимо от того, включён он или выключен (особенность биллинга
   Hetzner Cloud), так что снапшот+удаление — единственный способ
   остановить списание, если Hetzner вообще больше не нужен.

**Если начинаешь новую сессию и не знаешь, на каком шаге план** — спроси
у пользователя, либо проверь: `curl -I https://maxlabiak.pro/` — если
заголовок `Server: nginx` — уже переехали на Reg.ru; если `Server: Netlify`
— всё ещё на старой связке, работаем по шагу 2.

---

## Проект
Лендинг + бэкенд для ниши ремонтных компаний. Статика (Netlify) + Express-бэкенд
с реальным аудитом сайтов (Playwright-скриншоты, PageSpeed API, лиды в Telegram).

## Локальная папка
```
/Users/maksim/site dars
```

## GitHub
```
https://github.com/Makslabiak/Maxlabiak-site.git (публичный)
SSH: /Users/maksim/.ssh/id_ed25519 (тот же дефолтный ключ)
Push: gh auth сохранён локально (gh auth login под Makslabiak)
```
```bash
cd "/Users/maksim/site dars"
git add . && git commit -m "update" && git push
```

## Сервер (Hetzner) — общий с Darts AI Studio
```
IP: 116.203.53.143  User: root  (Nuremberg)
SSH-ключ: /Users/maksim/.ssh/hetzner-darts
Код бэкенда: /root/site-dars
```

### ⚠️ ВАЖНО: порт 22 заблокирован VPN пользователя
Обычный `ssh root@116.203.53.143` НЕ РАБОТАЕТ, если у пользователя включён VPN
(блокирует исходящий 22 порт полностью, даже до github.com). Обходной путь —
на сервере через iptables настроен redirect 443→22:
```bash
iptables -t nat -A PREROUTING -p tcp --dport 443 -j REDIRECT --to-port 22
```
Поэтому подключаться нужно ЧЕРЕЗ ПОРТ 443:
```bash
ssh -i /Users/maksim/.ssh/hetzner-darts -p 443 root@116.203.53.143
```
**Побочный эффект:** порт 443 сейчас занят под этот SSH-редирект, поэтому
Nginx НЕ МОЖЕТ слушать 443 напрямую (нужно для нормального HTTPS/SSL).
Перед настройкой SSL на бэкенде (api.maxlabiak.pro и т.п.) нужно:
- либо снять iptables-правило (`iptables -t nat -D PREROUTING ...` то же правило) —
  тогда SSH снова будет только по VPN-недоступному 22,
- либо перенести SSH-редирект на другой запасной порт (не 443),
- либо просить пользователя отключать VPN на момент SSH-сессий.
Пока НЕ решено — API работает только по HTTP by design (Netlify redirect
проксирует server-to-server, так что mixed content в браузере не возникает).

### Также: при выключении VPN на Mac рвётся сама сессия Desktop Commander
(Claude Desktop нужен VPN в регионе пользователя). Поэтому переключение VPN
туда-обратно требует переподключения инструментов (`tool_search` заново).
Лучше избегать переключений VPN посреди длинной операции.

## PM2 (на сервере, процесс называется `site-dars`, всего 9 процессов вместе с Darts AI Studio)
```bash
pm2 status
pm2 logs site-dars --lines 50 --nostream
pm2 restart site-dars
pm2 save   # после любого изменения списка процессов
```

## Деплой бэкенда (после git push с мака)
```bash
ssh -i /Users/maksim/.ssh/hetzner-darts -p 443 root@116.203.53.143 \
  "cd /root/site-dars && git pull && npm install --production && pm2 restart site-dars"
```
(Пока `/root/site-dars` НЕ склонирован из git, а залит через rsync напрямую —
нужно один раз сделать `git init` + remote там, или просто продолжать через rsync:)
```bash
rsync -avz -e "ssh -i /Users/maksim/.ssh/hetzner-darts -p 443" \
  --exclude 'node_modules' --exclude '.git' --exclude '.env' --exclude '_arhiv' \
  "/Users/maksim/site dars/" root@116.203.53.143:/root/site-dars/
```

## Nginx (на сервере)
Конфиг: `/etc/nginx/sites-available/default` — проксирует порт 80 → 127.0.0.1:3000.
```bash
nginx -t && systemctl reload nginx
```

## .env на сервере (`/root/site-dars/.env`)
Скопирован напрямую с мака (не в git). Известные пробелы:
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — пустые, заявки падают в файл
  вместо отправки в Telegram. Заполнить при необходимости.
- `PAGESPEED_API_KEY` — заполнен, работает.

## Netlify (статика)
```
Аккаунт: max Labiak (lobyak2401@gmail.com)
Сайт: velvety-empanada-a8033c (id: 1395b0f9-775a-480e-b5f9-5a3fa23eaf77)
CLI залогинен локально на маке (netlify login), OAuth-коннектор в Claude
не работал — VPN пользователя блокирует netlify.com при попытке OAuth,
а claude.com недоступен без VPN (регион). Используем ТОЛЬКО netlify CLI.
```
Папка для деплоя статики (чистая, без node_modules/бэкенда):
```
/Users/maksim/site dars/deploy-netlify   (index.html без dev-скрипта annotator, assets/, images/, netlify.toml)
```
Деплой:
```bash
cd "/Users/maksim/site dars/deploy-netlify"
netlify deploy --prod --dir . --no-build
```
**Важно:** флаг `--no-build` обязателен — без него Netlify Build падает с
ошибкой `Failed retrieving extensions for site ...: fetch failed` (баг/лимитация
окружения, воспроизводится стабильно).

`netlify.toml` — прокси `/api/*` и `/audit-screenshots/*` на бэкенд Hetzner
(`http://116.203.53.143/...`), status 200 (rewrite, не редирект в браузере).

## Домен
```
maxlabiak.pro — куплен на Reg.ru (аккаунт lobyak2401@gmail.com)
DNS: переведён на Netlify DNS (dns1-4.p08.nsone.net)
```
**Статус на 02.08.2026 21:31 — ещё НЕ пропагировался** (5+ часов), Netlify
UI показывает "Netlify DNS propagating...", SSL "Waiting on DNS propagation".
На Reg.ru изначально был смешанный набор NS (частично старая зона p01,
частично p08) — заменено на корректные все-4 p08 вручную в панели Reg.ru,
но реестр .pro всё ещё отдаёт старые данные (dig +trace показывает SOA
dns1.p01.nsone.net от корневых серверов — ненормально долго).
**Следующий шаг:** пользователь написал в поддержку Reg.ru с вопросом,
дошло ли изменение до реестра. Проверить домен снова, когда ответят/сработает.

## Общий контекст с Darts AI Studio
Это один и тот же физический сервер Hetzner — при любых операциях (рестарт
nginx, iptables, системные команды) НЕ трогать процессы `darts-ai-studio`,
`garrett`, `katya`, `artem`, `sofa`, `maks`, `denis`, `igor` — это боевые
телеграм-боты другого проекта, работающие на том же сервере через PM2.
