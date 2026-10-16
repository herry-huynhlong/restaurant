# Bản đồ file

Tài liệu này chỉ liệt kê source/config được duy trì thủ công. `.next`, `node_modules`, backup, dump, upload thực tế và file sinh tự động không liệt kê riêng.

## Root và cấu hình

| File | Công dụng |
|---|---|
| `package.json` | Script build/test/Prisma/worker và dependency. |
| `pnpm-lock.yaml`, `pnpm-workspace.yaml` | Khóa dependency và workspace pnpm. |
| `Dockerfile` | Image Node 22 + PostgreSQL client 16; build Next.js. |
| `docker-compose.yml` | PostgreSQL, app, maintenance-worker và volume. |
| `middleware.ts` | Auth middleware cho platform và route vai trò. |
| `next.config.mjs` | Server Actions limit/origin và security headers. |
| `tailwind.config.ts`, `postcss.config.mjs` | Pipeline CSS/Tailwind. |
| `tsconfig.json`, `next-env.d.ts` | TypeScript/Next type config. |
| `.env.example`, `.env.docker.example` | Mẫu biến môi trường không chứa secret. |

## Prisma

| File | Công dụng |
|---|---|
| `prisma/schema.prisma` | Enum, model, quan hệ, index và unique constraint. |
| `prisma/seed.ts` | Seed dữ liệu khởi tạo/demo; phải review trước production. |
| `prisma/migrations/*/migration.sql` | Lịch sử schema từ init, platform, push, invoice, staff device, order queue, soft delete, storage/backup, pricing, TRAIN, Sub Admin đến tenant restore. Không sửa migration đã chạy. |
| `prisma/migrations/migration_lock.toml` | Khóa provider migration PostgreSQL. |

## App shell và route chung

| File | Công dụng |
|---|---|
| `src/app/layout.tsx`, `globals.css` | Root layout, providers, service worker và style toàn cục. |
| `src/app/page.tsx` | Entry root. |
| `src/app/error.tsx` | Error boundary thân thiện. |
| `src/app/(auth)/login/page.tsx` | Login Platform Admin. |
| `src/app/post-login/page.tsx` | Điều hướng sau login theo quyền. |
| `src/app/select-restaurant/page.tsx` | Chọn tenant khi user có nhiều membership. |
| `src/app/unauthorized/page.tsx` | Trang từ chối quyền. |
| `src/app/api/auth/[...nextauth]/route.ts` | Auth.js handler. |

## Route khách và tenant

| File | Công dụng |
|---|---|
| `src/app/[rSlug]/layout.tsx`, `page.tsx` | Metadata/layout tenant và entry theo slug. |
| `welcome/page.tsx`, `welcome/actions.ts` | Xác minh QR, nhập tên, khóa bàn và mở/tái sử dụng phiên. |
| `menu/page.tsx`, `cart/page.tsx` | Menu và giỏ khách. |
| `orders/page.tsx`, `payment/page.tsx` | Món đã gọi và yêu cầu thanh toán. |
| `login/page.tsx`, `locked/page.tsx`, `device-setup/page.tsx` | Login tenant, trạng thái khóa và đăng ký thiết bị. |
| `manifest.webmanifest/route.ts` | Manifest PWA khách. |
| `icons/[icon]/route.ts` | Icon tenant 192/512 từ logo. |

## Quản trị cửa hàng

| File | Công dụng |
|---|---|
| `admin/layout.tsx`, `admin/page.tsx` | PWA metadata và dashboard tổng quan. |
| `admin/actions.ts` | Server Actions area/table/QR/menu/settings/staff/device/notification. |
| `admin/menu/page.tsx`, `categories/page.tsx` | Quản lý món và danh mục. |
| `admin/tables/page.tsx` | Khu vực, bàn, QR và thao tác nhanh. |
| `admin/orders/page.tsx` | Order theo bàn và yêu cầu khách. |
| `admin/staff/page.tsx` | Tài khoản nhân viên, QR đăng nhập, thiết bị và ca. |
| `admin/reports/page.tsx`, `top-items/page.tsx` | Doanh thu, giao dịch và top món. |
| `admin/settings/page.tsx` | Thông tin quán, invoice, thuế, notification và mật khẩu. |
| `admin/subscription/page.tsx`, `subscription/actions.ts` | Giá/gói và request đăng ký. |
| `admin/[section]/page.tsx` | Route section tương thích/chuyển tiếp có guard feature. |
| `admin/manifest.webmanifest/route.ts` | Manifest PWA quản lý. |

## Workspace nhân viên

| File | Công dụng |
|---|---|
| `staff/layout.tsx`, `staff/page.tsx`, `staff/manifest.webmanifest/route.ts` | Phục vụ, bàn/order/yêu cầu và PWA. |
| `kitchen/layout.tsx`, `kitchen/page.tsx`, `kitchen/manifest.webmanifest/route.ts` | Hàng đợi bếp và PWA. |
| `cashier/layout.tsx`, `cashier/page.tsx`, `cashier/manifest.webmanifest/route.ts` | Thanh toán/bill và PWA. |
| `ops/actions.ts` | Claim/ready/served/request/payment actions dùng chung. |

## Platform Admin

| File | Công dụng |
|---|---|
| `platform/page.tsx` | Tổng quan SaaS. |
| `platform/restaurants/page.tsx` | Danh sách, filter request và lifecycle. |
| `platform/restaurants/actions.ts` | Tạo/sửa/khóa/xóa/restore/gói/chủ quán/request. |
| `platform/restaurants/new/page.tsx` | Tạo tenant và owner. |
| `platform/restaurants/[restaurantId]/page.tsx` | Chi tiết SaaS, stats, owner, audit, danger zone. |
| `platform/restaurants/[restaurantId]/edit/page.tsx` | Sửa tenant theo quyền Platform. |
| `platform/owners/page.tsx` | Quản lý tài khoản chủ quán. |
| `platform/admins/page.tsx`, `admins/actions.ts` | Platform Sub Admin. |
| `platform/plans/page.tsx`, `plans/actions.ts` | Ma trận quyền hiển thị và bảng giá. |
| `platform/activity/page.tsx` | Audit log hệ thống. |
| `platform/settings/page.tsx`, `settings/actions.ts` | Đổi mật khẩu Platform Owner. |
| `platform/storage/page.tsx`, `storage/actions.ts` | Dung lượng, policy, backup/restore/cleanup. |

## Route Handlers nghiệp vụ

| File | Công dụng |
|---|---|
| `api/platform/storage/metrics/route.ts` | Host metrics và thống kê backup. |
| `api/platform/subscription-requests/pending-count/route.ts` | Badge request chờ. |
| `api/restaurants/[rSlug]/admin/menu/route.ts` | CRUD menu đơn giản + upload ảnh. |
| `admin/orders/requests/[requestId]/route.ts` | Hoàn tất yêu cầu khách. |
| `admin/orders/state/route.ts` | Snapshot order hoạt động. |
| `admin/overview/state/route.ts` | Snapshot KPI. |
| `admin/tables/state/route.ts` | Snapshot bàn. |
| `admin/tables/[tableId]/order/route.ts` | Nhân viên thêm món idempotent. |
| `admin/tables/[tableId]/regenerate-qr/route.ts` | Đổi QR tenant-scoped. |
| `customer/order/route.ts`, `customer/bill/route.ts` | Tạo order và xem bill khách. |
| `customer/service-request/route.ts` | Yêu cầu phục vụ/thanh toán. |
| `device-session/route.ts`, `shift/route.ts` | Thiết bị và ca nhân viên. |
| `notifications/route.ts`, `state/route.ts`, `stream/route.ts` | Inbox, polling state và SSE. |
| `ops/pay-session/route.ts` | Xác nhận thanh toán qua JSON API. |
| `push/subscribe/route.ts`, `push/test/route.ts` | Quản lý subscription và push thử. |
| `reports/payments/route.ts`, `[paymentId]/route.ts` | Lịch sử và chi tiết bill. |
| `api/uploads/[...path]/route.ts` | Đọc ảnh upload theo whitelist/path containment. |

## Components

| Nhóm/file | Công dụng |
|---|---|
| `components/app-shell/platform-shell.tsx`, `platform-mobile-menu.tsx` | Shell/sidebar responsive Platform. |
| `restaurant-admin-shell.tsx`, `admin-mobile-menu.tsx`, `app-header.tsx` | Shell quản trị tenant. |
| `customer-shell.tsx` | Khung giao diện khách. |
| `login-form.tsx`, `restaurant-login-form.tsx`, `session-provider.tsx`, `sign-out-button.tsx` | Auth UI/client provider. |
| `install-app-button.tsx`, `register-service-worker.tsx` | PWA install và đăng ký SW. |
| `notification-bell.tsx`, `notification-enable-button.tsx`, `notification-audio-unlocker.tsx`, `push-notification-button.tsx`, `sound-unlock-button.tsx` | Notification/push/audio UX. |
| `staff-device-setup-form.tsx`, `staff-shift-controls.tsx`, `ops-live-refresher.tsx` | Thiết bị, ca và refresh vận hành. |
| `components/admin/dashboard-live-overview.tsx` | KPI/biểu đồ/order dashboard. |
| `orders-by-table-board.tsx`, `tables-live-panel.tsx` | Board order/bàn dùng chung admin/staff. |
| `simple-menu-manager.tsx`, `settings-image-upload.tsx`, `qr-card.tsx` | Menu, upload settings và QR print. |
| `staff-page-interactions.tsx` | Filter, modal/form UX trang nhân sự. |
| `payment-report-table.tsx`, `reports-auto-refresh.tsx` | Báo cáo/bill history. |
| `subscription-pricing-client.tsx` | UI chọn gói/gửi request. |
| `feedback-banner.tsx` | Thông báo success/error đã lọc. |
| `components/billing/invoice-print-button.tsx` | Mẫu bill và CSS print 58/80 mm. |
| `components/customer/customer-header-nav.tsx`, `customer-menu-client.tsx`, `customer-bill-client.tsx` | Navigation/menu/bill khách. |
| `components/ops/food-item-display-card.tsx` | Card món ảnh dùng Staff/Kitchen. |
| `components/staff/staff-workspace-tabs.tsx` | Điều hướng 4 mục Staff. |
| `components/cashier/cashier-workspace.tsx` | Danh sách phiên bàn, chi tiết Order/tạm tính, hàng đợi yêu cầu và xác nhận thanh toán an toàn cho Thu ngân. |
| `components/platform/backup-history-card.tsx`, `restaurant-backup-table.tsx`, `backup-job-refresher.tsx`, `restore-job-refresher.tsx` | Backup/restore UI. |
| `server-resource-monitor.tsx` | Poll host metrics. |
| `business-plan-fields.tsx`, `restaurant-form-controls.tsx`, `restaurant-row-actions.tsx` | Form/lifecycle tenant. |
| `owners-manager.tsx`, `pending-subscription-badge.tsx`, `subscription-requests-dialog.tsx` | Owner và request gói. |
| `components/ui/*` | Field, stat, empty state, pending/confirm submit và form effects dùng chung. |

## Lib

| File/nhóm | Công dụng |
|---|---|
| `lib/auth/options.ts`, `types/next-auth.d.ts` | Auth.js Credentials/JWT và type mở rộng. |
| `lib/rbac/guards.ts`, `rbac/roles.ts` | Platform/tenant/role/feature guard. |
| `lib/db/prisma.ts` | Prisma singleton và chặn write trong maintenance. |
| `lib/plan/features.ts` | Feature matrix BASIC/PRO/TRAIN. |
| `lib/customer-session.ts`, `customer-name.ts` | Cookie khách ký HMAC và chuẩn hóa tên. |
| `lib/tenant/restaurant.ts` | Resolve tenant/trạng thái subscription. |
| `lib/maintenance-mode.ts`, `restaurant-maintenance.ts` | Lock toàn hệ thống hoặc tenant. |
| `lib/routes.ts` | URL builder duy nhất. |
| `lib/safe-user-message.ts`, `debug-log.ts` | Lọc lỗi UI/API và debug redact. |
| `lib/money.ts`, `period.ts`, `payment-method.ts` | Tiền, kỳ báo cáo/timezone, nhãn thanh toán. |
| `lib/brand.ts`, `business-type.ts`, `restaurant-role-labels.ts`, `username.ts` | Nhãn/normalize domain. |
| `lib/qr.ts`, `upload-url.ts`, `push.ts`, `staff-device.ts`, `client-notification-sound.ts` | QR/upload/push/device/audio helper. |
| `lib/i18n/messages.ts` | Nội dung VI/EN phía khách. |

## Services

| File | Công dụng |
|---|---|
| `auth-redirect-service.ts` | Home route theo platform/membership. |
| `customer-context.ts`, `customer-page-context.ts` | Xác minh cookie, tenant, bàn và phiên khách. |
| `dining-session-service.ts` | Định nghĩa trạng thái phiên active. |
| `billing-service.ts`, `payment-service.ts`, `payment-detail-service.ts` | Tính bill, xác nhận idempotent và đọc bill lịch sử. |
| `restaurant-service.ts`, `table-state-service.ts`, `order-board-service.ts` | Dashboard/bàn/order query. |
| `reporting-service.ts`, `top-items-service.ts` | Báo cáo doanh thu/top món. |
| `image-upload-service.ts`, `simple-menu-service.ts` | Tối ưu ảnh và menu loại đơn giản. |
| `notification-service.ts`, `notification-event-service.ts`, `web-push-service.ts` | DB notification, SSE signal, Web Push. |
| `staff-device-session-service.ts` | Device cookie/session guard. |
| `subscription-service.ts` | Giá, request, confirm/reject và thời hạn. |
| `platform-service.ts`, `platform-resource-service.ts`, `platform-storage-service.ts` | Dashboard Platform, metrics và backup readiness. |
| `platform-restore-runtime.ts` | Job/lock restore toàn hệ thống trên filesystem. |
| `restaurant-backup-service.ts` | Snapshot/verify/restore tenant và rollback. |
| `tenant-pwa-service.ts` | Branding/manifest PWA động. |

## Scripts và public

| File | Công dụng |
|---|---|
| `scripts/platform-maintenance-worker.ts` | Scheduler/claim backup, retention, cleanup, heartbeat. |
| `scripts/platform-restore-worker.ts` | Verify/staging/pre-backup/restore/rollback toàn hệ thống. |
| `scripts/collect-host-metrics.sh` | Đọc disk/RAM/swap host và ghi JSON atomic. |
| `scripts/*-checks.ts` | Regression tĩnh cho hardening, backup, form UX, tên khách và bill. |
| `public/sw.js` | Service worker push/click; không cache dữ liệu nghiệp vụ. |
| `public/icons/*`, `public/favicon.png` | Asset fallback PWA. |
| `public/sounds/notification.wav` | Âm thanh notification trong app. |

## Docs

README là mục lục; `architecture`, `FEATURES`, `API`, `DATABASE`, `CONFIGURATION`, `DEPLOYMENT`, `SECURITY`, `MAINTENANCE`, `AUDIT_REPORT` mô tả hệ thống; hai tài liệu BACKUP mô tả vận hành dữ liệu; `UX_WRITING_GUIDELINES` chuẩn hóa nội dung; `realtime-events` ghi event notification.
