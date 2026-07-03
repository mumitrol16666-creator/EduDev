# EduDev / Yedu CRM Frontend Screen Plan

Goal: build the CRM interface screen by screen, with strict operational UI and no duplicate primary buttons.

The frontend must follow the backend navigation:

- `GET /api/navigation` decides which screens the user can see.
- Screens must not hardcode role visibility.
- Each screen lives in its own file.
- Shared layout, API client, auth and UI primitives live separately.

## UI Rules

- Strict work interface, not a landing page.
- Dense but readable layout: tables, split panes, detail panels, compact filters.
- One primary action per screen header.
- No duplicate buttons for the same action on the same screen.
- Empty states may explain what is missing, but must not repeat the header primary action.
- Destructive or critical actions require confirmation or required reason/result fields.
- Detail screens show actions only where the user naturally makes the decision.
- Role-hidden actions are not rendered, not merely disabled.
- Every list screen supports search, filters, sort and pagination from the shared list contract.
- Every detail screen has a clear back action and linked entity shortcuts.

## File Structure

Planned frontend files:

```text
crm/
  index.html
  styles/
    base.css
    layout.css
    tables.css
    forms.css
    modals.css
  js/
    app.js
    api.js
    auth.js
    router.js
    state.js
    ui.js
    screens/
      login.js
      dashboard.js
      leads.js
      lead-detail.js
      diagnostics.js
      deals.js
      deal-detail.js
      tasks.js
      clients.js
      client-detail.js
      implementation.js
      implementation-detail.js
      developer-workbench.js
      support.js
      finance.js
      analytics.js
      materials.js
      team.js
      audit.js
      settings.js
```

No screen should define global layout, auth logic or duplicate API wrappers.

## Shared Components

Shared helpers in `ui.js`:

- `PageHeader(title, subtitle, primaryAction)`
- `FilterBar(fields)`
- `DataTable(columns, rows, actions)`
- `DetailPanel(sections)`
- `StatusBadge(status)`
- `EmptyState(title, text)`
- `Modal(title, content, footer)`
- `ConfirmDialog(title, text)`
- `Toast(message, type)`
- `Pagination(meta)`

Shared helpers must not contain business-specific buttons. Screens pass actions explicitly.

## Screen Inventory

### 1. Login

File: `crm/js/screens/login.js`

Purpose:

- Start authenticated session.

API:

- `POST /api/auth/login`

Visible functions:

- Email/password login.
- Login error.
- Save bearer token.
- Redirect to first allowed navigation item.

Primary action:

- `Войти`

No duplicates:

- No second login button in empty state or footer.

### 2. App Shell

Files:

- `crm/index.html`
- `crm/js/app.js`
- `crm/js/router.js`
- `crm/js/auth.js`
- `crm/js/state.js`

Purpose:

- Load user, menu, route and notifications.

API:

- `GET /api/me`
- `GET /api/navigation`
- `GET /api/notifications`
- `POST /api/auth/logout`
- `PATCH /api/auth/password`

Visible functions:

- Sidebar from backend navigation.
- Header with current user.
- Notification indicator.
- Logout.
- Password change modal.

Primary action:

- None in global shell. Primary actions belong to screens only.

### 3. Dashboard

File: `crm/js/screens/dashboard.js`

Purpose:

- Daily control surface.

API:

- `GET /api/workbench/today`
- `GET /api/analytics/summary` for supervisor/owner only.

Visible functions:

- Overdue tasks.
- New assigned leads.
- Deals without next action.
- Stalled deals.
- Client debts for supervisor/owner.
- Operational counters.

Primary action:

- None by default. Dashboard is for opening existing work.

Links:

- Open task.
- Open lead.
- Open deal.
- Open client.

### 4. Leads

File: `crm/js/screens/leads.js`

Purpose:

- Raw incoming applications.

API:

- `GET /api/leads`
- `POST /api/leads`
- `PATCH /api/leads/:id`

Visible functions:

- List leads.
- Search by company/contact/city.
- Filter by status, direction, niche, responsible.
- Create lead.
- Edit status/contact/pain.
- Open lead detail.

Primary action:

- `Создать лид`

No duplicates:

- Empty state says that leads will appear here, but does not render another `Создать лид` button.

### 5. Lead Detail

File: `crm/js/screens/lead-detail.js`

Purpose:

- Work one lead until diagnostics.

API:

- `GET /api/leads/:id`
- `PATCH /api/leads/:id`
- `POST /api/communications`
- `POST /api/notes`
- `POST /api/leads/:id/diagnostics`

Visible functions:

- Lead card: direction, niche, city, contacts, pain.
- Timeline of communications and notes.
- Related tasks.
- Diagnostics start.
- Communication logging.
- Notes.

Primary action:

- `Начать диагностику` if no diagnostics exists.
- If diagnostics exists: no primary duplicate; show link to deal.

### 6. Diagnostics

File: `crm/js/screens/diagnostics.js`

Purpose:

- Convert lead into deal with recommended sections.

API:

- `POST /api/leads/:id/diagnostics`
- `GET /api/materials`

Visible functions:

- Direction/niche context.
- Problem checklist.
- Answers fields.
- Estimated amount.
- Package selection.
- Recommended sections preview.
- Materials/scripts panel.

Primary action:

- `Создать сделку`

No duplicates:

- Preview panel does not repeat the submit button.

### 7. Deals

File: `crm/js/screens/deals.js`

Purpose:

- Sales pipeline.

API:

- `GET /api/deals`

Visible functions:

- Pipeline/list by stage.
- Search by client/lead.
- Filter by stage, direction, responsible.
- Open deal detail.

Primary action:

- None. Deals are created only from diagnostics.

### 8. Deal Detail

File: `crm/js/screens/deal-detail.js`

Purpose:

- Bring deal to payment.

API:

- `GET /api/deals/:id`
- `PATCH /api/deals/:id/stage`
- `PATCH /api/deals/:id/amount`
- `POST /api/deals/:id/proposals`
- `POST /api/deals/:id/payments`
- `POST /api/tasks`
- `POST /api/notes`

Visible functions:

- Deal summary.
- Stage controls.
- Amount with required reason.
- Proposal creation.
- Payment recording.
- Lost reason.
- Related lead/client/project/tasks/payments.

Primary action:

- Stage-dependent:
  - before proposal: `Создать предложение`
  - after proposal: `Записать оплату`
  - after payment: no primary duplicate; show created client/project links.

### 9. Tasks

File: `crm/js/screens/tasks.js`

Purpose:

- Daily tasks and management control.

API:

- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id/complete`
- `PATCH /api/tasks/:id/reschedule`

Visible functions:

- My/open/overdue task filters.
- Task list.
- Complete with required result.
- Reschedule with required comment and date.
- Create management task for supervisor/owner.
- Open linked entity.

Primary action:

- `Создать задачу` only for supervisor/owner.

No duplicates:

- Complete/reschedule actions live only on task rows or task detail modal.

### 10. Clients

File: `crm/js/screens/clients.js`

Purpose:

- Post-payment client base.

API:

- `GET /api/clients`

Visible functions:

- Client list.
- Search and filters by direction, niche, subscription status, debt.
- Open client detail.

Primary action:

- None. Clients are created after payment.

### 11. Client Detail

File: `crm/js/screens/client-detail.js`

Purpose:

- Central post-sale record.

API:

- `GET /api/clients/:id`
- `GET /api/clients/:id/timeline`
- `POST /api/clients/:id/subscriptions`
- `POST /api/clients/:id/debts`
- `POST /api/support-tickets`
- `POST /api/notes`

Visible functions:

- Client profile.
- Timeline.
- Deals/payments/projects/tickets/subscriptions/debts.
- Create support ticket.
- Create subscription.
- Create debt.
- Notes.

Primary action:

- `Создать обращение` for support-capable roles.
- Finance actions stay in finance/debt blocks, not duplicated in header.

### 12. Implementation

File: `crm/js/screens/implementation.js`

Purpose:

- Implementation project list.

API:

- `GET /api/implementation-projects`

Visible functions:

- Projects by status.
- Filter by responsible, status, direction, niche.
- Open implementation detail.

Primary action:

- None. Projects are created after payment.

### 13. Implementation Detail

File: `crm/js/screens/implementation-detail.js`

Purpose:

- Launch client system.

API:

- `GET /api/implementation-projects/:id`
- `PATCH /api/implementation-projects/:id/status`
- `POST /api/implementation-projects/:id/data-collection`
- `PATCH /api/implementation-projects/:id/checklist/:itemIndex`
- `POST /api/tasks`
- `POST /api/support-tickets`

Visible functions:

- Project summary.
- Selected sections.
- Free support until date.
- Data collection requests.
- Checklist.
- Status transitions.
- Linked tasks and support tickets.

Primary action:

- `Запросить данные` if no open request exists.
- Otherwise no duplicate; checklist actions stay in checklist rows.

### 14. Developer Workbench

File: `crm/js/screens/developer-workbench.js`

Purpose:

- Developer view of processed work only.

API:

- `GET /api/developer/workbench`

Visible functions:

- Assigned management tasks.
- Processed implementation projects.
- Assigned/linked support tickets.
- Counters.

Primary action:

- None. Developer opens assigned work.

No duplicates:

- No raw lead creation, no sales buttons.

### 15. Support

File: `crm/js/screens/support.js`

Purpose:

- Client support and bug/change control.

API:

- `GET /api/support-tickets`
- `POST /api/support-tickets`
- `PATCH /api/support-tickets/:id/assign`
- `PATCH /api/support-tickets/:id/status`
- `PATCH /api/support-tickets/:id/close`
- `POST /api/notes`

Visible functions:

- Ticket list.
- Filter by status, type, responsible, client.
- Create ticket.
- Assign.
- Move status.
- Close with required result.
- Add note.

Primary action:

- `Создать обращение`

No duplicates:

- Client detail may open ticket creation, but support screen owns the general ticket creation button.

### 16. Finance

File: `crm/js/screens/finance.js`

Purpose:

- Payments, subscriptions and debts.

API:

- `GET /api/payments`
- `GET /api/subscriptions`
- `GET /api/debts`
- `POST /api/clients/:id/subscriptions`
- `PATCH /api/subscriptions/:id/renew`
- `POST /api/clients/:id/debts`
- `PATCH /api/debts/:id/paid`

Visible functions:

- Payments table.
- Active subscriptions.
- Debts.
- Create subscription from selected client.
- Renew subscription.
- Create debt.
- Mark debt paid.

Primary action:

- `Создать долг` or `Создать подписку` must be selected by tabs, not shown together as two competing header buttons.

### 17. Analytics

File: `crm/js/screens/analytics.js`

Purpose:

- Supervisor/owner operational summary.

API:

- `GET /api/analytics/summary`

Visible functions:

- Leads by status/niche.
- Deals by stage.
- Open/overdue tasks.
- Paid amount.
- Active subscriptions and monthly recurring revenue.
- Open debts and debt amount.
- Active implementation projects.
- Open support tickets.

Primary action:

- None. Analytics is read-only.

### 18. Materials

File: `crm/js/screens/materials.js`

Purpose:

- Scripts, diagnostics and niche instructions.

API:

- `GET /api/materials`

Visible functions:

- Filter by direction, niche, type.
- Open material.
- Copy script text.

Primary action:

- None. Materials are read-only in MVP.

### 19. Team

File: `crm/js/screens/team.js`

Purpose:

- Users, roles and workload.

API:

- `GET /api/users`
- `GET /api/users/:id`
- `POST /api/users`
- `PATCH /api/users/:id`
- `GET /api/team/workload`
- `POST /api/tasks`

Visible functions:

- Users list.
- Workload cards.
- Create employee.
- Update role/status.
- Assign management task.

Primary action:

- `Добавить сотрудника`

No duplicates:

- Assign task action lives in employee row/detail, not as another header primary.

### 20. Audit

File: `crm/js/screens/audit.js`

Purpose:

- Critical changes history.

API:

- `GET /api/audit-logs`

Visible functions:

- Audit list.
- Filters by action, entity type, date.
- Open details.

Primary action:

- None. Audit is read-only.

### 21. Settings

File: `crm/js/screens/settings.js`

Purpose:

- Constants and custom dictionaries.

API:

- `GET /api/meta`
- `GET /api/settings/dictionaries`
- `POST /api/settings/reference-items`
- `PATCH /api/settings/reference-items/:id`

Visible functions:

- View roles, directions, statuses, packages.
- View AutoTech and EduTech niches.
- Add custom reference item.
- Update custom item status/label/order.

Primary action:

- `Добавить элемент`

No duplicates:

- Each dictionary row can have edit action, but only one global add action.

## Function Coverage Check

Covered by screens:

- Auth and session: Login, App Shell.
- Role menu: App Shell.
- Notifications: App Shell.
- Manager day workflow: Dashboard.
- Lead creation/update: Leads, Lead Detail.
- Diagnostics: Diagnostics.
- Deal stages, amount reason, proposal, payment: Deal Detail.
- Client creation after payment: backend flow shown in Deal Detail and Client Detail.
- Implementation project after payment: Implementation, Implementation Detail.
- Data collection: Implementation Detail.
- Checklist completion: Implementation Detail.
- Developer processed work: Developer Workbench.
- Support tickets: Support, Client Detail, Implementation Detail.
- Tasks completion/reschedule/management: Tasks, Team, Implementation Detail, Deal Detail.
- Notes and communications: Lead Detail, Client Detail, Support.
- Subscriptions and debts: Finance, Client Detail.
- Analytics: Analytics.
- Materials: Materials.
- Team users/workload: Team.
- Audit log: Audit.
- Settings/reference dictionaries: Settings.

Not built in MVP frontend yet:

- Deep WhatsApp integration.
- Telephony.
- Automatic proposal generation.
- AI call analysis.
- Client portal.

These are intentionally deferred by backend documentation.

## Build Order

Strict order:

1. App Shell and Login.
2. Dashboard.
3. Leads.
4. Lead Detail.
5. Diagnostics.
6. Deals.
7. Deal Detail.
8. Tasks.
9. Clients.
10. Client Detail.
11. Implementation.
12. Implementation Detail.
13. Developer Workbench.
14. Support.
15. Finance.
16. Analytics.
17. Materials.
18. Team.
19. Audit.
20. Settings.

Each step is finished only when:

- the screen is in its own file;
- it uses shared API/auth/router helpers;
- it has no duplicate primary actions;
- it handles loading, empty and error states;
- it respects role-based navigation;
- it uses backend list/detail contracts;
- smoke test still passes.
