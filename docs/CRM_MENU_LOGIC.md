# CRM Menu And Navigation Logic

## Main Principle

CRM menu is built around the real operating flow:

`lead -> diagnostics -> deal -> proposal -> payment -> client -> implementation -> support -> subscription`

Every menu item must answer one question: what work is the user doing right now?

## Roles

### Manager

Purpose: process new applications and bring them to payment.

Menu:

- Dashboard
- Leads
- Diagnostics
- Deals
- Tasks
- Clients
- Materials

Hidden or read-only:

- Analytics is hidden.
- Users, audit log and settings are hidden.
- Developer workbench is hidden.
- Finance is hidden unless explicitly allowed later.

### Supervisor

Purpose: control the company, see bottlenecks, assign tasks.

Menu:

- Dashboard
- Leads
- Deals
- Clients
- Tasks
- Implementation
- Support
- Finance
- Analytics
- Team
- Audit Log
- Settings

Special actions:

- Create a task for manager, developer or support.
- Open developer workbench indirectly through employee/task views.
- See all clients, payments, debts and subscriptions.
- See audit history.

### Developer

Purpose: work only with processed requests, implementation projects and tasks from management.

Menu:

- My Tasks
- Processed Requests
- Implementation
- Support Tickets
- Clients
- Materials

Hidden or read-only:

- Raw leads are hidden.
- Sales pipeline is hidden unless linked to an assigned project.
- Payments and analytics are hidden.
- Users and audit log are hidden.

### Owner

Purpose: full access.

Menu:

- Everything supervisor sees.
- System settings and future billing/admin controls.

## Main Menu Structure

The backend exposes role-based menu configuration through:

- `GET /api/navigation`

Frontend must not hardcode menu visibility. It should request navigation after
login and render only the returned menu items.

Authentication endpoints:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `PATCH /api/auth/password`
- `GET /api/me`

Login returns a bearer session token. Local access tokens may be used only for development, but the
normal frontend should use login sessions.

Backend also scopes list and detail data by role:

- manager sees assigned leads, related deals, tasks and clients;
- developer sees assigned tasks, implementation projects, support tickets and linked clients;
- support/implementation roles follow the same delivery-scope model;
- supervisor and owner see all operational data.

List endpoints support shared query parameters:

- `q` or `search` for text search.
- `sort=field` or `sort=-field` for ascending/descending sort.
- `sort=field,-createdAt` for multi-field sort.
- `page=1` and `limit=50` for pagination.
- `status=open`, `stage=proposal`, `responsibleId=user_id` for exact filters.
- `status=open,in_progress` for multi-value filters.
- `createdAtFrom=2026-07-01` and `createdAtTo=2026-07-31` for date ranges.
- `amountFrom=100000` and `amountTo=300000` for numeric ranges.

List responses include:

- `data`: current page items.
- `meta.total`: number of filtered items.
- `meta.page`, `meta.limit`, `meta.pages`.
- `meta.sort`, `meta.filters`, `meta.search`.

### 1. Dashboard

Who sees it:

- Manager
- Supervisor
- Owner

Logic:

- For manager: personal daily workspace.
- For supervisor: company overview.
- For owner: same as supervisor plus high-level financial counters.

Connected API:

- `GET /api/workbench/today`
- `GET /api/analytics/summary`

Connected entities:

- Leads
- Deals
- Tasks
- Payments
- Implementation projects
- Support tickets
- Debts

Primary actions:

- Open overdue task.
- Open new lead.
- Open stalled deal.
- Open client with debt.

### 2. Leads

Who sees it:

- Manager
- Supervisor
- Owner

Logic:

- Leads are raw incoming applications.
- A lead becomes a deal only after diagnostics.
- Lead should not be visible to developer until it becomes a processed client/project.

Connected API:

- `GET /api/leads`
- `GET /api/leads/:id`
- `POST /api/leads`
- `PATCH /api/leads/:id`
- `POST /api/leads/:id/diagnostics`

Connected entities:

- Lead
- Diagnostics
- Tasks
- Communications
- Notes

Primary actions:

- Create lead.
- Update status/contact/pain.
- Add communication.
- Start diagnostics.
- Create follow-up task.

### 3. Diagnostics

Who sees it:

- Manager
- Supervisor
- Owner

Logic:

- Diagnostics captures the client's business format, problems and recommended CRM sections.
- Diagnostics creates a deal.
- This is the bridge between "application" and "sale".

Connected API:

- `POST /api/leads/:id/diagnostics`
- `GET /api/diagnostics`

Connected entities:

- Lead
- Deal
- Recommended sections
- Materials

Primary actions:

- Fill answers.
- Select pain points.
- Generate recommended sections.
- Create deal.

### 4. Deals

Who sees it:

- Manager
- Supervisor
- Owner

Logic:

- Deal is the sales pipeline item.
- Deal amount cannot be changed without a reason.
- Lost deal requires lost reason.
- Proposal and payment are linked to deal.

Connected API:

- `GET /api/deals`
- `GET /api/deals/:id`
- `PATCH /api/deals/:id/stage`
- `PATCH /api/deals/:id/amount`
- `POST /api/deals/:id/proposals`
- `POST /api/deals/:id/payments`

Connected entities:

- Lead
- Deal
- Proposal
- Payment
- Client
- Implementation project
- Tasks
- Audit log

Primary actions:

- Move stage.
- Create proposal.
- Change amount with reason.
- Record payment.
- Mark as lost with reason.

### 5. Tasks

Who sees it:

- Manager
- Supervisor
- Developer
- Owner

Logic:

- Tasks are the daily control layer.
- Some tasks are automatic: check contact, meeting, follow-up, payment, handoff implementation, data collection.
- Supervisor can create manual management tasks.
- Completing a task requires result.
- Rescheduling requires new date and comment.

Connected API:

- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id/complete`
- `PATCH /api/tasks/:id/reschedule`

Connected entities:

- User
- Lead
- Deal
- Client
- Implementation project
- Support ticket

Primary actions:

- Complete task.
- Reschedule task.
- Create management task.
- Open linked entity.

### 6. Clients

Who sees it:

- Manager
- Supervisor
- Developer
- Owner

Logic:

- Client appears after payment.
- Developer sees clients through assigned implementation projects or tickets.
- Client is the central record after sale.

Connected API:

- `GET /api/clients`
- `GET /api/clients/:id`
- `GET /api/clients/:id/timeline`

Connected entities:

- Lead
- Deals
- Payments
- Implementation projects
- Support tickets
- Subscriptions
- Debts
- Notes

Primary actions:

- Open client history.
- Open client timeline.
- Open implementation.
- Open support ticket.
- Create subscription.
- Create debt.

### 7. Implementation

Who sees it:

- Supervisor
- Developer
- Owner

Logic:

- Implementation project is created after payment.
- It contains selected sections, package, checklist and free support date.
- Developer works from this section.
- Checklist item can be marked done with comment.

Connected API:

- `GET /api/implementation-projects`
- `GET /api/implementation-projects/:id`
- `PATCH /api/implementation-projects/:id/status`
- `POST /api/implementation-projects/:id/data-collection`
- `PATCH /api/implementation-projects/:id/checklist/:itemIndex`
- `GET /api/developer/workbench`

Connected entities:

- Client
- Deal
- Tasks
- Data collection request
- Support tickets

Primary actions:

- Open processed request.
- Request client data.
- Mark checklist item done.
- Create task for developer.
- Move project status.

### 8. Developer Workbench

Who sees it:

- Developer
- Supervisor can inspect through team/task views later.
- Owner

Logic:

- This is not raw CRM.
- It shows only work that already passed sales processing: assigned projects, assigned support tickets and management tasks.

Connected API:

- `GET /api/developer/workbench`

Connected entities:

- Tasks
- Implementation projects
- Clients
- Support tickets

Primary actions:

- Open assigned task.
- Open processed request.
- Open project checklist.
- Open support ticket.

### 9. Support

Who sees it:

- Supervisor
- Developer
- Support
- Owner

Logic:

- Support starts after launch or during implementation.
- Paid changes are support tickets with payment status.
- Bugs and questions stay tied to client/project.

Connected API:

- `GET /api/support-tickets`
- `POST /api/support-tickets`
- `PATCH /api/support-tickets/:id/assign`
- `PATCH /api/support-tickets/:id/status`
- `PATCH /api/support-tickets/:id/close`

Connected entities:

- Client
- Implementation project
- Tasks
- Notes

Primary actions:

- Create ticket.
- Assign to developer/support.
- Add note.
- Move ticket status.
- Close ticket with result.

### 10. Finance

Who sees it:

- Supervisor
- Owner

Logic:

- Finance is not raw cashier UI yet.
- It shows payments, subscriptions, renewals and debts.

Connected API:

- `GET /api/payments`
- `GET /api/subscriptions`
- `GET /api/debts`
- `POST /api/clients/:clientId/subscriptions`
- `PATCH /api/subscriptions/:id/renew`
- `POST /api/clients/:clientId/debts`
- `PATCH /api/debts/:id/paid`

Connected entities:

- Client
- Deal
- Payment
- Subscription
- Debt

Primary actions:

- See paid amount.
- See monthly recurring amount.
- Create renewal subscription.
- Create debt.
- Mark debt paid.

### 11. Analytics

Who sees it:

- Supervisor
- Owner

Logic:

- Analytics summarizes operational health.
- Manager should not see full analytics by default.

Connected API:

- `GET /api/analytics/summary`

Connected entities:

- Leads
- Deals
- Tasks
- Payments
- Subscriptions
- Debts
- Implementation projects
- Support tickets

Primary counters:

- Leads by status and niche.
- Deals by stage.
- Open and overdue tasks.
- Paid amount.
- Active subscriptions and monthly recurring revenue.
- Open debts and debt amount.
- Active implementation projects.
- Open support tickets.

### 12. Materials

Who sees it:

- Manager
- Developer
- Supervisor
- Owner

Logic:

- Materials contain scripts, diagnostic questions and niche instructions.
- Manager uses them for sale.
- Developer uses them for implementation context.

Connected API:

- `GET /api/materials`

Connected entities:

- Direction
- Niche
- Lead
- Diagnostics
- Implementation project

Primary actions:

- Open script.
- Open diagnostic questions.
- Open niche checklist.

### 13. Team

Who sees it:

- Supervisor
- Owner

Logic:

- Team is for users, roles and workload.
- For MVP, users are seeded; later this becomes full user management.

Connected API:

- `GET /api/users`
- `GET /api/users/:id`
- `POST /api/users`
- `PATCH /api/users/:id`
- `GET /api/team/workload`
- `POST /api/tasks`

Connected entities:

- Users
- Tasks
- Projects
- Tickets

Primary actions:

- View employee role.
- View employee workload.
- Create employee.
- Update employee role/status.
- Assign task.

### 14. Audit Log

Who sees it:

- Supervisor
- Owner

Logic:

- Audit log protects money and critical workflow changes.
- It records deal amount changes, payments, task completion, rescheduling, subscriptions, debts and implementation checklist changes.

Connected API:

- `GET /api/audit-logs`

Connected entities:

- All critical entities.

Primary actions:

- Inspect who changed what.
- Trace money/status changes.

### 15. Settings

Who sees it:

- Supervisor
- Owner

Logic:

- Settings will later contain packages, sections, roles, statuses and integrations.
- For now most of this lives in constants and seed data.

Connected API:

- `GET /api/meta`
- `GET /api/settings/dictionaries`
- `POST /api/settings/reference-items`
- `PATCH /api/settings/reference-items/:id`

Connected entities:

- Roles
- Permissions
- Packages
- Statuses
- Niches

Managed reference items can extend system dictionaries. For example, a supervisor
can add a new `autotech_niches` item and use that niche when creating leads.

## Role-Based Menu Matrix

| Menu item | Manager | Supervisor | Developer | Owner |
| --- | --- | --- | --- | --- |
| Dashboard | yes | yes | no | yes |
| Leads | yes | yes | no | yes |
| Diagnostics | yes | yes | no | yes |
| Deals | yes | yes | no | yes |
| Tasks | yes | yes | yes | yes |
| Clients | yes | yes | limited | yes |
| Implementation | no | yes | yes | yes |
| Developer Workbench | no | inspect later | yes | yes |
| Support | no | yes | yes | yes |
| Finance | no | yes | no | yes |
| Analytics | no | yes | no | yes |
| Materials | yes | yes | yes | yes |
| Team | no | yes | no | yes |
| Audit Log | no | yes | no | yes |
| Settings | no | yes | no | yes |

## Entity Transitions

## Notifications

Notification endpoints:

- `GET /api/notifications`
- `PATCH /api/notifications/:id/read`
- `PATCH /api/notifications/read-all`

Notifications are created for:

- assigned tasks;
- support ticket assignment;
- support ticket closing;
- new client debt;
- implementation launch into support.

Each notification has recipient, type, title, body, linked entity and read status.

## Client Timeline

Client timeline endpoint:

- `GET /api/clients/:id/timeline`

Timeline combines:

- client creation;
- deals;
- payments;
- tasks;
- communications;
- implementation projects;
- support tickets;
- subscriptions;
- debts;
- notes;
- audit events.

### Lead To Client

1. Manager creates lead.
2. System creates contact-check task.
3. Manager logs communications.
4. Manager runs diagnostics.
5. System creates deal.
6. Manager creates proposal.
7. Manager records payment.
8. System creates client.
9. System creates implementation project.
10. System creates handoff task for developer.

### Implementation To Support

1. Developer opens processed request.
2. Developer creates data collection request.
3. Developer marks checklist items done.
4. Project moves through data collection, configuration, testing, training, launch and support statuses.
5. After launch, support tickets and subscription control become active.

### Subscription And Debt

1. Supervisor/owner creates subscription for client.
2. System creates renewal reminder task.
3. Subscription is renewed monthly.
4. If payment is missed, debt is created.
5. Client subscription status becomes overdue.
6. When debt is paid, client returns to active if no other open debt exists.

## Frontend Routing Proposal

These are logical routes for the future UI:

- `/dashboard`
- `/leads`
- `/leads/:id`
- `/diagnostics/:leadId`
- `/deals`
- `/deals/:id`
- `/tasks`
- `/clients`
- `/clients/:id`
- `/implementation`
- `/implementation/:id`
- `/developer`
- `/support`
- `/finance`
- `/analytics`
- `/materials`
- `/team`
- `/audit`
- `/settings`

## MVP Menu Priority

Build in this order:

1. Dashboard
2. Leads
3. Deals
4. Tasks
5. Clients
6. Implementation
7. Developer Workbench
8. Finance
9. Support
10. Analytics
11. Materials
12. Team
13. Audit Log
14. Settings
