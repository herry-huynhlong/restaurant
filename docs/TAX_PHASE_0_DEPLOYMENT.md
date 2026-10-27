# QuánPilot Phase 0 — kiểm tra phát hành production

**Kết quả tiếp theo:** sau khi được duyệt ngoại lệ, đã phát hành source `cd82e8d` ngày 27/10/2026 và đạt smoke/audit production. Xem [TAX_PHASE_0_PRODUCTION.md](TAX_PHASE_0_PRODUCTION.md). Báo cáo này giữ lịch sử quyết định NO-GO tại audit ban đầu, không phải trạng thái production hiện tại.

**Cập nhật:** chủ dự án đã duyệt ngoại lệ đúng một bill lịch sử và cho tiếp tục phát hành; bản ghi giữ nguyên, chưa xác minh chứng từ gốc. Kết luận NO-GO bên dưới là tại lần kiểm tra ban đầu. Kết quả đợt phát hành tiếp theo sẽ được ghi trong `TAX_PHASE_0_PRODUCTION.md`.

Ngày **27/10/2026**, Asia/Bangkok. Chủ dự án đã duyệt phát hành có kiểm soát, với điều kiện dừng nếu phát hiện vấn đề dữ liệu hoặc không đạt backup/capacity.

**Kết luận: NO-GO tại bước audit dữ liệu; chưa commit, push, chạy CI hoặc deploy.** Phát hiện một bill lịch sử có hai cảnh báo. Không sửa/xóa/backfill dữ liệu và không bắt đầu Giai đoạn A.

## 1. Phạm vi và source

Đã review diff Phase 0 trong `docs/TAX_PHASE_0.md`: period/timezone/bucket, khóa transaction các luồng order/payment, bảo vệ PAID snapshot/idempotency, audit read-only và regression tests. Không có schema/migration, thay bảng giá/gói, authentication hoặc module thuế.

- Local HEAD vẫn `50340f5b1d2d7051a9dc78f6a646b1a8672d4756`; chưa tạo commit phát hành.
- Production app giữ source label `c889cc01f2238b1c487e45c37e4cdd39bc42d4db`.
- Image ID production giữ `sha256:bc1ac42910a8bef6cb68ffdf658794efd44338935bee087c705a89e4adac1f76`. Đây là Docker image/config ID hiện có, không phải digest của image mới hoặc registry manifest.
- Image mới, source SHA phát hành, manifest/checksum phát hành và kết quả CI: **chưa có**, vì dừng trước commit theo điều kiện nghiệm thu dữ liệu.
- Workflow `quanpilot-release.yml` đã chuẩn bị thêm test period/PostgreSQL và HTTP chạy trên image CI với DB test riêng. Thay đổi chỉ ở local, chưa push/chạy trên GitHub; không gọi SSH hoặc chứa secret production. Docker build vẫn trên GitHub-hosted runner.
- Các asset, thư mục `qavio/` và `docs/TAX_MODULE_READINESS.md` untracked có từ trước được giữ nguyên, chưa đưa vào commit nào.

## 2. Capacity và trạng thái ban đầu

VPS được kiểm tra chỉ đọc trước khi tạo backup:

| Mục | Kết quả |
|---|---|
| Disk | 25 GB, khoảng 16 GB đã dùng, 70%, khoảng 7,1 GiB available |
| RAM | 955 MiB tổng, khoảng 456 MiB available tại mẫu đo |
| Swap | 807 MiB/2047 MiB đang dùng |
| Build cache | 0 B |
| Containers | 7 container đang chạy |
| Docker images | 14 image; chưa xóa/prune/pull/load/build image nào |

Capacity chưa phải blocker ở bước backup. **Chưa duyệt capacity cho image mới**, vì chưa có artifact để tính uncompressed layers + staging + reserve theo release guard. Không dùng số free này làm cam kết đủ cho mọi image.

Sau backup/probe: free **7.600.590.848 bytes**, vẫn khoảng 7,08 GiB. Không recreate PostgreSQL/worker, không restart Docker Engine, không thay env/secrets/volumes.

## 3. Backup mới, off-host và restore

- Tạo pg_dump custom-format riêng QuánPilot, không dump database QAVIO.
- Backup uploads của QuánPilot, kiểm SHA256, đóng gói và mã hóa AES-256-CBC/PBKDF2 theo runbook hiện có; khóa gói được mã hóa bằng RSA public key backup hiện có.
- Backup hoàn tất **09:18:17 ngày 27/10/2026 (UTC+7)**.
- Dump 239.749 bytes. Gói mã hóa 3.809.312 bytes.
- SHA256 dump: `3451f5f21efb8e3b097306e5f49d99ba86da62748711793e0e4bdf33c959cd95`.
- SHA256 gói mã hóa: `ed1e036c996e486ed8d85eed264116d4e10c63a305fed3ecfdc09d402174b75a`.
- Đã chuyển snapshot mã hóa + khóa gói mã hóa + proof ra máy local, kiểm checksum, giải mã và `pg_restore --no-owner --no-privileges --exit-on-error` vào DB mới cô lập trên **127.0.0.1:55432**.
- Restore PASS: 28 migration hoàn tất, 0 migration lỗi; archive uploads kiểm tra checksum/tar thành công, 80 entries. Không áp migration lên production hoặc clone.
- Bản sao có 5 tenant, 48 phiên, 168 order, 49 Payment, trong đó 45 PAID. Đây là số đếm của snapshot backup, không phải truy vấn đối soát trực tiếp trên live DB đang thay đổi.
- Sau audit đã drop đúng DB clone do lần chạy tạo và xóa đúng các file plaintext tạm. Bản backup mã hóa/off-host và proof vẫn giữ; không xóa backup production hoặc volume.

Vị trí private vận hành (không đưa vào Git/artifact):

- VPS: `/opt/websites/restaurant/.trial-runtime/tax-phase0-20261027/backup/`.
- Off-host: `C:/Users/LONG_IT/.codex/secrets/qavio/tax-phase0-production/`, đã giới hạn ACL cho tài khoản hiện tại/SYSTEM.
- Bằng chứng off-host `proof.json`, `audit-restore.json`; trạng thái không deploy ở `no-go-state.json` trên VPS. Không có thông tin khách hàng trong báo cáo này.

## 4. Audit tài chính trên bản sao production

Audit chính dùng transaction **RepeatableRead + SET TRANSACTION READ ONLY**. Phân loại bổ sung cũng chỉ SELECT trên clone, không truy vấn dữ liệu production trực tiếp. Tất cả kiểm tra hoàn thành trước khi dọn clone.

| Mã | Số lượng | Phân loại |
|---|---:|---|
| MISSING_BILL_SNAPSHOT | 1 | Một PAID thiếu invoiceNumber, tableIdSnapshot, tableNameSnapshot, invoiceBusinessName, invoiceDisplayName |
| PAID_SESSION_STATE_MISMATCH | 1 | Phiên liên quan còn enum `PAID`, paymentStatus `PAID`, closedAt đã có; khác trạng thái `CLOSED` của luồng hiện tại |
| 10 mã còn lại | 0 | Không thấy PAID thiếu paidAt, sai amount/tổng bill, nhiều PAID/phiên, lệch tenant Payment/Order/Item, trùng invoice/key, thiếu dữ liệu dòng hàng/người xác nhận hoặc tổng nguồn lệch subtotal |

**Hai cảnh báo thuộc cùng một bill lịch sử, không phải hai bill riêng.** Trạng thái legacy `PAID` có closedAt không tự chứng minh phiên đã bị retry mở lại hoặc chưa thu tiền. Snapshot thiếu làm bill này không đáp ứng chuẩn dữ liệu hiện tại; không được điền suy đoán từ cấu hình nhà hàng hiện nay.

Không xuất ID bill, tên nhà hàng, tên/số điện thoại khách, tên món hoặc nội dung order. Không kết luận dữ liệu production hoàn toàn sạch chỉ vì các mã khác bằng 0; audit phản ánh snapshot và các kiểm tra đã định nghĩa.

### Phương án xử lý riêng cần quyết định

1. Giữ nguyên bản ghi, bảo quản backup; người có quyền đối soát chứng từ gốc qua quy trình nội bộ, xác định bill legacy/migration hay dữ liệu thiếu nguồn.
2. Nếu chấp nhận ngoại lệ lịch sử để phát hành bản sửa ngăn lỗi mới: chủ dự án xác nhận rõ **phát hành Phase 0, giữ nguyên bill này, đối soát riêng**. Không coi xác nhận đó là quyền backfill/sửa dữ liệu hoặc cho phép dùng bill thiếu snapshot làm dữ liệu thuế đầy đủ.
3. Nếu cần sửa lịch sử: lập kế hoạch riêng dựa trên chứng từ xác minh, ghi tác động/audit/rollback và xin duyệt riêng. Không tự chuyển trạng thái hoặc tạo invoice/snapshot cho bill cũ.

Hiện tuân thủ yêu cầu “phát hiện vấn đề ảnh hưởng dữ liệu thì dừng phát hành”, chưa tự chọn phương án 2.

## 5. Kiểm thử và CI

- Chạy lại **22 test deploy offline: PASS**.
- Chạy lại **18 script hồi quy: PASS**, gồm 65 bộ period/timezone và các luồng paid bill/print/cashier/order/table/subscription đã nêu trong Phase 0.
- `git diff --check`: PASS.
- Lint, TypeScript, production build và 13 nhóm PostgreSQL/HTTP đã PASS trong nghiệm thu local trước đó; lần này không sửa app source sau nghiệm thu.
- Bổ sung workflow CI có kiểm thử Phase 0 trên DB `tax_phase0_test` và image Linux ở runner. Chưa thực thi GitHub Actions do audit gate chưa đạt, nên **không ghi CI PASS hoặc image đã được xác minh**.

## 6. Production và không ảnh hưởng dịch vụ khác

So sánh trước/sau bằng container ID, image ID, StartedAt, RestartCount và running: **cả 7 container giữ nguyên**, kể cả app QuánPilot.

| Container | Trạng thái |
|---|---|
| restaurant-app-1 | Running; không cấu hình Docker healthcheck |
| restaurant-maintenance-worker-1 | Running; không cấu hình Docker healthcheck |
| restaurant-postgres-1 | Running, healthy |
| qavio-web-1 | Running, healthy |
| qavio-worker-1 | Running, healthy |
| qavio-qavio-postgres-1 | Running, healthy |
| longh-portfolio | Running; không cấu hình Docker healthcheck |

Probe **09:21:53 ngày 27/10/2026 (UTC+7)**, TLS verification bật, không theo redirect để giả thành công:

- Origin QuánPilot `/restaurant-login`: HTTP 200.
- Origin QuánPilot `/api/public/pricing`: HTTP 200.
- `https://admin.qavio.site/restaurant-login`: HTTP 200.
- `https://qavio.site/api/ready`: HTTP 200.

Không tạo giao dịch QA trên production; không đăng nhập tài khoản khách để ghi dữ liệu. Do chưa cutover, chưa thực hiện nghiệm thu đăng nhập có phiên/quản lý bàn/báo cáo **sau deploy** và không tuyên bố các bước đó đã đạt trên phiên bản mới. Bảy container không đổi là bằng chứng không có recreate/restart từ lần kiểm tra này; không thay thế kiểm thử mọi nghiệp vụ của mọi nhà hàng.

## 7. Rollback và quyết định Giai đoạn A

Không cần rollback vì chưa deploy. Image production hiện tại vẫn được giữ nguyên làm rollback cho đợt phát hành được duyệt sau này. Không xóa image/container/volume hoặc backup để lấy chỗ.

Khi được quyết định tiếp tục: lấy backup mới nếu nguồn đã thay đổi → audit/đối soát phù hợp → commit/push đúng phạm vi → CI Linux → verify source/image/checksum → capacity gate theo artifact thật → image-only recreate app, không DB/worker → readiness/login/bàn/báo cáo và so container → theo dõi ổn định. Bản phát hành lỗi phải trả app về image cũ bằng snapshot image-only; không restore/reset DB để đảo code.

**Giai đoạn A: NO-GO.** Cần quyết định ngoại lệ/đối soát bill lịch sử, hoàn tất phát hành Phase 0 và nghiệm thu vận hành ổn định trước khi xây giao diện Doanh thu & Thuế.
