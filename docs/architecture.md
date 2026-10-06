# Restaurant SaaS Architecture

## Scope Discipline

This MVP is a multi-tenant restaurant ordering SaaS. The first implementation pass is Phase 1 only: project initialization, authentication, PostgreSQL/Prisma, tenant model, roles, seed data, and documentation foundations.

Explicitly excluded from the MVP scope: cancellation, split bill, delivery, takeaway, booking, inventory, promotions, loyalty, attendance, payroll, bank transaction sync, and online payment gateway.

## Core Architecture

- Frontend: Next.js App Router, TypeScript, Tailwind CSS.
- Backend: Next.js route handlers and server-side services.
- Database: PostgreSQL through Prisma.
- Authentication: Auth.js/NextAuth credentials provider for staff/admin accounts.
- Realtime: designed for a later Supabase Realtime or WebSocket adapter; events are documented but not implemented in Phase 1.
- Storage: designed around URL fields for Supabase Storage or Cloudflare R2; upload flows arrive in later phases.

## Tenant Boundary

Every restaurant-owned model has `restaurantId`. Server services derive restaurant access from the authenticated user membership and route slug. Client-supplied `restaurantId` is never trusted for authorization.

Tenant access rules:

- Platform admins can access `/platform` and cross-restaurant metadata.
- Restaurant users can only access restaurants with an active `RestaurantUser` membership.
- Restaurant routes resolve the tenant from `slug`, then verify membership and role on the server.
- Public customer QR routes will resolve tenant/table by `slug + table + qrToken`, not by table name alone.

## Assumptions

- Phase 1 uses credentials login so the app can run locally without Supabase setup.
- Passwords are only for staff/admin accounts. Customers never log in.
- Database timestamps are stored in UTC. Restaurant display timezone defaults to `Asia/Ho_Chi_Minh`.
- Money is stored as integer VND minor display units, for example `159000`.
- Product English names are optional and will fall back to Vietnamese names in UI phases.
- Auth.js can later be swapped for Supabase Auth because authorization is isolated in service helpers.

## Folder Structure

```text
src/
  app/
    (auth)/login/
    platform/
    [rSlug]/admin/
    api/auth/[...nextauth]/
  components/
    app-shell/
    ui/
  config/
  lib/
    auth/
    db/
    i18n/
    rbac/
    tenant/
  server/
    services/
  types/
prisma/
  schema.prisma
  seed.ts
docs/
  architecture.md
  permissions.md
  realtime-events.md
  routes.md
  erd.md
```

## Phase Plan

1. Phase 1: initialize project, auth, database, Prisma, multi-tenant restaurant and role model, seed.
2. Phase 2: categories, products, options, areas, tables, QR admin flows.
3. Phase 3: customer QR flow, required customer name, language, menu, cart.
4. Phase 4: dining sessions, orders, order item snapshots.
5. Phase 5: staff dashboard, kitchen display, realtime notifications, sound unlock.
6. Phase 6: service requests, payment requests, cash and QR confirmation.
7. Phase 7: bill, print layouts, reports.
8. Phase 8: platform admin plans, polish, testing.
