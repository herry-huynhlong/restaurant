# Báo cáo audit source code

**Ngày audit:** 16/10/2026. **Phạm vi:** repository local hiện tại; không truy cập production database/VPS và không chạy restore production.

## Kết luận

Kiến trúc tenant, snapshot order/payment, idempotency, backup worker và guard chung có nền tảng tốt. Build và các regression script hiện có pass. Tuy nhiên chưa thể kết luận production-ready hoàn toàn vì dependency Next.js có advisory critical/high, chưa có rate limiting phân tán và chưa có integration/E2E test với database/Android thật.

## Vấn đề đã sửa

| Mức | Vấn đề | Xử lý |
|---|---|---|
| Cao | Platform Sub Admin có thể gọi action reset mật khẩu Chủ quán | Backend đổi sang `requirePlatformOwner`; ẩn nút khỏi UI Sub Admin; thêm test. |
| Cao | Staff có thể bỏ `deviceId` để qua kiểm tra ở notification state/SSE/push subscribe | Thiếu device bị trả 403; thêm test. |
| Cao | Hai request QR đồng thời có thể tạo hai DiningSession hoạt động cho một bàn | Khóa hàng RestaurantTable bằng `FOR UPDATE` trước khi tìm/tạo phiên. |
| Trung bình | Invoice number chỉ dựa sáu số timestamp, có thể trùng cùng mili-giây | Thêm time base36 và random 32-bit cho bill mới; không đổi bill cũ. |
| Trung bình | Thiếu security header cơ bản | Thêm nosniff, frame deny, referrer và permissions policy. |
| Trung bình | Board Order dùng chung không truyền định danh thiết bị khi mở SSE | Gửi `deviceId` đồng nhất với các client notification khác; polling dự phòng giữ nguyên. |
| Nhỏ | File env mẫu thiếu biến source đang dùng | Bổ sung biến runtime/debug/metrics/worker. |
| Nhỏ | README/docs mô tả Phase 1 đã lỗi thời | Viết lại bộ tài liệu theo source hiện tại. |
| Nhỏ | Bốn dependency không được import | Gỡ `@auth/prisma-adapter`, `class-variance-authority`, `clsx`, `tailwind-merge`; cập nhật lockfile. |

## Vấn đề chưa tự sửa

### Critical/High: dependency

`pnpm audit --prod` báo 2 critical, 11 high, 13 moderate và 2 low trên dependency tree hiện tại, chủ yếu Next.js 14.2.35/PostCSS. Advisory yêu cầu Next.js 15.5.24+; đây là major upgrade có thể ảnh hưởng Server Actions, middleware, Auth.js và build. Cần nhánh nâng cấp riêng, test toàn luồng rồi mới deploy. Production chạy Linux nên advisory RCE chỉ Windows không áp trực tiếp, nhưng các advisory RSC/DoS/SSRF vẫn cần xử lý.

### High: rate limiting

Credentials login và API khách chưa có limiter phân tán. Nên giới hạn tại Nginx và Redis/application theo IP + account + tenant, có backoff và không khóa nhầm toàn quán.

### Trung bình

- Test hiện tại thiên về static assertion; chưa chứng minh transaction concurrency bằng DB thật.
- SSE EventEmitter chỉ hoạt động trong một process.
- Chưa bật CSP.
- Restore tenant thay uploads trước transaction database; đã có backup trước restore nhưng tính nguyên tử database/filesystem vẫn cần kiểm chứng bằng bài test staging và rollback lỗi giữa chừng.
- Restore staging, Android push/PWA và in nhiệt thật chưa được kiểm chứng trong lần audit này.
- Backup local cần bản sao off-site do rủi ro mất cả VPS.

## Bằng chứng kiểm tra

- `pnpm test:hardening`: PASS.
- `pnpm test:backup-restore`: PASS.
- `pnpm test:customer-name`: PASS.
- `pnpm test:paid-bill`: PASS.
- `pnpm test:invoice-print`: PASS.
- `pnpm test:form-ux`: PASS, quét 100 TSX/17 dialog/53 form.
- `pnpm audit --prod`: FAIL do advisory nêu trên.
- `pnpm typecheck`: PASS.
- `pnpm lint`: PASS, không warning/error.
- `pnpm build`: PASS, 19/19 static pages và toàn bộ dynamic route được build.
- `git diff --check`: PASS; chỉ có cảnh báo chuyển LF/CRLF của Git trên Windows.

## Chưa kiểm chứng

- Restore vào staging độc lập và rollback sau lỗi giữa chừng.
- Push popup Android background trên nhiều hãng máy.
- In giấy thật 58/80 mm.
- Collector/systemd timer và backup lịch thực tế trên VPS.
- Tải/khả năng phục vụ số lượng cửa hàng đồng thời; chưa có load test.
