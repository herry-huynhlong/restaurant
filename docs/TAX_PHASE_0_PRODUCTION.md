# QuánPilot — phát hành Phase 0 production

Ngày **27/10/2026**, Asia/Bangkok. Website: https://admin.qavio.site.

**GO — Phase 0 đã chạy trên production và đạt kiểm tra sau deploy.** Chỉ QuánPilot app được recreate. Không migration/reset/restore production DB, không restart worker/PostgreSQL/Docker Engine, không thay QAVIO hoặc tính năng thuế.

## 1. Source, CI và image

| Hạng mục | Giá trị đã xác minh |
|---|---|
| Source commit | `cd82e8d7e73ce4a9203089172b0ba485ab47b516` |
| Nhánh | `main`, đã push đúng 17 file source/test/workflow/tài liệu Phase 0 |
| CI | [GitHub Actions 40438733493](https://github.com/herry-huynhlong/restaurant/actions/runs/40438733493), SUCCESS |
| Image | `quanpilot-app:cd82e8d`, Linux/amd64 |
| Image ID đang chạy | `sha256:7fd156dc7047b269aa01742177046b3121ac49f175e28c421e87e021159ebe54` |
| Archive | `quanpilot-images.tar.gz`, 313.290.552 bytes |
| Archive SHA256 | `909ac59a543997a1c4bc91822e294520d09faf68a9144b98a4db91e38200df32` |
| GitHub artifact digest | `sha256:3f6390b017bf3588cf9115f313d81dd8bde5c3b13c93ff81a04867f77409011c` |
| Release manifest SHA256 | `645267b6601c9ec3d0017d888ef50e0e2b7b7663358d27b924ba56fa8ffac4bd` |
| Image config SHA256 | `a2cc6f078925a8eafbad6fb8b755c0735eec2a529989563b860b5e2492f0e486` |
| Tổng layer giải nén | 1.176.169.984 bytes, được đo thực tế bởi release verifier |

Image ID, config digest và GitHub ZIP digest là ba định danh khác nhau. Không dùng kích thước image nén 315.179.566 bytes để thay thế dung lượng layer giải nén khi tính capacity.

Review artifact thực hiện ngoài VPS bằng `deploy/review_release.py`: đúng repo/workflow/manual run/main/source SHA, run thành công, đúng bốn file payload, GitHub digest, manifest, archive checksum, config/rootfs và platform. VPS kiểm tra lại trước docker load và so image được load với manifest. Không đưa SSH key, production env hoặc private snapshot vào GitHub artifact.

Đã đối chiếu SHA256 của **7 file source trong container đang chạy** với blob của source commit: period, payment service, reporting service, financial audit service và ba route customer request/customer order/staff order. Image chứa các sửa đổi đã duyệt; không chỉ dựa vào tên tag.

## 2. Kết quả CI Linux

GitHub-hosted runner đã chạy thành công:

- 22 test deployment offline, lint và TypeScript.
- Pricing/subscription PostgreSQL integration và checkout/entitlement regression.
- 65 bộ period/timezone, leap year, kỳ trước và bucket theo lịch.
- PostgreSQL Phase 0: stale request, double confirm/retry/method, multi-order, order sát thanh toán, idempotency, tenant isolation, month boundary và audit read-only.
- Docker build production đầy đủ trên runner.
- **13 nhóm PostgreSQL/HTTP trên chính image vừa build**, DB test riêng: gồm gate tái hiện deadlock staff order/confirm, double-click API, paid bill/history, role guards, trang bàn/thu ngân/báo cáo và QR welcome.
- Tạo manifest/checksum, đóng gói và upload artifact thành công.

VPS chỉ nhận archive đã duyệt, kiểm tra và `docker load`; không `docker build`, compose build hoặc tự pull image. Phần bổ sung workflow cũng chỉ phục vụ các kiểm tra Phase 0, không mở auto-deploy khi push main.

## 3. Backup mới và dữ liệu sau snapshot ban đầu

Đã lấy hai backup mới trước cutover, mã hóa theo runbook, chuyển off-host, kiểm checksum và restore PostgreSQL cô lập. Không dùng kết quả DB test sạch làm bằng chứng production sạch.

| Mốc UTC+7 | Vai trò | Kết quả |
|---|---|---|
| 09:27:15 | Backup sau duyệt ngoại lệ, trước commit/CI | Restore/audit PASS theo baseline ngoại lệ |
| **09:38:32** | Backup sát cutover, sau khi tải image | Restore/audit PASS; không có cảnh báo mới |
| 09:42:24 | Snapshot kiểm tra sau deploy | Restore/audit PASS; fingerprint bill ngoại lệ không đổi |

Backup sát cutover:

- Dump QuánPilot 239.749 bytes; gói mã hóa 3.809.312 bytes; có archive uploads 80 entries.
- Dump SHA256: `40909f4ac77100433d2219b13783359bc803bf5971e1df8e50a6227c6c452274`.
- Gói mã hóa SHA256: `f4dc5d69fed3b4c5dbd63d4a1f42580d1616f02ff15b2b56b1c27d123d7ed5f4`.
- Restore bằng pg_restore vào DB mới trên 127.0.0.1:55432; 28 migration hoàn tất, 0 lỗi. Không áp migration mới.
- Sau kiểm tra đã dọn đúng DB clone và file plaintext tạm; giữ backup mã hóa/off-host, proof và image rollback.

Bản mã hóa và bằng chứng nằm trong thư mục private `.trial-runtime/tax-phase0-release-20261027/backup-precutover/` trên VPS và `C:/Users/LONG_IT/.codex/secrets/qavio/tax-phase0-precutover/` off-host. ACL off-host giới hạn tài khoản hiện tại/SYSTEM. Các thư mục này không nằm trong Git/artifact.

## 4. Audit và ngoại lệ lịch sử

Audit trên **bản sao production**, transaction RepeatableRead + READ ONLY; phân loại bổ sung chỉ SELECT trên clone. Không sửa hoặc audit ghi dữ liệu production.

Trước và sau cutover đều có 5 tenant, 48 phiên, 168 order, 49 Payment, 45 PAID, 28 migration. Các số đếm và kết quả audit khớp nhau. Không suy diễn rằng mọi thuộc tính của mọi bản ghi đã được so byte-for-byte; riêng bill ngoại lệ và phiên liên quan được đối chiếu fingerprint đầy đủ.

| Mã | Trước | Sau |
|---|---:|---:|
| MISSING_BILL_SNAPSHOT | 1 | 1 |
| PAID_SESSION_STATE_MISMATCH | 1 | 1 |
| PAID thiếu paidAt | 0 | 0 |
| Sai amount/subtotal + tax/grandTotal | 0 | 0 |
| Nhiều PAID cùng phiên | 0 | 0 |
| Lệch tenant Payment/Order/OrderItem | 0 | 0 |
| Trùng invoiceNumber/idempotency trong tenant | 0 | 0 |
| LEGACY_INCOMPLETE | 0 | 0 |
| Tổng nguồn OrderItem lệch subtotal PAID | 0 | 0 |

**Hai cảnh báo vẫn thuộc cùng một bill lịch sử đã được chủ dự án chấp thuận ngoại lệ.** Bill thiếu invoiceNumber và snapshot người bán/bàn; phiên còn trạng thái PAID, paymentStatus PAID và có closedAt. Chứng từ gốc **chưa xác minh, cần đối soát riêng**.

Đã xác nhận fingerprint Payment + DiningSession của ngoại lệ không đổi giữa backup trước CI, sát cutover và sau deploy. Không tạo invoiceNumber, bổ sung snapshot, chuyển phiên CLOSED, xóa bill, đổi số tiền hoặc backfill. Không thêm bộ lọc loại bill này khỏi báo cáo doanh thu; query vẫn lấy Payment PAID theo paidAt với cùng semantics tổng bill hiện có.

Không phát hiện cảnh báo tài chính mới trong snapshot sau deploy. Không đưa ID bill, tên/số điện thoại khách, tên món hoặc nội dung order vào báo cáo.

## 5. Capacity và triển khai image-only

Capacity gate trước transfer dựa trên artifact thật:

- Free: **7.596.257.280 bytes**, used 70,90% theo phép tính guard.
- Incoming upper bound: 1.802.751.088 bytes = layer giải nén + 2 × archive.
- Reserve: 2.610.569.625 bytes, tương đương 10% filesystem.
- Tổng free bắt buộc: **4.413.320.713 bytes**; MemAvailable 489.394.176 bytes. **PASS**.

Dry-run/cutover kiểm lại sau transfer: free khoảng 7,28 GB, yêu cầu khoảng 3,79 GB và RAM available trên 500 MB; PASS. Không tính reclaimable Docker là free, không xóa image/backup/volume để vượt gate.

App mới bắt đầu **09:41:03 ngày 27/10/2026 (UTC+7)**. Triển khai qua release guard với exact source SHA + manifest digest, snapshot private và shared release lock:

- Pin image ID đã load; compose hiệu lực không build, pull_policy never.
- `up -d --no-build --pull never --no-deps app`.
- Chỉ persist app image reference mới trong runtime overlay; so model chứng minh không đổi env/network/volume/health/runtime khác.
- App log rotation json-file `max-size=10m`, `max-file=3`; không truncate/xóa log. Logging của worker/PG không áp bằng recreate trong đợt này.
- So thực tế Config.Env trước/sau: **không có key/value thay đổi**, bao gồm auth và cấu hình runtime; Node trước/sau cùng v22.23.4.
- Mounts app giữ nguyên. Không gọi migration, reset, restore production DB, rebuild VPS hoặc restart Docker Engine.

Sau deploy, kiểm tra cuối: free **6.020.755.456 bytes (~5,61 GiB)**, `df` báo 76% used, MemAvailable 534 MiB và swap 801/2047 MiB. App khoảng 29,84 MiB theo docker stats ở mẫu trước đó. Đây là số đo ngắn hạn, không phải bằng chứng đủ tải peak cho VPS RAM 1 GB.

## 6. Production smoke test an toàn

| Kiểm tra | Kết quả |
|---|---|
| Origin và HTTPS `/restaurant-login`, `/api/public/pricing` | 200, TLS được xác minh, readiness không coi redirect là thành công |
| Đăng nhập tài khoản hiện có | PASS; session hợp lệ, không ghi mật khẩu vào file/log/report |
| Dashboard và quản lý bàn | 200 đúng URL sau đăng nhập |
| Báo cáo `?period=month` | 200 đúng URL, không redirect sang login/unauthorized |
| API lịch sử bill | 200, auth đúng, không xuất dữ liệu trả về vào báo cáo |
| Đăng xuất | PASS; session không còn user |
| Màn hình/API thu ngân riêng với TRAIN–BASIC | **307 → unauthorized đúng feature guard hiện có**; không tự nâng gói hoặc sửa quyền |
| OWNER gọi xác nhận thanh toán với body `{}` | **400 missing_dining_session** trước khi ghi tài chính; không dùng session thật để tạo bill thử |
| Concurrent request/confirm/order, snapshot và idempotency | PASS trong PostgreSQL/HTTP CI trên image; không tái hiện lỗi trên khách production |
| QAVIO readiness | 200; container không đổi |

Smoke được siết kiểm tra URL cuối và redirect, không chỉ nhìn mã 200 sau khi HTTP client tự follow. Phân biệt rõ màn hình thu ngân riêng bị khóa theo BASIC với chức năng xác nhận thanh toán của OWNER vẫn được phép. Không dùng test để vượt plan guard.

Không tạo order, bàn, Payment, service request hoặc giao dịch khách giả. POST production chỉ gồm auth/signout và một yêu cầu thanh toán thiếu session bị validation chặn; không có transaction thu tiền thử. Không in bill thật hoặc sửa dữ liệu để kiểm thử.

## 7. Theo dõi sau phát hành

Mẫu định kỳ đến **09:51:18 (UTC+7)**, khoảng 10 phút 15 giây sau app start, kết hợp kiểm tra safe access log:

- App và PostgreSQL: không thấy `deadlock detected`/40P01, transaction timeout, Prisma P2028 hoặc lỗi confirm payment trong cửa sổ log đã xem.
- pg_stat_database được SELECT trong read-only transaction: deadlocks 0, conflicts 0, không tăng so baseline.
- Safe Nginx access log dùng chung QAVIO/QuánPilot sau app start: **92 request, 0 HTTP 5xx** ở lần đọc kiểm chứng; shared access log khác có 41 request, 0 5xx trong cửa sổ xem. Chỉ tổng hợp timestamp/status, không xuất log gốc/IP/URL khách.
- Smoke sau đăng nhập: dashboard 406 ms, bàn 2.172 ms, báo cáo tháng 578 ms, lịch sử bill 281 ms. Số đo đơn lẻ qua public HTTPS, không phải benchmark/SLA hoặc kiểm thử tải.
- App running, RestartCount 0, không restart ngoài lần recreate đã duyệt; sáu container còn lại không đổi ID/image/StartedAt/RestartCount. Image ID lần kiểm tra cuối khớp image đã phát hành.

Không tạo automation/cron theo dõi dài hạn. Cửa sổ quan sát ngắn đạt yêu cầu smoke hiện tại; vẫn cần theo dõi vận hành thực tế và tải peak trong các đợt sau.

## 8. Bảy container

| Container | Sau phát hành | Tác động |
|---|---|---|
| restaurant-app-1 | Running, HTTP probes PASS; không có Docker healthcheck | Recreate đúng image mới |
| restaurant-maintenance-worker-1 | Running; không có Docker healthcheck | ID/start/image/restarts giữ nguyên |
| restaurant-postgres-1 | Running, healthy | Giữ nguyên container và volume |
| qavio-web-1 | Running, healthy | Giữ nguyên |
| qavio-worker-1 | Running, healthy | Giữ nguyên |
| qavio-qavio-postgres-1 | Running, healthy | Giữ nguyên |
| longh-portfolio | Running; không có Docker healthcheck | Giữ nguyên |

Nguồn chứng minh không ảnh hưởng các nhà hàng khác: sáu container không đổi, volume/mount và runtime preserved, không migration/ghi tài chính từ release, audit 5 tenant không có lệch mới, số đếm tài chính trước/sau khớp. Không tuyên bố đã thao tác mọi nghiệp vụ của từng nhà hàng production.

## 9. Rollback

Rollback đã giữ: `quanpilot-app:c889cc0`, image ID `sha256:bc1ac42910a8bef6cb68ffdf658794efd44338935bee087c705a89e4adac1f76`. Chưa cần rollback.

Snapshot private: `/opt/websites/restaurant/.trial-runtime/tax-phase0-release-20261027/cutover/`, gồm rollback-pinned.json và pinned.json; runtime overlay cũ ở `overlay-before.private.yaml` trong thư mục release. Nếu phải rollback: phục hồi app image reference cũ từ file đó và recreate **riêng app** bằng rollback-pinned.json với `--no-build --pull never --no-deps`; kiểm readiness/login/bàn/báo cáo và container khác. Không restore database chỉ để đảo code. Image cũ vẫn có các lỗi Phase 0, cần ghi nhận rủi ro nếu quay lại.

Giữ artifact đã xác minh off-host và hai image trên VPS; không prune image, volume, log hoặc backup trong đợt này. Artifact mới trên VPS là staging release, không chứa production secret; chưa tự xóa để tránh mất bằng chứng hoặc rollback tooling.

## 10. Rủi ro còn lại và Phase A

- Bill ngoại lệ chưa xác minh chứng từ, không được hợp thức hóa bằng cấu hình hiện tại. Vẫn nằm trong doanh thu POS hiện có, chưa được xem là dữ liệu thuế đầy đủ.
- Code khóa và idempotency bảo vệ các luồng đã kiểm thử; DB chưa có unique “mỗi phiên một PAID”/composite tenant FK. SQL hoặc writer mới ngoài các luồng này phải tuân thủ bất biến và được kiểm thử.
- Chưa load/soak test peak; VPS RAM 1 GB vẫn có swap và cần sizing/giám sát khi tăng tải. Không hạ memory limit tùy tiện.
- Chưa có nghiệp vụ hủy/hoàn/giảm giá, sổ điều chỉnh, khóa kỳ hoặc lịch sử hồ sơ thuế. Doanh thu POS chưa đồng nghĩa doanh thu tính thuế hay số thuế phải nộp.

**Quyết định:** GO cho Phase 0, hoàn tất phát hành và smoke; có thể chuyển sang bước xác định phạm vi/thiết kế Phase A theo yêu cầu tiếp theo. Trước khi dùng báo cáo hỗ trợ thuế thực tế cần thống nhất định nghĩa dữ liệu, cách cảnh báo bill chưa xác minh, phạm vi read-only/export, backup/restore và giới hạn nghiệp vụ. Không tự bắt đầu module thuế, hóa đơn điện tử hoặc công thức thuế trong nhiệm vụ này.

Bằng chứng đã lược secret ở `.trial-runtime/phase0-evidence/`, artifact review, production-smoke JSON local và audit-restore JSON trong private off-host backup. Không commit raw logs, credential, production env, bản dump hoặc dữ liệu khách hàng.
