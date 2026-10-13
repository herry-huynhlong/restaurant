# Dung lượng, sao lưu và vòng đời dữ liệu

Tài liệu này mô tả cách vận hành phần **Dung lượng & Sao lưu** trong Platform Admin.

## Nguyên tắc

- Trang Platform Admin chỉ hiển thị số liệu và xếp lịch tác vụ.
- Sao lưu và dọn dữ liệu chạy bằng tiến trình riêng trên máy chủ, không chạy trực tiếp trong request web.
- Bản sao lưu mới phải được tạo và kiểm tra thành công trước khi hệ thống đánh dấu thành công.
- Nếu bản sao lưu mới thất bại, các bản sao lưu cũ không bị xóa.
- Không ghi mật khẩu, khóa bí mật hoặc chuỗi kết nối vào log.
- Đơn hàng, món đã gọi, thanh toán, chứng từ và dữ liệu đối soát không nằm trong chính sách dọn tự động ngắn ngày.

## Dữ liệu được sao lưu

Một lần sao lưu gồm:

- Dữ liệu PostgreSQL.
- Ảnh tải lên trong `public/uploads`.
- File mô tả bản sao lưu để kiểm tra lại khi cần khôi phục.

## Chạy migration

Sau khi cập nhật code trên máy chủ:

```bash
cd /opt/websites/restaurant
docker compose run --rm app pnpm prisma:deploy
docker compose up -d --build app
```

## Chạy sao lưu thủ công

Nút **Chạy sao lưu thủ công** trong Platform Admin chỉ đưa tác vụ vào hàng chờ. Sau đó chạy worker:

```bash
cd /opt/websites/restaurant
docker compose --profile maintenance run --rm maintenance-worker pnpm platform:backup
```

## Chạy dọn dữ liệu tạm

Nút **Xếp lịch dọn dữ liệu tạm** chỉ đưa tác vụ vào hàng chờ. Sau đó chạy worker:

```bash
cd /opt/websites/restaurant
docker compose --profile maintenance run --rm maintenance-worker pnpm platform:cleanup
```

Tác vụ này chỉ dọn:

- Thông báo đã đọc quá thời gian cấu hình.
- Phiên thiết bị nhân viên đã kết thúc quá thời gian cấu hình.

Tác vụ này không xóa đơn hàng, thanh toán hoặc chứng từ.

## Chạy định kỳ mỗi ngày

Khuyến nghị dùng systemd timer hoặc cron của máy chủ để gọi worker. Ví dụ cron chạy lúc 02:05:

```cron
5 2 * * * cd /opt/websites/restaurant && docker compose --profile maintenance run --rm maintenance-worker pnpm platform:worker >> /var/log/restaurant-maintenance.log 2>&1
```

Thời gian hiển thị trong giao diện là giờ Việt Nam. Cron nên đặt trễ vài phút so với giờ cấu hình để tránh trùng lúc máy chủ đang khởi động.

## Vị trí lưu bản sao

Mặc định bản sao lưu được đặt trong thư mục `backups` của dự án trên máy chủ. Đây là phương án cục bộ, thuận tiện để kiểm thử nhưng chưa đủ an toàn cho vận hành lâu dài.

Khi triển khai thực tế, nên đồng bộ thư mục sao lưu sang một nơi độc lập như:

- Máy chủ lưu trữ riêng.
- Dịch vụ lưu trữ tương thích S3.
- Ổ đĩa ngoài hoặc NAS có phân quyền riêng.

Nếu chỉ lưu trên cùng máy chủ, Platform Admin sẽ hiển thị cảnh báo.

## Khôi phục dữ liệu

Không có nút khôi phục một chạm trên giao diện production để tránh ghi đè nhầm dữ liệu thật.

Quy trình khôi phục nên thực hiện có kiểm soát:

1. Dừng ứng dụng web.
2. Sao lưu lại trạng thái hiện tại trước khi khôi phục.
3. Kiểm tra bản sao lưu cần khôi phục.
4. Khôi phục PostgreSQL bằng công cụ quản trị PostgreSQL.
5. Khôi phục thư mục ảnh tải lên.
6. Chạy kiểm tra đăng nhập, menu, order, thanh toán và báo cáo.
7. Mở lại ứng dụng web.

Nên thử khôi phục trên môi trường staging trước khi thực hiện với production.
