# Xác thực, phân quyền và bảo mật

## Vai trò và guard

- Platform: `PLATFORM_OWNER`, legacy `PLATFORM_ADMIN`, `PLATFORM_SUB_ADMIN`.
- Restaurant: `OWNER`, `MANAGER`, `WAITER`, `KITCHEN`, `CASHIER`.
- Khách: cookie phiên QR ký HMAC.

Guard: `requirePlatformAdmin`, `requirePlatformOwner`, `requireRestaurantAccess`, `requireRestaurantFeature`, `assertActiveStaffDeviceForAction`, `getCustomerContext`. Endpoint mới phải tự gọi guard; ẩn nút UI không phải authorization.

## Biện pháp hiện có

- bcrypt cost 12; Auth.js JWT session.
- Customer cookie HttpOnly, SameSite=Lax, Secure production, timing-safe signature.
- Zod validation; Prisma parameter hóa; raw SQL dùng tagged template.
- Upload whitelist MIME/kích thước, Sharp decode/encode, path containment.
- React escape text; source không dùng `dangerouslySetInnerHTML`.
- Error lọc stack/SQL/secret; debug log opt-in và redact.
- Security headers: nosniff, deny frame, strict referrer, tắt camera/mic/geolocation.
- Idempotency và row lock cho order/payment/subscription/session.

## Rủi ro còn lại

1. Next.js 14.2.35 có advisory critical/high; cần nâng 15.5.24+ qua dự án tương thích riêng.
2. Chưa có rate limiter phân tán cho credentials login và API công khai.
3. Chưa có integration test cross-tenant với PostgreSQL thật.
4. SSE EventEmitter không đồng bộ giữa nhiều replica.
5. CSP chưa bật; nên rollout report-only trước.

## Checklist endpoint mới

Guard server -> validate input -> scope ID bằng `restaurantId` -> transaction/idempotency -> lọc lỗi -> audit thao tác nhạy cảm -> test role và cross-tenant.
