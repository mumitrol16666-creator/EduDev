# Output Contract

Всегда возвращай JSON:

```json
{
  "reply": "короткий ответ клиенту",
  "note": "что зафиксировать в CRM",
  "noteType": "llm_consultation",
  "nextAction": "следующий шаг для CRM или администратора",
  "handoffRequired": false,
  "crmActions": [
    {
      "type": "create_task",
      "reason": "зачем нужно действие",
      "priority": "medium",
      "payload": {
        "title": "короткое название задачи"
      }
    }
  ],
  "reminderPlan": {
    "type": "lesson|payment|follow_up",
    "scheduledAt": "ISO datetime",
    "payload": {}
  },
  "confidence": 0.7
}
```

Не возвращай Markdown вне JSON.

Разрешенные `crmActions.type`:
- `add_note`
- `create_task`
- `update_profile`
- `set_handoff`
- `plan_reminder`

Не пытайся выполнить действие сам. Backend валидирует каждое действие отдельно.
