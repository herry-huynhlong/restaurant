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

## Chạy dịch vụ sao lưu nền

Để nút **Chạy sao lưu thủ công** được xử lý tự động, cần chạy dịch vụ nền:

```bash
cd /opt/websites/restaurant
docker compose --profile maintenance up -d maintenance-worker
```

Dịch vụ này:

- Cập nhật trạng thái sẵn sàng cho Platform Admin.
- Nhận các tác vụ sao lưu thủ công trong hàng chờ.
- Tự tạo sao lưu hằng ngày sau giờ cấu hình.
- Kiểm tra phiên bản công cụ sao lưu trước khi chạy.
- Đánh dấu thất bại nếu tác vụ chạy lỗi.
- Dọn lịch sử sao lưu thất bại và lịch sử dọn dữ liệu đã quá 7 ngày.

Nếu dịch vụ này chưa chạy, giao diện sẽ báo **Dịch vụ sao lưu chưa sẵn sàng**.

## Kiểm tra phiên bản công cụ sao lưu

PostgreSQL server đang dùng phiên bản 16, vì vậy worker cần `pg_dump` cùng phiên bản chính 16.

Kiểm tra trong container:

```bash
docker compose --profile maintenance run --rm maintenance-worker pg_dump --version
```

Kết quả nên là:

```text
pg_dump (PostgreSQL) 16.x
```

Nếu phiên bản không khớp, backup sẽ bị đánh dấu chưa thành công và không tự động thử lại liên tục trong cùng ngày.

## Chạy dọn dữ liệu tạm

Nút **Xếp lịch dọn dữ liệu tạm** chỉ đưa tác vụ vào hàng chờ. Sau đó chạy worker:

```bash
cd /opt/websites/restaurant
docker compose --profile maintenance run --rm maintenance-worker pnpm platform:cleanup
```

Tác vụ này chỉ dọn:

- Thông báo đã đọc quá thời gian cấu hình.
- Phiên thiết bị nhân viên đã kết thúc quá thời gian cấu hình.
- Lịch sử sao lưu thất bại quá 7 ngày.
- Lịch sử dọn dữ liệu đã hoàn tất quá 7 ngày.

Tác vụ này không xóa đơn hàng, thanh toán hoặc chứng từ.

## Chạy định kỳ mỗi ngày

Khuyến nghị dùng systemd timer hoặc cron của máy chủ để gọi worker. Ví dụ cron chạy lúc 02:05:

```cron
5 2 * * * cd /opt/websites/restaurant && docker compose --profile maintenance run --rm maintenance-worker pnpm platform:worker >> /var/log/restaurant-maintenance.log 2>&1
```

Thời gian hiển thị trong giao diện là giờ Việt Nam. Cron nên đặt trễ vài phút so với giờ cấu hình để tránh trùng lúc máy chủ đang khởi động.

Nếu đã chạy `maintenance-worker` ở chế độ nền, không cần cron cho backup hằng ngày. Chỉ nên chọn một trong hai cách để tránh chạy trùng.

## Đo tài nguyên VPS

Ứng dụng web không đọc trực tiếp thông tin máy chủ host. Máy chủ cần chạy collector nhẹ để ghi số liệu tổng hợp vào file, sau đó container web chỉ đọc file này.

Tạo thư mục:

```bash
cd /opt/websites/restaurant
mkdir -p host-metrics
```

Chạy thử collector trên host:

```bash
bash scripts/collect-host-metrics.sh
cat host-metrics/metrics.json
```

Cron gợi ý, cập nhật mỗi phút:

```cron
* * * * * cd /opt/websites/restaurant && bash scripts/collect-host-metrics.sh
```

Collector đọc:

- RAM và Swap từ `/proc/meminfo`.
- Ổ cứng từ phân vùng chứa `/` theo mặc định. Có thể đổi bằng `HOST_METRICS_TARGET_PATH` nếu dữ liệu chạy trên phân vùng riêng.
- Dung lượng thư mục `backups`.

Không mount Docker socket vào web container và không cho client chỉ định đường dẫn cần đọc.

## Vị trí lưu bản sao

Mặc định bản sao lưu được đặt trong thư mục `backups` của dự án trên máy chủ. Đây là phương án cục bộ, thuận tiện để kiểm thử nhưng chưa đủ an toàn cho vận hành lâu dài.

Khi triển khai thực tế, nên đồng bộ thư mục sao lưu sang một nơi độc lập như:

- Máy chủ lưu trữ riêng.
- Dịch vụ lưu trữ tương thích S3.
- Ổ đĩa ngoài hoặc NAS có phân quyền riêng.

Nếu chỉ lưu trên cùng máy chủ, Platform Admin sẽ hiển thị cảnh báo.

## Khôi phục dữ liệu

Không có nút khôi phục một chạm trên giao diện production để tránh ghi đè nhầm dữ liệu thật.

Trang `/platform/storage` chỉ cho Platform Owner kiểm tra khả năng khôi phục ở mức an toàn:

- Bản sao lưu phải ở trạng thái thành công.
- File `database.dump` phải còn tồn tại và có dữ liệu.
- File `uploads.tar.gz` được kiểm tra nếu bản sao lưu có lưu ảnh tải lên.
- File `manifest.json` phải khớp với bản ghi sao lưu.
- Checksum được đối chiếu khi bấm kiểm tra khả năng khôi phục.

Nút "Khôi phục" trên giao diện vẫn bị khóa cho tới khi có đủ restore worker cô lập, chế độ bảo trì, bản sao lưu ngay trước khi khôi phục và quy trình rollback đã kiểm chứng. Không gọi `pg_restore` trực tiếp từ request HTTP.

Quy trình khôi phục nên thực hiện có kiểm soát:

1. Dừng ứng dụng web.
2. Sao lưu lại trạng thái hiện tại trước khi khôi phục.
3. Kiểm tra bản sao lưu cần khôi phục.
4. Khôi phục PostgreSQL bằng công cụ quản trị PostgreSQL.
5. Khôi phục thư mục ảnh tải lên.
6. Chạy kiểm tra đăng nhập, menu, order, thanh toán và báo cáo.
7. Mở lại ứng dụng web.

Nên thử khôi phục trên môi trường staging trước khi thực hiện với production.

### Thử khôi phục trên môi trường độc lập

Không chạy các lệnh dưới đây trên database production. Dùng một máy staging hoặc một project Docker riêng, copy thư mục của một bản sao lưu thành công sang đó rồi kiểm tra.

Ví dụ kiểm tra một bản sao lưu:

```bash
cd /opt/websites/restaurant
ls backups
cat backups/<backup-folder>/manifest.json
sha256sum backups/<backup-folder>/database.dump backups/<backup-folder>/uploads.tar.gz
```

Ví dụ restore vào database staging rỗng:

```bash
createdb restaurant_restore_test
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname=restaurant_restore_test \
  backups/<backup-folder>/database.dump
```

Ví dụ khôi phục ảnh tải lên vào thư mục staging:

```bash
mkdir -p /tmp/restaurant-restore-uploads
tar -xzf backups/<backup-folder>/uploads.tar.gz -C /tmp/restaurant-restore-uploads
```

Sau khi restore staging, kiểm tra tối thiểu:

- Đăng nhập Platform Admin.
- Mở danh sách nhà hàng.
- Đăng nhập một chủ quán.
- Kiểm tra menu, bàn, order, thanh toán, báo cáo.
- Kiểm tra ảnh món/logo còn hiển thị.

Chỉ khi các bước staging đạt yêu cầu mới lập kế hoạch khôi phục production, và luôn sao lưu trạng thái production hiện tại trước khi ghi đè.
