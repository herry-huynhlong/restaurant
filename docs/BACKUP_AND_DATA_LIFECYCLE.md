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
docker compose up -d --build
```

## Chạy sao lưu thủ công

Nút **Sao lưu ngay** trong Platform Admin đưa tác vụ vào hàng chờ. `maintenance-worker` đang chạy nền sẽ tự nhận và xử lý, không cần chạy thêm lệnh bằng tay.

## Chạy dịch vụ sao lưu nền

`maintenance-worker` là service mặc định của Docker Compose và phải chạy cùng ứng dụng. Lệnh triển khai thông thường:

```bash
cd /opt/websites/restaurant
docker compose up -d
```

Không cần dùng `--profile maintenance`. Nút **Sao lưu ngay** chỉ tạo tác vụ khi worker đã cập nhật trạng thái sẵn sàng trong vòng 5 phút. Trong lúc một lần sao lưu đang chờ hoặc đang chạy, hệ thống từ chối tạo thêm tác vụ trùng.

Dịch vụ này:

- Cập nhật trạng thái sẵn sàng cho Platform Admin.
- Nhận các tác vụ sao lưu thủ công trong hàng chờ.
- Tự tạo sao lưu hằng ngày sau giờ cấu hình.
- Kiểm tra phiên bản công cụ sao lưu trước khi chạy.
- Đánh dấu thất bại nếu tác vụ chạy lỗi.
- Dọn lịch sử sao lưu thất bại và lịch sử dọn dữ liệu đã quá 7 ngày.

Nếu dịch vụ này chưa chạy, giao diện sẽ báo **Dịch vụ sao lưu chưa sẵn sàng**.

Kiểm tra trên VPS:

```bash
docker compose ps
docker compose logs maintenance-worker --tail=100
find backups -maxdepth 2 -type f -printf '%p %s bytes\n'
```

Web container đọc thư mục `backups` ở chế độ chỉ đọc; worker là thành phần duy nhất ghi bản sao lưu. Vì vậy file vẫn còn sau khi recreate container nếu thư mục bind mount trên VPS không bị xóa thủ công.

Chính sách giữ bản sao được tách riêng:

- Giữ số bản **tự động** thành công theo cấu hình, mặc định là 3.
- Giữ tối đa 3 bản **thủ công** thành công.
- Sao lưu thủ công không làm mất ba bản tự động gần nhất.
- Lần sao lưu thất bại không kích hoạt dọn các bản thành công.
- Bản dự phòng được tạo ngay trước khi khôi phục nằm trong `runtime/pre-restore` và không thuộc retention thông thường.

## Kiểm tra phiên bản công cụ sao lưu

PostgreSQL server đang dùng phiên bản 16, vì vậy worker cần `pg_dump` cùng phiên bản chính 16.

Kiểm tra trong container:

```bash
docker compose run --rm maintenance-worker pg_dump --version
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
docker compose run --rm maintenance-worker pnpm platform:cleanup
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
5 2 * * * cd /opt/websites/restaurant && docker compose run --rm maintenance-worker pnpm platform:worker >> /var/log/restaurant-maintenance.log 2>&1
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

Platform Owner có thể chọn **Khôi phục** trên một bản sao lưu thành công. Server action chỉ xác thực quyền, mật khẩu và xếp job; nó không chạy `pg_restore` trong request HTTP.

`maintenance-worker` thực hiện tuần tự:

1. Kiểm tra file database, ảnh, manifest và tính toàn vẹn ở nền.
2. Khôi phục thử vào một database tạm và kiểm tra các bảng quan trọng.
3. Giải nén ảnh vào thư mục tạm và kiểm tra khả năng đọc.
4. Kiểm tra dung lượng trống.
5. Bật chế độ bảo trì; giao diện và lớp Prisma chặn thao tác ghi.
6. Tạo bản dự phòng database và uploads ngay trước thao tác.
7. Chuyển database đã kiểm tra vào vị trí production và khôi phục uploads.
8. Chạy migration, kiểm tra lại database và uploads.
9. Chỉ tắt bảo trì sau khi mọi bước đạt yêu cầu.

Nếu khôi phục lỗi sau khi đã thay dữ liệu, worker đổi lại database cũ và phục hồi uploads từ bản dự phòng. Nếu rollback không được kiểm chứng là thành công, hệ thống giữ chế độ bảo trì và đánh dấu **Cần can thiệp**, không tự động chạy lại thao tác phá hủy sau khi worker restart.

Trạng thái restore và cờ bảo trì nằm trong thư mục bind mount `runtime`, bên ngoài database có thể bị thay thế. Không xóa thư mục này trong lúc restore.

### Kiểm tra trên môi trường độc lập

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

Worker luôn thực hiện bước staging nói trên trước mỗi lần khôi phục production. Khi triển khai bản code mới, vẫn nên chạy một lần trên project Docker thử nghiệm riêng trước khi mở thao tác trên VPS chính.

Có thể kiểm tra riêng một bản sao lưu bằng ID mà không thay đổi database production:

```bash
BACKUP_ID=$(docker compose exec -T postgres psql -U restaurant_user -d restaurant_saas -Atc \
  'select id from "PlatformBackupRun" where status = '\''SUCCESS'\'' order by "completedAt" desc limit 1')
docker compose exec maintenance-worker pnpm exec tsx scripts/platform-maintenance-worker.ts restore-verify "$BACKUP_ID"
```

Lệnh này tạo database tạm, khôi phục và kiểm tra dữ liệu/ảnh, rồi xóa database tạm. Nó không chuyển database production sang bản cũ.

## Triển khai trên VPS

```bash
cd /opt/websites/restaurant
git pull
mkdir -p backups runtime public/uploads host-metrics
docker compose build app maintenance-worker
docker compose run --rm app pnpm prisma:deploy
docker compose up -d --force-recreate app maintenance-worker
docker compose ps
docker compose logs maintenance-worker --tail=100
```

Kiểm tra mount và công cụ:

```bash
docker compose exec app sh -lc 'test -d /app/backups && test -d /app/runtime && echo OK'
docker compose exec maintenance-worker sh -lc 'test -w /app/backups && test -w /app/runtime && test -w /app/public/uploads && echo OK'
docker compose exec maintenance-worker pg_dump --version
```

Không chạy thử nút khôi phục trên dữ liệu production chỉ để kiểm tra giao diện. Hãy dùng project Docker cô lập hoặc bản sao VPS trước.
