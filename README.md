# QuánPilot

QuánPilot là nền tảng SaaS quản lý nhiều nhà hàng/quán nước, gồm luồng gọi món QR cho khách, vận hành Phục vụ - Bếp - Thu ngân, quản trị cửa hàng và quản trị nền tảng. Ứng dụng dùng chung một codebase Next.js, cô lập dữ liệu theo `restaurantId` và nhận diện cửa hàng bằng `slug`.

## Chức năng chính

- Khách quét QR, nhập tên, xem menu, gọi món, xem món đã gọi và yêu cầu thanh toán.
- Chủ quán/Quản lý quản lý menu, khu vực, bàn, QR, order, nhân viên, báo cáo và cài đặt.
- Phục vụ nhận món, xử lý yêu cầu khách, xem bàn/order và thêm món tại bàn.
- Bếp nhận món, chuyển trạng thái chế biến và hoàn thành món.
- Thu ngân xác nhận thanh toán, in phiếu tạm tính, in/in lại bill.
- Platform Admin quản lý nhà hàng, chủ quán, bảng giá, yêu cầu gói, audit log, dung lượng, backup và restore.
- PWA riêng theo cửa hàng và vai trò; push notification qua Web Push/VAPID.

## Công nghệ

- Node.js 22, Next.js 14 App Router, React 18, TypeScript.
- Tailwind CSS, Lucide Icons.
- PostgreSQL 16, Prisma ORM 6.
- Auth.js/NextAuth Credentials và JWT session.
- Docker Compose gồm `postgres`, `app`, `maintenance-worker`.

> `pnpm audit` ngày 16/10/2026 báo các advisory nghiêm trọng đối với Next.js 14.2.35. Xem [Báo cáo audit](docs/AUDIT_REPORT.md) trước khi đưa hệ thống ra Internet; nâng lên Next.js 15.5.24+ cần một đợt kiểm thử tương thích riêng.

## Chạy nhanh bằng Docker

```bash
cp .env.docker.example .env
# Điền mật khẩu, URL, secret và VAPID keys trong .env
mkdir -p public/uploads backups runtime host-metrics
docker compose build app maintenance-worker
docker compose up -d postgres
docker compose run --rm app pnpm prisma:deploy
docker compose up -d app maintenance-worker
docker compose ps
```

Ứng dụng lắng nghe tại `127.0.0.1:3000`; production cần reverse proxy HTTPS.

## Chạy local

Yêu cầu Node.js 22, pnpm 11.19 và PostgreSQL 16.

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm prisma:deploy
pnpm prisma:seed       # chỉ dùng cho môi trường phát triển mới
pnpm dev
```

Mở `http://localhost:3000`. Không chạy seed hoặc `prisma migrate dev` trên production.

## Kiểm tra trước khi deploy

```bash
pnpm typecheck
pnpm lint
pnpm test:hardening
pnpm test:backup-restore
pnpm test:form-ux
pnpm test:customer-name
pnpm test:paid-bill
pnpm test:invoice-print
pnpm build
pnpm audit --prod
```

Các script test hiện tại chủ yếu là kiểm tra hồi quy tĩnh và logic trọng yếu, chưa thay thế integration/E2E test với PostgreSQL và thiết bị Android thật.

## Tài liệu

- [Kiến trúc](docs/architecture.md)
- [Bản đồ file](docs/FILE_MAP.md)
- [Chức năng và luồng nghiệp vụ](docs/FEATURES.md)
- [API và Server Actions](docs/API.md)
- [Database](docs/DATABASE.md)
- [Cấu hình môi trường](docs/CONFIGURATION.md)
- [Phân quyền](docs/permissions.md)
- [Bảo mật](docs/SECURITY.md)
- [Triển khai production](docs/DEPLOYMENT.md)
- [Bảo trì và phát triển](docs/MAINTENANCE.md)
- [Backup và vòng đời dữ liệu](docs/BACKUP_AND_DATA_LIFECYCLE.md)
- [Restore theo cửa hàng](docs/RESTAURANT_BACKUP_RESTORE.md)
- [Quy chuẩn nội dung UI](docs/UX_WRITING_GUIDELINES.md)
- [Báo cáo audit](docs/AUDIT_REPORT.md)

## Nguyên tắc dữ liệu

- Tiền lưu dạng số nguyên VND.
- Thời gian lưu UTC, hiển thị theo timezone cửa hàng (mặc định `Asia/Ho_Chi_Minh`).
- Giá và tên món trong order được snapshot tại thời điểm gọi.
- Payment đã thanh toán và bill lịch sử không tính lại từ menu hiện tại.
- Mọi truy vấn dữ liệu cửa hàng phải có `restaurantId`; không tin `restaurantId` từ client.
- Backup/restore production chỉ chạy qua worker và phải có bản dự phòng trước restore.

## Cập nhật production

```bash
cd /opt/websites/restaurant
git pull
docker compose build app maintenance-worker
docker compose up -d postgres
docker compose run --rm app pnpm prisma:deploy
docker compose up -d app maintenance-worker
docker compose ps
docker compose logs app maintenance-worker --tail=150
```

Luôn tạo và kiểm tra backup trước migration; không dùng `git reset --hard`, `prisma migrate reset` hoặc restore trực tiếp lên production.
