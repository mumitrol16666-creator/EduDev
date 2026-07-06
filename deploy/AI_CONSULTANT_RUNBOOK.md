# AI-консультант EduDev / Maestro

Инструкция для подключения AI-консультанта к production-серверу EduDev CRM.

## 1. Обновить код и базу

```bash
cd /var/www/edudev
./deploy/deploy.sh
```

Deploy применит Prisma migration:

```text
20260706120000_add_ai_consultant_fields
```

Она добавляет AI-поля в заявки и описание задач.

## 2. Настроить backend/.env

Минимальный production-набор:

```bash
AI_CONSULTANT_ENABLED=true
AI_CONSULTANT_PROJECT_ID="maestro"
AI_CONSULTANT_MODE="rules"
AI_CONSULTANT_LLM_ENABLED=false

AI_CONSULTANT_SCHOOL_NAME="школы Маэстро"
AI_CONSULTANT_BRAND_NAME="Маэстро"
AI_CONSULTANT_CITY="Актобе"
AI_CONSULTANT_CRM_DIRECTION="edutech"
AI_CONSULTANT_CRM_NICHE="music_school"
AI_CONSULTANT_LEAD_SOURCE="whatsapp_green_api"
AI_CONSULTANT_DIRECTIONS="вокал,фортепиано,гитара,актерское мастерство,танцы"

GREEN_API_INSTANCE_ID="CHANGE_ME"
GREEN_API_TOKEN="CHANGE_ME"
GREEN_API_URL="https://api.green-api.com"

AI_CONSULTANT_WEBHOOK_TOKEN="CHANGE_LONG_RANDOM_WEBHOOK_TOKEN"
AI_CONSULTANT_CRON_TOKEN="CHANGE_LONG_RANDOM_CRON_TOKEN"
AI_CONSULTANT_ADMIN_TOKEN="CHANGE_LONG_RANDOM_ADMIN_TOKEN"

AI_CONSULTANT_TIMEZONE="Asia/Aqtobe"
AI_CONSULTANT_WORKING_HOURS="09:00-21:00"
AI_CONSULTANT_TEST_ENDPOINTS=false
```

Если `GREEN_API_INSTANCE_ID` или `GREEN_API_TOKEN` пустые, CRM будет создавать лидов, коммуникации и задачи, но WhatsApp-ответы отправляться не будут.

## 3. Перезапустить backend

```bash
pm2 reload edudev --update-env
pm2 logs edudev --lines 80
```

## 4. Проверить API

Публичная проверка:

```bash
curl -i https://api.edudev.kz/api/ai-consultant/health
```

Закрытая проверка готовности:

```bash
curl -i "https://api.edudev.kz/api/ai-consultant/readiness?token=$AI_CONSULTANT_ADMIN_TOKEN"
```

Аудит базы знаний и слотов:

```bash
curl -i "https://api.edudev.kz/api/ai-consultant/content-audit?token=$AI_CONSULTANT_ADMIN_TOKEN"
```

## 5. Вшить Green API webhook

В кабинете Green API у instance указать webhook:

```text
https://api.edudev.kz/webhooks/green-api?token=AI_CONSULTANT_WEBHOOK_TOKEN
```

Включить входящие сообщения. Исходящие сообщения AI игнорирует, чтобы не отвечать самому себе.

## 6. Включить напоминания cron

Вариант через локальный worker:

```bash
crontab -e
```

Добавить:

```cron
* * * * * cd /var/www/edudev/backend && npm run ai:dispatch-reminders >> /var/log/edudev-ai-reminders.log 2>&1
```

И добавить logrotate для `/var/log/edudev-ai-reminders.log`, если файл начнет расти.

Вариант через HTTP endpoint:

```bash
curl -X POST "https://api.edudev.kz/api/ai-consultant/reminders/dispatch?token=$AI_CONSULTANT_CRON_TOKEN" \
  -H 'content-type: application/json' \
  -d '{}'
```

## 7. Что AI делает в CRM

- находит заявку по WhatsApp-телефону или создает новую;
- сохраняет входящее сообщение как коммуникацию;
- обновляет AI-профиль заявки: интерес, возраст, цель, удобное время;
- пишет AI-заметки в карточку заявки;
- создает задачи менеджеру, если нужен человек;
- планирует напоминания как задачи CRM;
- отправляет короткие WhatsApp-ответы через Green API, если ключи настроены;
- не отвечает клиенту, если включен opt-out или активен human handoff.

## 8. Rollback

Если нужно быстро выключить AI без отката кода:

```bash
AI_CONSULTANT_ENABLED=false
pm2 reload edudev --update-env
```

Webhook можно оставить: backend будет принимать запрос, но не будет вести диалог.
