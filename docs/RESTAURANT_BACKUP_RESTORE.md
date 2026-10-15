# Sao lưu và khôi phục theo cửa hàng

## Hai phạm vi độc lập

- Sao lưu hệ thống dùng `PlatformBackupRun`, `pg_dump` và toàn bộ thư mục uploads. Đây là bản dự phòng cho sự cố VPS hoặc PostgreSQL và chỉ Platform Owner được khôi phục.
- Sao lưu cửa hàng dùng `RestaurantBackupRun`. Snapshot luôn lọc bằng `restaurantId`, chỉ đóng gói các file đang được cửa hàng tham chiếu và được xử lý tuần tự bởi maintenance worker.

## Dữ liệu trong snapshot cửa hàng

Snapshot gồm:

- `RestaurantSetting` và phần nhận diện vận hành của `Restaurant` (`name`, `logoUrl`, `businessType`).
- `Category`, `Product`, `ProductOptionGroup`, `ProductOptionItem`.
- `Area`, `RestaurantTable`.
- `DiningSession`, `Order`, `OrderItem`, `Payment`, `ServiceRequest`, `Notification`.
- `RestaurantUser` để giữ vai trò và tên đăng nhập của membership hiện có.
- Logo, ảnh sản phẩm và QR thanh toán được tham chiếu bởi các bản ghi trên.

Snapshot không gồm:

- `User`, mật khẩu, Platform Admin và dữ liệu xác thực dùng chung.
- `PushSubscription`, `StaffDeviceSession`, cookie hoặc token. Các phiên của cửa hàng được thu hồi khi restore.
- Gói dịch vụ, thời hạn gói, bảng giá, yêu cầu đăng ký và sự kiện hợp đồng.
- Chính sách nền tảng, lịch sử backup hệ thống và audit log.
- Dữ liệu của bất kỳ `restaurantId` nào khác.

## Quy trình khôi phục

1. Platform Owner xác thực lại và chọn một backup đã xác minh của đúng cửa hàng.
2. Worker kiểm tra checksum, manifest nội bộ, scope `restaurantId` và file uploads.
3. Nếu có Payment `PAID` mới hơn snapshot, restore tự động bị chặn để tránh âm thầm thay đổi giao dịch đã đối soát.
4. Worker tạo một backup `PRE_RESTORE`. Bản này không thuộc retention tự động.
5. Chỉ cửa hàng mục tiêu được đưa vào maintenance; các cửa hàng khác tiếp tục hoạt động.
6. Uploads trong backup được bổ sung lại. File hiện tại không bị xóa hàng loạt.
7. Dữ liệu tenant được thay thế trong một PostgreSQL transaction `SERIALIZABLE`. Sai khóa ngoại hoặc sai số lượng làm toàn bộ transaction rollback.
8. Worker xác minh số bản ghi của từng bảng rồi mở lại cửa hàng.

## Lịch và retention

- Sau giờ backup cấu hình, worker xếp tối đa một job tự động cho mỗi cửa hàng/ngày.
- Job được xử lý tuần tự, không chạy đồng thời hàng loạt khi số cửa hàng tăng.
- Mỗi cửa hàng giữ ba backup tự động thành công mới nhất.
- Backup thất bại không làm hết hạn backup thành công.
- Backup thủ công và `PRE_RESTORE` có nhóm retention riêng, mỗi nhóm giữ ba bản gần nhất để kiểm soát dung lượng mà không làm mất ba bản tự động.

## Kiểm thử cô lập

Không chạy test restore vào production. Dùng PostgreSQL/database độc lập và volume uploads riêng:

1. Chạy migration và seed ba cửa hàng A, B, C.
2. Tạo backup riêng A.
3. Ghi thêm dữ liệu vào A, B, C.
4. Restore A khi chưa có Payment `PAID` mới hơn snapshot.
5. So sánh toàn bộ bảng tenant: A trở về snapshot; B và C giữ nguyên.
6. Lặp lại với checksum sai, file thiếu và lỗi khóa ngoại để xác nhận transaction rollback.
7. Tạo Payment `PAID` mới ở A và xác nhận restore bị chặn.
8. Xác nhận request ghi của A bị khóa trong lúc restore nhưng B và C vẫn ghi được.

Nút khôi phục riêng mặc định bị khóa bằng `TENANT_RESTORE_ENABLED=false`. Chỉ đặt `TENANT_RESTORE_ENABLED=true` sau khi bộ kiểm thử A/B/C và restore staging đã đạt trên chính cấu hình PostgreSQL, filesystem và Docker volume sẽ dùng khi vận hành.

## Triển khai

```bash
cd /opt/websites/restaurant
git pull
docker compose build app maintenance-worker
docker compose run --rm app pnpm prisma:deploy
docker compose up -d --force-recreate app maintenance-worker
docker compose ps
docker compose logs maintenance-worker --tail=150
```

Sau khi restore staging và kiểm thử cô lập đạt, thêm vào `.env` rồi recreate app và worker:

```bash
TENANT_RESTORE_ENABLED=true
```

Không dùng `docker compose down -v`. Thư mục `./backups`, `./public/uploads` và `./runtime` phải tiếp tục được mount cho cả app và worker.
