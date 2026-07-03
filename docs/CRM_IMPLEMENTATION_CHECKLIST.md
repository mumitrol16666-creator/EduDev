# EduDev / Yedu CRM Implementation Checklist

Source: `/Users/vladislav/Documents/Документация_CRM_Edudev_Yedu_внутренняя_операционная_система.docx`

## Core Principle

- [x] CRM is treated as an operating system, not a lead table.
- [x] Main chain exists: lead -> diagnostics -> deal -> proposal -> payment -> implementation -> support.
- [x] AutoTech is the first active industry profile.
- [x] EduTech profile is modeled after AutoTech.
- [ ] Persistent database runtime is moved from JSON store to Postgres/Prisma.
- [x] Prisma schema is scaffolded for the CRM domain.
- [x] Store layer can switch between JSON and Prisma via `CRM_STORE`.
- [x] Bearer-token authentication and role permissions are enforced at API level.
- [x] Login/password sessions are implemented.

## First Version Requirements

- [x] Roles are defined.
- [x] Manager, supervisor and developer roles are modeled.
- [x] Developer workspace shows processed client requests and assigned management tasks.
- [x] Team users can be created/updated by supervisor or owner.
- [x] Team workload API is implemented.
- [x] User notifications are implemented.
- [x] Client timeline API is implemented.
- [x] Role-based data scoping is enforced for list and detail APIs.
- [x] Menu structure and navigation logic are documented.
- [x] Role-based navigation API is implemented.
- [x] Shared list filtering, search, sorting and pagination are implemented.
- [x] Settings dictionaries and custom reference items are implemented.
- [x] Leads are implemented.
- [x] Detail APIs for leads, deals, clients and implementation projects are implemented.
- [x] Clients are created after payment.
- [x] Sales pipeline stages are implemented.
- [x] Deals and deal amounts are implemented.
- [x] Tasks and reminders are created automatically.
- [x] Diagnostics creates a deal and recommended sections.
- [x] Proposals are linked to deals.
- [x] Payments are linked to deals and clients.
- [x] Implementation projects are created after payment.
- [x] Implementation status transitions are implemented.
- [x] Basic support tickets are implemented.
- [x] Support ticket assignment, status changes and closing are implemented.
- [x] Audit log is written for critical actions.
- [x] Notes and pain/context are implemented at backend MVP level.
- [x] Communications history is implemented at backend MVP level.
- [x] Materials and scripts by niche are seeded at backend MVP level.
- [x] Subscriptions, renewals, debts are implemented.
- [x] Simple analytics summary API is implemented.
- [x] Demo snapshot API is implemented.
- [x] Frontend API contracts are documented.
- [x] Strict frontend screen plan is documented.
- [x] CRM App Shell and Login screen are scaffolded as separate frontend files.
- [x] CRM Dashboard screen is implemented as a separate frontend file.
- [x] CRM Leads screen is implemented as a separate frontend file.
- [x] CRM Lead Detail screen is implemented as a separate frontend file.
- [x] CRM Diagnostics screen is implemented as a separate frontend file.
- [x] CRM Deals screen is implemented as a separate frontend file.
- [x] CRM Deal Detail screen is implemented as a separate frontend file.
- [x] CRM Tasks screen is implemented as a separate frontend file.
- [x] CRM Clients screen is implemented as a separate frontend file.
- [x] CRM Client Detail screen is implemented as a separate frontend file.
- [x] CRM Implementation screen is implemented as a separate frontend file.
- [x] CRM Implementation Detail screen is implemented as a separate frontend file.
- [x] CRM Developer Workbench screen is implemented as a separate frontend file.
- [x] CRM Support screen is implemented as a separate frontend file.
- [x] CRM Finance screen is implemented as a separate frontend file.
- [x] CRM Analytics screen is implemented as a separate frontend file.
- [x] CRM Materials screen is implemented as a separate frontend file.
- [x] CRM Team screen is implemented as a separate frontend file.
- [x] CRM Audit screen is implemented as a separate frontend file.
- [x] CRM Settings screen is implemented as a separate frontend file.

## Safety Rules From Documentation

- [x] Payment must be linked to deal and client.
- [x] Implementation is created only after payment in normal flow.
- [x] Critical actions create audit log entries.
- [x] Closing deal as lost requires lost reason.
- [x] Completing task requires a result.
- [x] Rescheduling task requires comment and new date.
- [x] Manager cannot change deal amount without reason.
- [x] No physical delete for leads, deals, payments, tickets.
- [x] Demo snapshot hides real names, contacts, prices and internal notes.

## Manager Day Workflow

- [x] API for manager “Today” workspace.
- [x] Overdue tasks list.
- [x] New assigned leads list.
- [x] Deals without next action list.
- [x] Stalled deals list.
- [x] Basic activity counters for manager workspace.

## Implementation Checklists

- [x] AutoTech base checklist.
- [x] Oil change checklist additions.
- [x] Tire service checklist additions.
- [x] Repair shop checklist additions.
- [x] Car wash checklist additions.
- [x] EduTech checklist.
- [x] Client data collection objects.
- [x] Checklist item completion API.

## Deferred By Documentation

- [ ] Deep WhatsApp integration.
- [ ] Telephony.
- [ ] Automatic proposal generation.
- [ ] AI call analysis.
- [ ] Client portal.

## Current Dev Tokens

Seeded local development tokens:

- `dev-owner-token`
- `dev-supervisor-token`
- `dev-manager-token`
- `dev-developer-token`
- `dev-implementation-token`
- `dev-support-token`

These are for local MVP development only and must be replaced by password/session auth before production.

Seeded local password for dev users:

- production password is set through `CRM_ADMIN_PASSWORD`; local test passwords must not be reused in production

This password is for local MVP development only and must be changed in production.
