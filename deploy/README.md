# EduDev Production Deploy

This repository is deployed as a static landing site, static CRM frontend, and Node.js backend:

```text
/var/www/edudev
  index.html, styles.css, script.js, assets/  # edudev.kz
  crm/                                      # crm.edudev.kz
  docs/                                     # docs.edudev.kz
  backend/                                  # PM2 app on 127.0.0.1:4100
  deploy/
```

## Required Server Packages

```bash
sudo apt update
sudo apt install -y git curl nginx certbot python3-certbot-nginx docker.io
sudo npm install -g pm2
```

Use a non-root deploy user:

```bash
sudo adduser deploy
sudo usermod -aG docker deploy
sudo mkdir -p /var/www/edudev /var/log/edudev /var/backups/edudev
sudo chown -R deploy:www-data /var/www/edudev /var/log/edudev
sudo chmod 750 /var/www/edudev /var/log/edudev
```

## Environment

Create `/var/www/edudev/backend/.env` from `backend/.env.production.example`.

Required values:

```bash
DATABASE_URL="postgresql://edudev:CHANGE_STRONG_DB_PASSWORD@127.0.0.1:5432/edudev_crm?schema=public"
CRM_STORE=prisma
NODE_ENV=production
HOST=127.0.0.1
PORT=4100
CORS_ORIGIN="https://crm.edudev.kz,https://edudev.kz,https://www.edudev.kz"
```

`HOST=127.0.0.1` is recommended because Nginx is the public entrypoint.

## First Install

```bash
cd /var/www/edudev
git remote -v
npm ci --prefix backend
npm run prisma:generate --prefix backend
npm run prisma:migrate:deploy --prefix backend
npm run bootstrap:admin --prefix backend
pm2 start deploy/ecosystem.config.cjs --env production
pm2 save
```

If the production database already has tables created with `prisma db push`, baseline the initial migration once before the first migration-based deploy:

```bash
CONFIRM_BASELINE=true ./deploy/baseline-prisma-migration.sh
```

Do this only after confirming the existing database schema matches `backend/prisma/schema.prisma`.

Check readiness:

```bash
curl -fsS http://127.0.0.1:4100/ready
```

## Nginx

Install the vhost:

```bash
sudo cp /var/www/edudev/deploy/nginx-edudev.conf /etc/nginx/sites-available/edudev
sudo ln -sf /etc/nginx/sites-available/edudev /etc/nginx/sites-enabled/edudev
sudo nginx -t
sudo systemctl reload nginx
```

Issue/renew certificates:

```bash
sudo certbot --nginx \
  -d edudev.kz \
  -d www.edudev.kz \
  -d crm.edudev.kz \
  -d api.edudev.kz \
  -d docs.edudev.kz
```

## Deploy

Run as the deploy user:

```bash
cd /var/www/edudev
./deploy/deploy.sh
```

The deploy script:

- takes a lock to prevent concurrent deploys;
- refuses to deploy over modified tracked files;
- fetches and hard-resets to `origin/main`;
- installs dependencies with `npm ci`;
- validates JavaScript and Prisma schema;
- generates Prisma client;
- runs a pre-migration DB backup when `deploy/backup-postgres.sh` is executable;
- applies migrations using `prisma migrate deploy`;
- reloads PM2 with `startOrReload`;
- checks `/ready`;
- attempts code rollback if readiness fails.

Database migrations are not automatically rolled back. If a migration is unsafe, ship a forward-fix migration.

## Backups

Configure a daily Postgres backup:

```bash
sudo crontab -e
```

```cron
15 3 * * * /var/www/edudev/deploy/backup-postgres.sh >> /var/log/edudev/backup.log 2>&1
```

Verify restore regularly:

```bash
gzip -dc /var/backups/edudev/edudev_crm_YYYY-MM-DD_HH-MM-SS.sql.gz | \
  docker exec -i maestro-postgres psql -U edudev -d edudev_crm_restore
```

## Logs

Install logrotate:

```bash
sudo cp /var/www/edudev/deploy/logrotate-edudev /etc/logrotate.d/edudev
sudo logrotate -d /etc/logrotate.d/edudev
```

PM2:

```bash
pm2 logs edudev
pm2 monit
```

## CI/CD

GitHub Actions in `.github/workflows/ci.yml` validates:

- JS syntax;
- Prisma schema;
- Prisma client generation;
- backend smoke test.

Keep production deploy manual or protected by GitHub environments until server secrets and SSH deploy keys are fully locked down.

## Rollback

Code rollback:

```bash
cd /var/www/edudev
git log --oneline -5
git reset --hard <previous_sha>
npm ci --prefix backend
npm run prisma:generate --prefix backend
pm2 startOrReload deploy/ecosystem.config.cjs --env production --update-env
curl -fsS http://127.0.0.1:4100/ready
```

Database rollback is restore-from-backup or forward-fix migration. Do not run destructive migrations without a fresh backup.
