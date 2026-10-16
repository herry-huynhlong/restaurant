# Bảo trì và phát triển tiếp

## Bắt đầu từ đâu

- Trang/giao diện: `src/app` và `src/components`.
- Nghiệp vụ dùng lại: `src/server/services`.
- Guard/quyền gói: `src/lib/rbac`, `src/lib/plan/features.ts`.
- Route/link: `src/lib/routes.ts`.
- Database: `prisma/schema.prisma` + migration mới.
- Worker/backup: `scripts/platform-maintenance-worker.ts`, `platform-restore-worker.ts`.

## Quy trình thay đổi

1. Đọc FILE_MAP và feature liên quan.
2. Xác định tenant/role/plan/device guard.
3. Giữ business logic trong service hoặc action hiện có, tránh luồng song song.
4. Với thao tác gửi lặp, thêm idempotency/transaction/row lock.
5. Thêm test hồi quy và cập nhật tài liệu.
6. Chạy typecheck, lint, toàn bộ script test, build và audit dependency.
7. Review diff, backup rồi mới deploy/migrate.

## Database

Không sửa migration đã chạy, không đổi snapshot order/payment để “đồng bộ” menu mới, không cascade xóa chứng từ. Migration lớn cần thử trên bản sao production và đo thời gian lock.

## UI

Theo `UX_WRITING_GUIDELINES.md`; không hiển thị key kỹ thuật, stack, role enum hoặc command. Modal thành công đóng và xóa dữ liệu nhạy cảm; thất bại giữ dữ liệu không nhạy cảm.

## Khoản nợ kỹ thuật ưu tiên

1. Nâng Next.js lên phiên bản đã vá sau compatibility test.
2. Thêm rate limiting dùng Redis/reverse proxy cho login và API công khai.
3. Xây integration/E2E test với PostgreSQL thật và ma trận cross-tenant.
4. Thay EventEmitter bằng Redis/pub-sub nếu chạy nhiều app replica.
5. Sao chép backup off-site và diễn tập restore định kỳ.
6. Triển khai CSP report-only rồi mới enforce.

## Không nên tùy tiện sửa

- `payment-service.ts`, order idempotency, snapshot giá.
- Guard tenant và role.
- Retention/restore lock và pre-restore snapshot.
- `NEXTAUTH_SECRET`, VAPID key đang dùng.
- Migration cũ và dữ liệu PAID.
