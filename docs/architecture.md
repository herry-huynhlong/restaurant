# Kiến trúc QuánPilot

## Tổng thể

QuánPilot là monolith Next.js App Router chạy trên Node.js. UI, Server Components, Server Actions và Route Handlers nằm trong cùng ứng dụng. PostgreSQL là nguồn dữ liệu chính; Prisma cung cấp truy vấn, transaction và migration. Một process `maintenance-worker` riêng xử lý backup, cleanup và restore để request HTTP không chạy thao tác dài hoặc phá hủy.

```text
Browser/PWA
  -> HTTPS reverse proxy
    -> Next.js app (UI + API + Server Actions)
      -> RBAC/tenant guards
        -> service layer
          -> Prisma -> PostgreSQL 16
      -> uploads volume
      -> Web Push provider

maintenance-worker
  -> PostgreSQL 16 client
  -> backups/runtime/uploads volumes
  -> PostgreSQL 16

host collector -> host-metrics/metrics.json -> app -> Platform Storage UI
```

## Các lớp

- `src/app`: route, layout, page, Route Handler và Server Action.
- `src/components`: component client/server theo miền nghiệp vụ.
- `src/lib`: auth, RBAC, route, định dạng, plan feature và helper dùng chung.
- `src/server/services`: business logic/truy vấn dùng lại giữa page, action và API.
- `prisma`: schema, migration và seed.
- `scripts`: worker vận hành và kiểm tra hồi quy.
- `public`: service worker, icon, âm thanh và uploads được mount.

## Multi-tenant

Tenant được xác định từ `rSlug`, sau đó `requireRestaurantAccess` tải nhà hàng, kiểm tra trạng thái, maintenance, membership, role và quyền gói. Mọi dữ liệu nghiệp vụ có `restaurantId`. ID từ form/URL chỉ được dùng sau khi ghép với `restaurantId` lấy từ guard.

Khách không dùng tài khoản. QR xác định bàn; cookie khách được ký HMAC bằng `NEXTAUTH_SECRET` và chứa `restaurantId`, `tableId`, `diningSessionId`, `qrToken`, tên khách. API khách xác minh chữ ký và đối chiếu lại phiên/bàn/database.

## Xác thực và điều hướng

- Auth.js Credentials tạo JWT session cho Platform Admin và người dùng nhà hàng.
- `middleware.ts` chặn route platform và route vai trò.
- Guard server vẫn là lớp quyết định; middleware không thay thế authorization.
- Nhân viên Phục vụ/Bếp/Thu ngân còn cần `StaffDeviceSession` hợp lệ.
- `getPostLoginPath` đưa người dùng về đúng phạm vi sau đăng nhập.

## Order và thanh toán

1. Khách/nhân viên chọn món từ `Product` đang hoạt động.
2. Order lưu snapshot tên, giá, option, số lượng và thành tiền vào `OrderItem`.
3. `idempotencyKey` và unique constraint chống gửi trùng.
4. Transaction khóa `DiningSession` hoặc `RestaurantTable` trước thao tác đồng thời.
5. Thanh toán khóa phiên bằng `FOR UPDATE`, tính bill từ snapshot, tạo/upsert `Payment`, đóng phiên và giải phóng bàn.
6. Bill lịch sử đọc từ Payment và order snapshot, không đọc giá menu hiện tại.

## Đồng bộ giao diện

- Dashboard/bàn/order dùng polling nhẹ và endpoint state `no-store`.
- Notification dùng EventEmitter + SSE trong một process, kèm polling fallback.
- Web Push dùng VAPID cho background notification.
- EventEmitter không đồng bộ giữa nhiều instance app; khi scale ngang cần Redis/pub-sub hoặc broker.

## PWA

Manifest được tạo động theo `slug` và context customer/admin/staff/kitchen/cashier. Tên, màu, icon lấy từ cấu hình nhà hàng. `public/sw.js` xử lý push và notification click; không cache dữ liệu nghiệp vụ.

## Storage, backup và restore

- Upload ảnh được Sharp kiểm tra, resize và chuyển WebP.
- `maintenance-worker` dùng `pg_dump`/`pg_restore` PostgreSQL 16.
- Backup nền tảng và backup theo cửa hàng có checksum/manifest và retention.
- Restore nền tảng/toàn hệ thống có runtime lock; restore theo cửa hàng có maintenance riêng tenant.
- Chi tiết: [BACKUP_AND_DATA_LIFECYCLE.md](BACKUP_AND_DATA_LIFECYCLE.md) và [RESTAURANT_BACKUP_RESTORE.md](RESTAURANT_BACKUP_RESTORE.md).

## Giới hạn kiến trúc hiện tại

- Chưa có rate limiter phân tán cho login/API công khai.
- Test chủ yếu là static/regression script, chưa có test runner integration/E2E hoàn chỉnh.
- SSE EventEmitter chỉ đáng tin với một app instance.
- Upload/backup local volume cần cơ chế sao chép off-site của hạ tầng.
- Next.js 14 hiện có advisory; xem [AUDIT_REPORT.md](AUDIT_REPORT.md).
