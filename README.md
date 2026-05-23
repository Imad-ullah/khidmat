# KhidmatApp

KhidmatApp is a production-grade, two-sided mobile marketplace for local home services in Pakistan, starting with Mardan, KPK.

Tagline: Apka Bharosa, Hamare Haath.

The platform connects customers with verified local service providers for electrical, plumbing, AC repair, solar installation, mobile repair, carpentry, painting, cleaning, and related home services.

## Monorepo Layout

- `apps/mobile`: Flutter mobile app for customers and providers.
- `apps/admin`: React, Vite, and TailwindCSS admin panel.
- `backend`: Node.js, Express, TypeScript, Prisma API.
- `shared`: Shared TypeScript types and constants.
- `infra`: Docker, Nginx, and CI/CD infrastructure.
- `docs`: Architecture and API documentation.

## Core Stack

- Mobile: Flutter, Riverpod, GoRouter, Dio, Firebase Cloud Messaging.
- Backend: Node.js 20, Express, TypeScript strict mode, Prisma, PostgreSQL, Redis, BullMQ.
- Admin: React, Vite, TailwindCSS, React Query.
- Infrastructure: Docker, Docker Compose, Nginx, GitHub Actions.
