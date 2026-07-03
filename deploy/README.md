# EduDev CRM Deploy

Production layout:

```text
/opt/edudev-crm
  backend/
  crm/
```

1. Install runtime:

```bash
sudo apt update
sudo apt install -y nodejs npm nginx postgresql postgresql-contrib certbot python3-certbot-nginx
```

2. Create Linux user:

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin edudev
sudo mkdir -p /opt/edudev-crm
sudo chown -R edudev:edudev /opt/edudev-crm
```

3. Copy project files to `/opt/edudev-crm`, then configure backend:

```bash
cd /opt/edudev-crm/backend
cp .env.production.example .env
nano .env
npm ci
npm run prisma:generate
npm run prisma:push
npm run bootstrap:admin
npm prune --omit=dev
```

4. Configure Postgres:

```bash
sudo -u postgres psql
```

```sql
CREATE USER edudev WITH PASSWORD 'CHANGE_STRONG_DB_PASSWORD';
CREATE DATABASE edudev_crm OWNER edudev;
\q
```

The password must match `DATABASE_URL` in `/opt/edudev-crm/backend/.env`.

5. Enable backend service:

```bash
sudo cp /opt/edudev-crm/deploy/edudev-crm.service /etc/systemd/system/edudev-crm.service
sudo systemctl daemon-reload
sudo systemctl enable --now edudev-crm
sudo systemctl status edudev-crm
```

6. Enable nginx:

```bash
sudo cp /opt/edudev-crm/deploy/nginx-edudev-crm.conf /etc/nginx/sites-available/edudev-crm
sudo ln -s /etc/nginx/sites-available/edudev-crm /etc/nginx/sites-enabled/edudev-crm
sudo nginx -t
sudo systemctl reload nginx
```

Replace `your-domain.kz` in nginx config before reload.

7. Issue SSL:

```bash
sudo certbot --nginx -d your-domain.kz -d www.your-domain.kz
```

8. Check:

```bash
curl https://your-domain.kz/health
```

The CRM frontend calls the backend through the same domain using `/api/*`.
