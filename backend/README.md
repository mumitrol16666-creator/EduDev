# EduDev CRM Backend

MVP backend for the internal EduDev / Yedu CRM.

It models the main operating chain:

`lead -> diagnostics -> deal -> proposal -> payment -> implementation project -> support`

Run:

```bash
npm run seed
npm start
```

Smoke test:

```bash
npm run smoke
```

Frontend API contract:

```text
../docs/CRM_API_CONTRACTS.md
```

Storage:

```bash
# local JSON runtime only for quick development, not production
CRM_STORE=json npm start

# Prisma/Postgres runtime after DATABASE_URL is configured and schema is pushed
CRM_STORE=prisma npm start
```

The default implementation uses a local JSON store in `backend/data/db.json`.
The service layer is async and can run through Prisma as soon as a Postgres
database is available.

Prisma helpers:

```bash
npm run prisma:validate
npm run prisma:generate
npm run prisma:push
```

For local Postgres, copy `.env.example` to `.env`, then start the provided
`docker-compose.postgres.yml` service before running `prisma:push`.
