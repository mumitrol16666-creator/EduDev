# EduDev / Yedu CRM API Contracts

This document is the frontend contract for the current backend MVP.

Base URL:

- Local backend: `http://127.0.0.1:4100`
- Production frontend calls the backend through the same domain: `/api/*`
- All CRM endpoints except `/health`, `/api/meta` and `/api/auth/login` require a bearer token.

## Authentication

### Login

`POST /api/auth/login`

Request:

```json
{
  "email": "supervisor@edudev.local",
  "password": "value from CRM_ADMIN_PASSWORD"
}
```

Response:

```json
{
  "success": true,
  "session": {
    "token": "session_token",
    "user": {
      "id": "usr_supervisor",
      "name": "Управляющий",
      "role": "supervisor",
      "email": "supervisor@edudev.local",
      "status": "active"
    }
  }
}
```

Frontend must store `session.token` and send it as:

`Authorization: Bearer session_token`

### Current User

`GET /api/me`

Response:

```json
{
  "success": true,
  "user": {
    "id": "usr_manager",
    "name": "Менеджер",
    "role": "manager",
    "status": "active"
  }
}
```

### Logout

`POST /api/auth/logout`

Response:

```json
{
  "success": true,
  "result": {
    "revoked": true
  }
}
```

### Change Password

`PATCH /api/auth/password`

Request:

```json
{
  "currentPassword": "current user password",
  "newPassword": "newpass123"
}
```

Changing password revokes all active sessions for the user.

## Common Response Rules

Success responses always include:

```json
{
  "success": true
}
```

Error responses:

```json
{
  "success": false,
  "error": "Message"
}
```

Common HTTP statuses:

- `200`: action succeeded.
- `201`: entity created.
- `400`: invalid request or missing business rule.
- `401`: missing or invalid bearer token.
- `403`: permission denied.
- `404`: route or record not found.
- `500`: unexpected backend error.

## List Contract

Collection list endpoints:

- `GET /api/users`
- `GET /api/leads`
- `GET /api/clients`
- `GET /api/deals`
- `GET /api/tasks`
- `GET /api/diagnostics`
- `GET /api/proposals`
- `GET /api/payments`
- `GET /api/subscriptions`
- `GET /api/debts`
- `GET /api/implementation-projects`
- `GET /api/data-collection-requests`
- `GET /api/support-tickets`
- `GET /api/notifications`
- `GET /api/reference-items`
- `GET /api/audit-logs`

Query parameters:

- `q` or `search`: text search.
- `sort`: field sort, for example `sort=-createdAt` or `sort=status,-createdAt`.
- `page`: page number, default `1`.
- `limit`: page size, default `50`, max `200`.
- exact filters: `status=open`, `stage=proposal`, `responsibleId=usr_manager`.
- multi-value filters: `status=open,in_progress`.
- date ranges: `createdAtFrom=2026-07-01`, `createdAtTo=2026-07-31`.
- number ranges: `amountFrom=100000`, `amountTo=300000`.

Response:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "total": 0,
    "page": 1,
    "limit": 50,
    "pages": 1,
    "sort": "-createdAt",
    "filters": {},
    "search": ""
  }
}
```

Role scoping is applied automatically:

- manager sees assigned leads, related deals, clients and tasks;
- developer sees assigned tasks, implementation projects, support tickets and linked clients;
- supervisor and owner see company-wide data;
- raw leads are hidden from developer.

## Detail Contract

Collection detail endpoints:

- `GET /api/leads/:id`
- `GET /api/deals/:id`
- `GET /api/clients/:id`
- `GET /api/implementation-projects/:id`
- `GET /api/support-tickets/:id`
- generic detail is also available for other collections.

Response:

```json
{
  "success": true,
  "detail": {
    "lead": {},
    "deals": [],
    "tasks": [],
    "communications": [],
    "notes": []
  }
}
```

The key inside `detail` depends on collection:

- lead detail: `lead`, `diagnostics`, `deals`, `tasks`, `communications`, `notes`.
- deal detail: `deal`, `lead`, `client`, `proposal`, `payments`, `implementationProject`, `tasks`.
- client detail: `client`, `lead`, `deals`, `payments`, `implementationProjects`, `supportTickets`, `subscriptions`, `debts`, `notes`.
- implementation detail: `project`, `client`, `deal`, `tasks`, `dataCollectionRequests`, `supportTickets`.
- support ticket detail: `ticket`, `client`, `project`, `tasks`, `notes`.

## Navigation

Frontend must not hardcode menu visibility.

`GET /api/navigation`

Response:

```json
{
  "success": true,
  "navigation": [
    {
      "id": "leads",
      "label": "Leads",
      "path": "/leads",
      "api": ["/api/leads"],
      "entities": ["leads", "diagnostics", "tasks"]
    }
  ]
}
```

Use this after login to render the sidebar and route availability.

## Meta And Dictionaries

### Public Meta

`GET /api/meta`

Returns enum-like constants:

- roles
- directions: `autotech`, `edutech`
- autotech niches
- edutech niches
- lead statuses
- deal stages
- packages
- implementation statuses
- support ticket statuses
- subscription and debt statuses

### Admin Dictionaries

`GET /api/settings/dictionaries`

Requires admin access.

Returns system and custom reference items grouped by dictionary name.

Custom item:

`POST /api/settings/reference-items`

```json
{
  "group": "edutech_niches",
  "key": "online_school",
  "label": "Онлайн-школа",
  "value": {
    "description": "Онлайн обучение"
  },
  "sortOrder": 30
}
```

Update item:

`PATCH /api/settings/reference-items/:id`

```json
{
  "label": "Онлайн-школа и курсы",
  "status": "active",
  "sortOrder": 25
}
```

## Main Sales Flow

### Create Lead

`POST /api/leads`

Permission: `lead:write`

AutoTech request:

```json
{
  "name": "Oil Service Aktobe",
  "direction": "autotech",
  "niche": "oil_change",
  "city": "Актобе",
  "phone": "+77000000000",
  "whatsapp": "+77000000000",
  "source": "manual",
  "decisionMaker": "Айдос",
  "currentAccounting": "Excel",
  "pain": "Склад и повторные клиенты"
}
```

EduTech request:

```json
{
  "name": "Maestro Music School",
  "direction": "edutech",
  "niche": "music_school",
  "city": "Актобе",
  "phone": "+77000000003",
  "currentAccounting": "Таблицы и WhatsApp",
  "pain": "Расписание, оплаты и долги родителей"
}
```

If `direction` is omitted, backend uses `autotech`.

Response:

```json
{
  "success": true,
  "lead": {
    "id": "lead_id",
    "direction": "edutech",
    "niche": "music_school",
    "status": "contact_check"
  }
}
```

Creating a lead also creates a contact-check task.

### Update Lead

`PATCH /api/leads/:id`

```json
{
  "status": "first_touch",
  "pain": "Нет единого расписания"
}
```

### Add Diagnostics

`POST /api/leads/:id/diagnostics`

Permission: `deal:write`

Request:

```json
{
  "answers": {
    "currentTools": "Excel, WhatsApp",
    "teamSize": 5
  },
  "problems": ["расписание преподавателей", "оплаты и долги родителей"],
  "estimatedAmount": 250000,
  "packageId": "business"
}
```

Response:

```json
{
  "success": true,
  "diagnostics": {
    "id": "diagnostics_id",
    "recommendedSections": [
      "students_parents_programs",
      "schedule_teachers_rooms",
      "payments_subscriptions_debts",
      "niche_music_school"
    ]
  },
  "deal": {
    "id": "deal_id",
    "direction": "edutech",
    "stage": "presentation",
    "amount": 250000
  }
}
```

Diagnostics creates the deal and a meeting task.

### Move Deal Stage

`PATCH /api/deals/:id/stage`

```json
{
  "stage": "proposal",
  "probability": 60,
  "nextActionAt": "2026-07-05T10:00:00.000Z"
}
```

Rules:

- `stage=lost` requires `lostReason`.
- stage changes create stage-dependent tasks.

### Change Deal Amount

`PATCH /api/deals/:id/amount`

```json
{
  "amount": 320000,
  "reason": "Согласовали стартовый пакет"
}
```

Rules:

- reason is required;
- audit log is written.

### Create Proposal

`POST /api/deals/:id/proposals`

```json
{
  "amount": 350000,
  "sections": ["students_parents_programs", "schedule_teachers_rooms"],
  "comment": "Стартовый запуск"
}
```

### Record Payment

`POST /api/deals/:id/payments`

Permission: `payment:write`

```json
{
  "amount": 180000,
  "method": "kaspi",
  "paidAt": "2026-07-03T12:00:00.000Z",
  "comment": "Предоплата"
}
```

Response contains:

```json
{
  "success": true,
  "payment": {},
  "client": {},
  "project": {}
}
```

Rules:

- payment is linked to deal and client;
- client is created if missing;
- implementation project is created after payment;
- free support date is set for 4 months after implementation project creation.

## Tasks

### Create Management Task

`POST /api/tasks`

Permission: `task:write`

```json
{
  "title": "Проверить импорт тарифов",
  "description": "После диагностики школы",
  "responsibleId": "usr_developer",
  "clientId": "client_id",
  "projectId": "project_id",
  "priority": "high",
  "dueAt": "2026-07-04T10:00:00.000Z"
}
```

### Complete Task

`PATCH /api/tasks/:id/complete`

```json
{
  "result": "Импорт проверен"
}
```

Rules:

- result is required.

### Reschedule Task

`PATCH /api/tasks/:id/reschedule`

```json
{
  "dueAt": "2026-07-06T10:00:00.000Z",
  "comment": "Клиент перенес встречу"
}
```

Rules:

- comment and new date are required.

## Implementation

### Create Data Collection Request

`POST /api/implementation-projects/:id/data-collection`

Permission: `implementation:write`

Request can be empty; backend will generate items by niche.

```json
{
  "dueAt": "2026-07-05T10:00:00.000Z",
  "sentTo": "+77000000003",
  "comment": "Отправили клиенту список данных"
}
```

EduTech generated items include:

- company profile;
- admins, teachers, roles and access;
- programs, tariffs, duration and prices;
- rooms, regular schedule and rescheduling rules;
- niche-specific items.

### Update Implementation Status

`PATCH /api/implementation-projects/:id/status`

```json
{
  "status": "configuration",
  "comment": "Данные получены"
}
```

Rules:

- `paused`, `done` and `support` require comment.

### Update Checklist Item

`PATCH /api/implementation-projects/:id/checklist/:itemIndex`

```json
{
  "done": true,
  "comment": "Тарифы и расписание настроены"
}
```

If all checklist items are done, project status becomes `done`.

## Support

### Create Support Ticket

`POST /api/support-tickets`

Permission: `support:write`

```json
{
  "clientId": "client_id",
  "projectId": "project_id",
  "type": "bug",
  "title": "Не отображается расписание",
  "description": "Администратор не видит занятия на следующую неделю",
  "responsibleId": "usr_developer",
  "priority": "high"
}
```

### Assign Ticket

`PATCH /api/support-tickets/:id/assign`

```json
{
  "responsibleId": "usr_developer",
  "comment": "Передано программисту"
}
```

### Change Ticket Status

`PATCH /api/support-tickets/:id/status`

```json
{
  "status": "in_progress",
  "comment": "Взято в работу"
}
```

### Close Ticket

`PATCH /api/support-tickets/:id/close`

```json
{
  "result": "Исправлено и проверено"
}
```

Rules:

- result is required.

## Finance After Launch

### Create Subscription

`POST /api/clients/:id/subscriptions`

```json
{
  "amount": 20000,
  "packageId": "business",
  "periodStart": "2026-07-03T00:00:00.000Z",
  "periodEnd": "2026-08-03T00:00:00.000Z"
}
```

### Renew Subscription

`PATCH /api/subscriptions/:id/renew`

```json
{
  "comment": "Оплата за следующий месяц"
}
```

### Create Debt

`POST /api/clients/:id/debts`

```json
{
  "amount": 20000,
  "reason": "Не оплачено продление",
  "dueAt": "2026-08-03T00:00:00.000Z"
}
```

### Mark Debt Paid

`PATCH /api/debts/:id/paid`

```json
{
  "comment": "Оплачено Kaspi"
}
```

## Notes And Communications

### Add Note

`POST /api/notes`

```json
{
  "entityType": "client",
  "entityId": "client_id",
  "text": "Клиент хочет запуск до понедельника",
  "type": "context"
}
```

### Add Communication

`POST /api/communications`

```json
{
  "leadId": "lead_id",
  "dealId": "deal_id",
  "channel": "call",
  "result": "interested",
  "summary": "Назначили диагностику",
  "responsibleId": "usr_manager"
}
```

Communication rules can create follow-up tasks automatically.

## Workbenches

### Manager Today

`GET /api/workbench/today`

Optional query:

- `responsibleId=usr_manager`

Response includes:

- overdue tasks;
- new assigned leads;
- deals without next action;
- stalled deals;
- counters.

### Developer Workbench

`GET /api/developer/workbench`

Response includes:

- assigned developer tasks;
- processed implementation projects;
- assigned or linked support tickets;
- counters.

Developers do not see raw leads.

## Notifications

### List

`GET /api/notifications`

Supports normal list filters.

Response:

```json
{
  "success": true,
  "notifications": [],
  "meta": {},
  "unreadCount": 0
}
```

### Mark One Read

`PATCH /api/notifications/:id/read`

### Mark All Read

`PATCH /api/notifications/read-all`

## Analytics And Demo

### Analytics Summary

`GET /api/analytics/summary`

Requires analytics permission.

Returns counters for:

- leads;
- deals;
- payments;
- implementation;
- support;
- subscriptions;
- debts.

### Demo Snapshot

`GET /api/demo/snapshot`

Returns anonymized demo data. It must not expose real names, contacts, prices or internal notes.

## Frontend Build Order

Recommended order for building screens:

1. Login and session storage.
2. `/api/me` and `/api/navigation`.
3. Shared list view using the list contract.
4. Lead creation and diagnostics form.
5. Deal detail with proposal and payment actions.
6. Implementation project detail with data collection and checklist.
7. Developer workbench and support tickets.
8. Finance: subscriptions and debts.
9. Analytics and audit for supervisor/owner.
