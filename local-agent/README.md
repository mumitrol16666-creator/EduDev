# EduDev Local WhatsApp Agent

Локальный агент для режима:

```bash
AI_CONSULTANT_CHANNEL_MODE="browser_local"
```

Backend думает, создает лидов/задачи/ответы и складывает исходящие сообщения в outbox. Этот агент открывает WhatsApp Web через Playwright и отправляет сообщения из outbox.

## Установка

```bash
cd local-agent
npm install
cp .env.example .env
```

Заполнить:

```bash
CRM_API_URL="https://api.edudev.kz"
LOCAL_AGENT_TOKEN="тот же токен, что AI_CONSULTANT_LOCAL_AGENT_TOKEN на сервере"
```

## Первый запуск

```bash
npm run start
```

Откроется WhatsApp Web. Первый раз нужно вручную отсканировать QR. После этого сессия хранится в `WHATSAPP_USER_DATA_DIR`.

## Режимы

По умолчанию агент только отправляет outbox из CRM:

```bash
LOCAL_AGENT_SEND_ENABLED=true
LOCAL_AGENT_INCOMING_ENABLED=false
```

Чтение входящих из WhatsApp Web можно включить отдельно:

```bash
LOCAL_AGENT_INCOMING_ENABLED=true
```

Важно: чтение входящих через WhatsApp Web зависит от верстки WhatsApp и может потребовать настройки селекторов. Агент не отправляет входящее в CRM, если не смог определить телефон. Самый стабильный первый этап — отправка outbox, а входящие можно отправлять в backend через Green API или ручной тестовый канал.

## Production-подход

- компьютер должен быть включен;
- браузерная сессия WhatsApp Web должна оставаться авторизованной;
- не запускайте два агента на один номер;
- начните с `AI_CONSULTANT_OUTBOUND_POLICY="inbound_only"` или `allow_reminders` без массовых рассылок.
