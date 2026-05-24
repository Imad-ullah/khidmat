# KhidmatApp Production Deployment

This checklist must be completed before Step 12 final QA.

## 1. Install And Verify Docker

On Windows, install Docker Desktop:

```powershell
winget install -e --id Docker.DockerDesktop
```

Restart the computer if Docker asks for it, open Docker Desktop once, then verify:

```powershell
docker --version
docker compose version
```

From the repo root, verify the backend image can build:

```powershell
cd D:\data\Khidmat\khidmatapp
docker build -t khidmatapp-backend:local .\backend
```

Verify the production compose file parses:

```powershell
cd D:\data\Khidmat\khidmatapp\infra\docker
Copy-Item .env.example .env
docker compose --env-file .env -f docker-compose.prod.yml config
```

## 2. Domain And DNS

Choose the production API domain, for example:

```text
api.khidmatapp.pk
```

Create a DNS `A` record pointing that domain to the production server IP. If using DigitalOcean App Platform, create the custom domain inside the app and follow the DNS target DigitalOcean gives you.

## 3. Production Services

Use managed production services:

- PostgreSQL: DigitalOcean Managed PostgreSQL or AWS RDS.
- Redis: DigitalOcean Managed Redis or AWS ElastiCache.
- S3-compatible object storage: AWS S3 or DigitalOcean Spaces.
- Sentry: one Node.js project for backend production errors.
- Firebase: one Android app for OTP/Auth and FCM.

Never expose the production database publicly.

## 4. Backend Environment Variables

Set these values in the production host or DigitalOcean App Platform:

```text
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_ACCESS_SECRET=<long random secret>
JWT_REFRESH_SECRET=<long random secret>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
BCRYPT_SALT_ROUNDS=12
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET_NAME=...
AWS_S3_PRIVATE_BUCKET=...
AWS_S3_PUBLIC_BUCKET=...
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
SENTRY_DSN=...
SENTRY_TEST_TOKEN=<long random smoke-test token>
CORS_ORIGIN=https://admin.khidmatapp.pk
FRONTEND_ORIGIN=https://admin.khidmatapp.pk
```

Generate secrets locally:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 5. GitHub Secrets

Add these repository secrets in GitHub:

```text
PRODUCTION_DATABASE_URL
DIGITALOCEAN_ACCESS_TOKEN
DIGITALOCEAN_APP_ID
PRODUCTION_HEALTH_URL
```

`PRODUCTION_HEALTH_URL` should be:

```text
https://api.khidmatapp.pk/api/v1/health
```

## 6. DigitalOcean Deployment

Create a DigitalOcean App Platform app or production server using the backend Docker image:

```text
ghcr.io/<owner>/<repo>-backend:latest
```

Set the production environment variables from Section 4. Push to `main`; GitHub Actions will:

1. run lint,
2. run tests and `npm audit --audit-level=high`,
3. build backend/mobile/admin,
4. run `prisma migrate deploy`,
5. build and push the backend Docker image,
6. trigger a DigitalOcean deployment,
7. call the production health endpoint.

## 7. HTTPS And Nginx Compose Path

If deploying on a VPS with Docker Compose instead of App Platform:

```powershell
cd D:\data\Khidmat\khidmatapp\infra\docker
Copy-Item .env.example .env
notepad .env
docker compose --env-file .env -f docker-compose.prod.yml up -d
```

For the first Let's Encrypt certificate, run:

```powershell
docker compose --env-file .env -f docker-compose.prod.yml run --rm certbot certonly --webroot -w /var/www/certbot -d api.khidmatapp.pk --email admin@khidmatapp.pk --agree-tos --no-eff-email
docker compose --env-file .env -f docker-compose.prod.yml restart nginx
```

## 8. Production Verification

Health check:

```powershell
curl.exe -i https://api.khidmatapp.pk/api/v1/health
```

Expected:

```text
HTTP/2 200
```

Sentry smoke test:

```powershell
curl.exe -i -H "x-sentry-test-token: <SENTRY_TEST_TOKEN>" https://api.khidmatapp.pk/api/v1/sentry-test
```

Expected API response is `500`; expected Sentry result is a new event named:

```text
KhidmatApp Sentry production smoke test
```

## 9. Do Not Proceed To Step 12 Until

- Docker image build is verified.
- Production compose config is verified, or App Platform deployment config is verified.
- GitHub Actions pipeline passes on `main`.
- Production `/api/v1/health` returns `200`.
- Sentry receives the smoke-test error.
