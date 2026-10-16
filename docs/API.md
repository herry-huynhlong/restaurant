# API và Server Actions

Tất cả response nghiệp vụ riêng tư phải dùng `Cache-Control: no-store` khi phù hợp. Route có session dùng cookie Auth.js; route khách dùng cookie HMAC. Bảng dưới ghi các endpoint thực tế.

## Route Handlers

| Method | Endpoint | Mục đích | Quyền |
|---|---|---|---|
| GET/POST | `/api/auth/[...nextauth]` | Auth.js credentials/session | Công khai theo Auth.js |
| GET | `/api/platform/storage/metrics` | Tài nguyên host/backup | Platform Admin |
| GET | `/api/platform/subscription-requests/pending-count` | Badge yêu cầu gói chờ | Platform Admin |
| POST/PATCH | `/api/restaurants/[rSlug]/admin/menu` | Tạo/sửa món và ảnh | OWNER, MANAGER |
| PATCH | `/api/restaurants/[rSlug]/admin/orders/requests/[requestId]` | Hoàn tất yêu cầu khách | OWNER, MANAGER, WAITER, CASHIER |
| GET | `/api/restaurants/[rSlug]/admin/orders/state` | Order/bàn đang hoạt động | OWNER, MANAGER, WAITER, CASHIER |
| GET | `/api/restaurants/[rSlug]/admin/overview/state` | KPI dashboard | OWNER, MANAGER |
| GET | `/api/restaurants/[rSlug]/admin/tables/state` | Trạng thái bàn | OWNER, MANAGER, WAITER, CASHIER |
| POST | `/api/restaurants/[rSlug]/admin/tables/[tableId]/order` | Nhân viên thêm món | OWNER, MANAGER, WAITER + device |
| POST | `/api/restaurants/[rSlug]/admin/tables/[tableId]/regenerate-qr` | Đổi QR bàn | OWNER, MANAGER |
| GET | `/api/restaurants/[rSlug]/customer/bill` | Bill phiên khách | Cookie khách hợp lệ |
| POST | `/api/restaurants/[rSlug]/customer/order` | Khách gửi order | Cookie khách hợp lệ |
| POST | `/api/restaurants/[rSlug]/customer/service-request` | Gọi nhân viên/thanh toán | Cookie khách hợp lệ |
| POST | `/api/restaurants/[rSlug]/device-session` | Đăng ký thiết bị/người vận hành | WAITER/KITCHEN/CASHIER |
| GET/PATCH | `/api/restaurants/[rSlug]/notifications` | Danh sách/đánh dấu đã đọc | Thành viên; staff cần device |
| GET | `/api/restaurants/[rSlug]/notifications/state` | Số chưa đọc | Thành viên; staff cần device |
| GET | `/api/restaurants/[rSlug]/notifications/stream` | SSE refresh | Thành viên; staff cần device |
| POST | `/api/restaurants/[rSlug]/ops/pay-session` | Xác nhận thanh toán | OWNER/MANAGER/CASHIER + feature/device |
| POST/DELETE | `/api/restaurants/[rSlug]/push/subscribe` | Đăng ký/hủy push | Thành viên; staff cần device |
| POST | `/api/restaurants/[rSlug]/push/test` | Gửi push thử | Thành viên vào chính subscription |
| GET | `/api/restaurants/[rSlug]/reports/payments` | Lịch sử bill phân trang | OWNER/MANAGER/CASHIER + BILL_PRINT |
| GET | `/api/restaurants/[rSlug]/reports/payments/[paymentId]` | Chi tiết bill | Cùng quyền, scope tenant |
| GET/POST | `/api/restaurants/[rSlug]/shift` | Xem/bắt đầu/kết thúc ca | WAITER/KITCHEN/CASHIER + device |
| GET | `/api/uploads/[...path]` | Phục vụ ảnh whitelist | Công khai, chỉ products/logos/payments |

## Payload chính

- Order khách/nhân viên: `{ idempotencyKey, items: [{ productId, quantity, note? }] }`.
- Thanh toán: `{ diningSessionId, expectedGrandTotal?, paymentMethod }`.
- Push: `{ endpoint, keys: { p256dh, auth }, deviceId?, deviceName? }`.
- Ca: `{ deviceId, action: "START" | "END" }`.
- Validation lỗi trả HTTP 400; sai quyền 401/403; dữ liệu không còn hợp lệ 404/409; lỗi server trả thông báo đã lọc.

## Server Actions

- `src/app/[rSlug]/admin/actions.ts`: area, table, QR, category, product, settings, staff, device và notification.
- `src/app/[rSlug]/ops/actions.ts`: trạng thái món/order, yêu cầu khách và thanh toán.
- `src/app/[rSlug]/welcome/actions.ts`: tạo/tái sử dụng DiningSession và cookie khách.
- `src/app/[rSlug]/admin/subscription/actions.ts`: gửi yêu cầu đăng ký/gia hạn/nâng cấp.
- `src/app/platform/restaurants/actions.ts`: vòng đời nhà hàng, gói, chủ quán và request subscription.
- `src/app/platform/admins/actions.ts`: admin phụ.
- `src/app/platform/plans/actions.ts`: bảng giá/ghi nhận ma trận quyền.
- `src/app/platform/settings/actions.ts`: đổi mật khẩu Platform Owner.
- `src/app/platform/storage/actions.ts`: policy, backup, cleanup và restore job.

Server Action luôn phải gọi guard bên trong; ẩn nút ở UI không phải authorization.
