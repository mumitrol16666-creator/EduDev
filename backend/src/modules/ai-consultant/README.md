# AI Consultant Module

Подключаемый MVP-модуль AI-консультанта школы Маэстро.

## Что уже делает

- принимает Green API webhook на `POST /webhooks/green-api`;
- нормализует WhatsApp-телефон;
- ищет лида по телефону или создает нового лида `edutech/music_school`;
- пишет входящее сообщение в коммуникации CRM;
- сохраняет заметку с решением AI;
- отвечает короткими сообщениями через Green API, если настроены ключи;
- создает задачи менеджеру для human handoff, оплат, переносов, opt-out и голосовых.
- содержит шаблоны напоминаний по урокам и оплатам;
- делит длинные ответы максимум на 3 коротких WhatsApp-сообщения.
- классифицирует intent и сразу эскалирует рискованные темы;
- планирует напоминания как CRM-задачи без отдельной миграции базы.
- читает базу знаний из `knowledge/*.md`;
- предлагает пробные слоты из `trialSlots.json`.
- принимает подтверждение предложенного пробного слота и создает задачу администратору на финальную запись;
- фиксирует opt-out и подавляет дальнейшие автоответы клиенту.
- обрабатывает голосовые: сохраняет provided transcript или создает задачу на ручную расшифровку;
- пишет `ai_consultant_action` в audit log для разбора решений.
- включает human takeover и подавляет автоответы, пока человек ведет диалог;
- отдает простую аналитику модуля по действиям, handoff, opt-out, голосовым и напоминаниям.
- дедуплицирует Green API webhook по `idMessage`;
- учитывает рабочее время и добавляет ночной режим;
- отправляет typing/message с retry.
- диспетчеризует due reminders и не отправляет один reminder повторно.
- проверяет качество базы знаний и пробных слотов через content audit.
- хранит память диалога и объединяет профиль клиента из прошлых сообщений.
- после полного профиля клиента создает next action администратору на подбор пробного урока без дублей.
- добавляет в задачу администратора бриф: профиль клиента, последнее сообщение и ближайшие пробные слоты.
- ведет AI-стадию лида по ТЗ: `new`, `qualified`, `warm`, `trial_booked`, `human_needed`, `opt_out`.
- синхронизирует структурный `aiProfile` и `aiSummary` в карточку лида.
- содержит переносимое AI-core ядро: prompt pack, LLM adapter, CRM-контекст, база знаний и безопасный fallback.
- проектные продажи, FAQ и возражения задаются промптами/базой знаний, а не зашиваются в ядро.
- нормализует AI output contract: `reply`, `note`, `crmActions`, `handoffRequired`, `reminderPlan`, `nextAction`.
- выполняет только безопасные AI-действия через allowlist executor: заметка, задача, профиль, handoff, reminder.
- подключает проект через adapter: project id, CRM mapping, knowledge dir, prompt dir и slots file без правки ядра.
- валидирует project prompt pack: `business_profile`, `sales_playbook`, `faq`, `guardrails`.
- применяет LLM fallback policy: note, rules fallback или handoff при strict LLM / рискованном intent.
- ведет conversation state machine: `collecting_profile`, `offering_trial`, `awaiting_slot_confirmation`, `trial_booked`, `handoff`, `closed`.
- содержит пример project pack для Маэстро в `backend/examples/ai-consultant/maestro`.
- умеет scaffold нового project pack из шаблонов через `npm run ai:scaffold-project`.

## Переменные окружения

```bash
AI_CONSULTANT_ENABLED=true
AI_CONSULTANT_PROJECT_ID=maestro
AI_CONSULTANT_MODE=rules
AI_CONSULTANT_LLM_ENABLED=false
AI_CONSULTANT_CHANNEL_MODE=green_api_safe
AI_CONSULTANT_OUTBOUND_POLICY=allow_reminders
AI_CONSULTANT_MAX_REPLY_PARTS=2
AI_CONSULTANT_MAX_REPLY_LENGTH=420
AI_CONSULTANT_APPEND_OPT_OUT_FOOTER=false
AI_CONSULTANT_LLM_BASE_URL=https://api.openai.com/v1
AI_CONSULTANT_LLM_API_KEY=
AI_CONSULTANT_LLM_MODEL=gpt-4.1-mini
AI_CONSULTANT_LLM_TIMEOUT_MS=15000
AI_CONSULTANT_PROMPT_DIR=
AI_CONSULTANT_PROJECT_PROMPT_DIR=
AI_CONSULTANT_SCHOOL_NAME="школы Маэстро"
AI_CONSULTANT_BRAND_NAME="Маэстро"
AI_CONSULTANT_CITY="Актобе"
AI_CONSULTANT_CRM_DIRECTION=edutech
AI_CONSULTANT_CRM_NICHE=music_school
AI_CONSULTANT_LEAD_SOURCE=whatsapp_green_api
AI_CONSULTANT_DIRECTIONS="вокал,фортепиано,гитара,актерское мастерство,танцы"
GREEN_API_INSTANCE_ID=...
GREEN_API_TOKEN=...
GREEN_API_URL=https://api.green-api.com
AI_CONSULTANT_WEBHOOK_TOKEN=...
AI_CONSULTANT_CRON_TOKEN=...
AI_CONSULTANT_ADMIN_TOKEN=...
AI_CONSULTANT_SEND_DELAY_MS=0
AI_CONSULTANT_KNOWLEDGE_DIR=
AI_CONSULTANT_TRIAL_SLOTS_FILE=
AI_CONSULTANT_AUDIO_DRY_RUN=true
AI_CONSULTANT_TIMEZONE=Asia/Aqtobe
AI_CONSULTANT_WORKING_HOURS=09:00-21:00
AI_CONSULTANT_SEND_RETRIES=2
AI_CONSULTANT_RETRY_DELAY_MS=100
AI_CONSULTANT_TEST_ENDPOINTS=true
```

## Режимы канала

```bash
# Самый правильный production-вариант через официальную WhatsApp Business Platform.
AI_CONSULTANT_CHANNEL_MODE=official_api
AI_CONSULTANT_OUTBOUND_POLICY=allow_all

# Аккуратный режим для Green API: входящие ответы + согласованные напоминания.
AI_CONSULTANT_CHANNEL_MODE=green_api_safe
AI_CONSULTANT_OUTBOUND_POLICY=allow_reminders
AI_CONSULTANT_MAX_REPLY_PARTS=2
AI_CONSULTANT_MAX_REPLY_LENGTH=420

# Локальный браузерный агент: ядро принимает решение, но не шлет через Green API.
AI_CONSULTANT_CHANNEL_MODE=browser_local

# Полный dry-run: CRM обновляется, отправки нет.
AI_CONSULTANT_CHANNEL_MODE=dry_run
```

`AI_CONSULTANT_OUTBOUND_POLICY=inbound_only` блокирует напоминания и любые инициативные отправки. Это самый осторожный режим для прогрева номера.

## Новый Project Pack

```bash
cd backend
npm run ai:scaffold-project -- --id autotech --name "Автосервис"
```

После этого заполните `backend/examples/ai-consultant/autotech/prompts/*.md` и подключите:

```bash
AI_CONSULTANT_PROJECT_ID=autotech
AI_CONSULTANT_PROJECT_PROMPT_DIR=backend/examples/ai-consultant/autotech/prompts
```

Если `GREEN_API_INSTANCE_ID` или `GREEN_API_TOKEN` не заданы, модуль работает в dry-run режиме: CRM обновляется, но сообщение в WhatsApp не отправляется.

## Проверка

```bash
curl http://127.0.0.1:4100/api/ai-consultant/health

curl 'http://127.0.0.1:4100/api/ai-consultant/readiness?token=AI_CONSULTANT_ADMIN_TOKEN'

curl 'http://127.0.0.1:4100/api/ai-consultant/content-audit?token=AI_CONSULTANT_ADMIN_TOKEN'

curl -X POST http://127.0.0.1:4100/api/ai-consultant/test-message \
  -H 'content-type: application/json' \
  -d '{"phone":"+77000000000","text":"Здравствуйте, сколько стоит вокал для ребенка?"}'

curl -X POST http://127.0.0.1:4100/api/ai-consultant/test-reminder \
  -H 'content-type: application/json' \
  -d '{"type":"lesson","studentName":"Алия","startsAt":"2026-07-06T15:00:00.000Z"}'

curl -X POST http://127.0.0.1:4100/api/ai-consultant/test-intent \
  -H 'content-type: application/json' \
  -d '{"text":"Верните деньги, сумма неверная"}'

curl -X POST http://127.0.0.1:4100/api/ai-consultant/test-plan-reminder \
  -H 'content-type: application/json' \
  -d '{"phone":"+77000000000","type":"payment","scheduledAt":"2026-07-10T10:00:00.000Z","amount":"25000 тг"}'

curl -X POST http://127.0.0.1:4100/api/ai-consultant/test-dispatch-reminders \
  -H 'content-type: application/json' \
  -d '{"now":"2026-07-10T10:00:00.000Z"}'

curl -X POST 'http://127.0.0.1:4100/api/ai-consultant/reminders/dispatch?token=AI_CONSULTANT_CRON_TOKEN' \
  -H 'content-type: application/json' \
  -d '{"now":"2026-07-10T10:00:00.000Z"}'

npm run ai:dispatch-reminders

curl -X POST http://127.0.0.1:4100/api/ai-consultant/test-knowledge \
  -H 'content-type: application/json' \
  -d '{"query":"оплата платеж"}'

curl -X POST http://127.0.0.1:4100/api/ai-consultant/test-slots \
  -H 'content-type: application/json' \
  -d '{"direction":"вокал"}'

curl -X POST http://127.0.0.1:4100/api/ai-consultant/test-message \
  -H 'content-type: application/json' \
  -d '{"phone":"+77000000000","type":"audioMessage","fileUrl":"https://example.com/audio.ogg","transcript":"Хочу записаться на пробный урок по вокалу"}'

curl -X POST http://127.0.0.1:4100/api/ai-consultant/test-release-handoff \
  -H 'content-type: application/json' \
  -d '{"phone":"+77000000000","reason":"Диалог завершен"}'

curl 'http://127.0.0.1:4100/api/ai-consultant/analytics?token=AI_CONSULTANT_ADMIN_TOKEN'
```

Для Green API в настройках instance нужно указать webhook URL:

```text
https://your-domain.example/webhooks/green-api?token=AI_CONSULTANT_WEBHOOK_TOKEN
```

## Cron / worker

Для отправки due reminders без HTTP можно запускать:

```bash
cd backend
npm run ai:dispatch-reminders
```

Пример cron на каждую минуту:

```cron
* * * * * cd /path/to/backend && npm run ai:dispatch-reminders >> /var/log/ai-consultant-reminders.log 2>&1
```
