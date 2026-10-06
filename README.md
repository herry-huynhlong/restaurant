# Restaurant SaaS

Multi-tenant restaurant ordering SaaS built with Next.js, TypeScript, Tailwind CSS, Prisma, PostgreSQL, and Auth.js.

This repository is currently implemented through Phase 1:

- Project initialization.
- Auth.js credentials login for staff/admin users.
- PostgreSQL Prisma schema for the full MVP domain.
- Server-side tenant and role guards.
- Platform admin dashboard shell.
- Restaurant admin dashboard shell.
- Demo seed data for `Quán ABC`.

Later phases will add menu management, QR flows, customer ordering, realtime staff/kitchen notifications, payments, bills, reports, and platform subscription polish.

## Local Setup

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Update `DATABASE_URL` to point at a PostgreSQL database.

3. Install dependencies:

```bash
pnpm install
```

4. Generate Prisma client and create the database schema:

```bash
pnpm prisma:generate
pnpm prisma:migrate --name init
```

5. Seed demo data:

```bash
pnpm prisma:seed
```

6. Start the app:

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Docker Deploy

Copy the Docker environment file:

```bash
cp .env.docker.example .env
```

Edit `.env`, then run:

```bash
docker compose up -d --build postgres
docker compose run --rm app pnpm prisma:migrate --name init
docker compose run --rm app pnpm prisma:seed
docker compose up -d --build app
```

The app listens on `127.0.0.1:3000`, ready for Nginx reverse proxy.

## Demo Accounts

All demo accounts use password:

```text
Password123!
```

| Role | Email |
| --- | --- |
| Platform admin | `platform@demo.local` |
| Owner | `owner@abc.local` |
| Waiter | `waiter@abc.local` |
| Kitchen | `kitchen@abc.local` |
| Cashier | `cashier@abc.local` |

## Important Routes

- `/login`
- `/platform`
- `/abc/admin`

Full route plan: [docs/routes.md](docs/routes.md).

## Documentation

- Architecture: [docs/architecture.md](docs/architecture.md)
- Permission matrix: [docs/permissions.md](docs/permissions.md)
- Realtime events: [docs/realtime-events.md](docs/realtime-events.md)
- ERD: [docs/erd.md](docs/erd.md)

## Tenant Security Rules

- Restaurant-owned data is scoped by `restaurantId`.
- Restaurant route access is derived from route slug plus authenticated membership.
- Client-provided `restaurantId` is never trusted for authorization.
- Platform access requires `PLATFORM_ADMIN`.
- No cancellation and no split bill states exist in the order model.

## Deploy Notes

Use Vercel for the Next.js app and a production PostgreSQL database. Set these environment variables in the hosting provider:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`

Run Prisma migrations during deployment setup. Use managed object storage such as Supabase Storage or Cloudflare R2 for uploads in later phases.

## QR Table Guidance

Tables store a random, hard-to-guess `qrToken`. Future QR URLs should use:

```text
https://domain.com/abc/welcome?table=A05&token=xxxxx
```

The server must validate `slug + table + token + table active` before opening or attaching a customer dining session.

## Phase 1 Verification

Run these checks after installing dependencies:

```bash
pnpm typecheck
pnpm lint
```
