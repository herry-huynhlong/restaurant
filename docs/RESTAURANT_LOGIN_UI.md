# QuánPilot — giao diện đăng nhập hai cột

Thực hiện bản local theo lịch23:00 ngày21/10/2026 (Asia/Bangkok). Ngày22/10 chủ dự án xác nhận logo và duyệt phát hành: đã commit/push và deploy production qua CI thành công. Trạng thái chờ phát hành bên dưới là lịch sử trước phê duyệt.

## Những gì đã thay đổi

- `src/app/restaurant-login/page.tsx`: card hai cột, giới thiệu teal, nội dung đúng yêu cầu, form và link https://qavio.site/trial. Giữ nguyên getServerSession và resolver chuyển Dashboard.
- `src/components/app-shell/restaurant-login.module.css`: CSS riêng cho trang đăng nhập, card1120px, hai cột desktop/tablet, một cột dưới700px. Input/nút52px, nút hiện mật khẩu44px; focus ring/label/alert.
- `src/components/app-shell/login-form.tsx`: tùy chọn restaurantStyle chỉ được bật ở /restaurant-login; thêm hiện/ẩn mật khẩu không submit. Giữ nguyên toàn bộ onSubmit/signIn/callback/router/refresh. Các trang dùng LoginForm khác giữ giao diện cũ và không hiện toggle mới.
- `scripts/restaurant-login-integration.ts`: cập nhật ba assertion tên heading mới, giữ nguyên các kịch bản xác thực.
- `docs/login-ui/`: ảnh desktop/mobile/tablet và bằng chứng responsive/chức năng/phạm vi auth.

Không đổi NextAuth, auth/RBAC service, session/cookie, mật khẩu, subscription/entitlement, schema/migration, tenant isolation hoặc database production. Không hardcode slug. Không thêm quên mật khẩu giả, flow Google hay dịch vụ mới.

## Logo và ảnh mẫu

Đã kiểm tra assets trong repo. Không tìm thấy file wordmark/logo QuánPilot riêng có thông tin phê duyệt rõ ràng. Đã dùng nguyên asset PWA hiện có `public/icons/icon-512.png`, được đưa vào ứng dụng từ commit6683613 ngày08/10/2026 (Apply restaurant app icon across PWA); không dùng SVG placeholder, emoji, ảnh món hoặc logo QAVIO. File giữ nguyên byte, hiển thị object-fit:contain, đúng tỷ lệ1:1 và không crop/kéo giãn/đổi màu. Asset này chỉ có biểu tượng, vì vậy vẫn hiển thị tên QuánPilot cạnh bên.

Chủ dự án đã xác nhận biểu tượng PWA hiện tại qua câu trả lời “ok” ngày22/10 sau khi được hỏi logo và lên web. Giữ nguyên asset đã duyệt. Nếu sau này thay logo riêng, vị trí đề xuất `D:\anh\Restaurant\public\brand\QuanPilot.png` (hoặc SVG gốc). Quyết định sử dụng dựa trên xác nhận của chủ dự án, không chỉ từ việc file tồn tại.

Ảnh mẫu hai cột được nhắc trong yêu cầu chưa có trong tin nhắn đặt lịch hoặc tài liệu tìm được; do đó bản này bám mô tả bố cục/nội dung, chưa tuyên bố đã đối chiếu pixel với mẫu chưa xem. Chủ dự án đã duyệt bản xem trước hai cột đã kiểm thử để phát hành.

## Kết quả kiểm thử

- Next lint: PASS, không warning/error. TypeScript --noEmit: PASS.
- Production build Next14.2.35: PASS, chạy local với cấu hình test cô lập; không build VPS.
- HTTP integration qua NextAuth thật, PostgreSQL `restaurant_trial_test` loopback55432: anonymous, sai/đúng mật khẩu, session còn hạn/hết hạn, logout/relogin, đúng tenant/chặn tenant khác, tách platform, picker nhiều nhà hàng, user vô hiệu hóa/đã xóa và verification-cookie không phải session: PASS. Không tạo TrialRegistration/SubscriptionRequest/Entitlement.
- Browser: email sai định dạng bị validation, trường bắt buộc, hiện/ẩn và aria-pressed, sai mật khẩu báo đúng lỗi, nhập đúng qua form mới về đúng OWNER Dashboard, mở lại /restaurant-login với phiên hợp lệ chuyển thẳng Dashboard, link dùng thử đúng: PASS.
- Browser console warn/error rỗng, không hydration error. Đã logout và xóa đúng fixture UUID do lượt này tạo; không sửa Long Phụng hoặc Thiên Đảo. File credential fixture đã xóa, không ghi vào Git/báo cáo.
- So sánh source onSubmit trước/sau giống hoàn toàn; không file auth/RBAC/schema nào đổi: PASS, bằng chứng auth-scope.json.

| Viewport | Bố cục | Tràn ngang | Mép dưới nút Đăng nhập |
| --- | --- | --- | --- |
| 320×780 | Một cột | Không | 612px |
| 375×844 | Một cột | Không | 668px |
| 390×844 | Một cột | Không | 668px |
| 768×1024 | Hai cột | Không | 669px |
| 1280×720 | Hai cột | Không | 519px |

Logo tải đủ, tỷ lệ vuông. Nút đăng nhập nằm trong màn hình đầu ở cả năm kích thước kiểm tra. Ảnh desktop.jpg, mobile-320.jpg, mobile-375.jpg, mobile-390.jpg, tablet-768.jpg không có credential.

## Chuẩn bị phát hành

Yêu cầu lần này là báo cáo và chuẩn bị commit/push/deploy; không coi đó là lệnh phát hành production ngay. Chưa SSH, dispatch CI hoặc đổi image/server.

Sau khi chốt logo/mẫu và được yêu cầu phát hành: chỉ stage các file của lượt này, commit/push, chạy workflow `quanpilot-release.yml` với cấu hình public VAPID hiện có. Build Linux ngoài VPS, kiểm artifact checksum/revision/OCI, kiểm disk trước khi tải/load và giữ rollback. VPS lần gần nhất còn khoảng1.72GiB nên phải kiểm lại thực tế, dừng nếu không đủ, không prune chung hoặc xóa volume.

Chỉ recreate service app QuánPilot bằng image đã kiểm, không build trên server, không đổi env/flags/secrets, không migrate DB. Kiểm HTTPS /restaurant-login, health/login/cookie/guard, console/mobile và container khác. Bản trước `quanpilot-app:05ff9ad` giữ để rollback riêng overlay image/app nếu cần; không restore DB cho một thay đổi UI. Giữ nguyên QAVIO/worker/PostgreSQL/Portfolio.

Không stage/xóa các file ảnh uploads/logos và thư mục qavio/ vốn chưa tracked từ trước. Không tạo hoặc thay tài khoản production.

## Phê duyệt phát hành22/10/2026

Chủ dự án trả lời “ok” sau yêu cầu xác nhận logo và đưa lên web. Đã xác nhận dùng icon PWA hiện có, được commit/push/CI/deploy phạm vi UI này. Phần chờ duyệt phía trên là lịch sử. Không cần hỏi lại quyền phát hành; phải kiểm dung lượng VPS trước tải/load và giữ rollback.

### Đóng gói phù hợp dung lượng VPS

Server kiểm tra ngày22/10 còn1.826.635.776byte trống; image hiện tại khoảng1.58GB. CI bổ sung tùy chọn dùng lại chính runtime của bản05ff9ad đã chạy, chỉ khi package/lock/config/schema/public giống hệt. CI vẫn build/kiểm bản mới trên Linux, giữ toàn bộ dependency/base layers cũ, thay build Next đã bỏ build cache và source/scripts; không thay runtime/auth/dependency. Workflow thường vẫn giữ đường build cũ nếu không chọn tùy chọn này. .dockerignore loại archive/metadata CI khỏi context. Cần kiểm prefix layer khớp image hiện tại và ngân sách disk trước khi load; không xóa image rollback để lấy chỗ.

## Production đã hoàn tất —22/10/2026

- Image `quanpilot-app:3574ce4`, source3574ce4666c1ea2c961e486190d02e1d2519b5ba, CI [39705450257](https://github.com/herry-huynhlong/restaurant/actions/runs/39705450257) success. Image ID sha256:d4318e3b8e576e36afed72f6595ac1c627c02d58d44400c98a1254e0896070d2; config digest sha256:d83ba24bf77cd96064029adf5b538cc3f3aaad1070b30566934829f9ee7eff38.
- ArtifactZIP314.935.918byte, SHA256bb979e1075d8da60cdbf1362637feafe2d57b669d6d6a47a8e41b66a897b2e28; archive checksum, OCI/config/layers/revision được kiểm trước chạy. Dùng lại đúng22lớp runtime05ff9ad; tổngblob lớp mới trongarchive1.880.039byte. Dependencies/Next config/schema/public không đổi; loại build cache khỏi lớp mới. Không build trên VPS.
- Tải duy nhấtZIP, xác minh trước, đọc/stream archive vào Docker containerd store hiện có; không tạo thêm bản archive lớn hoặc giải nén toàn bộ ra ổ đĩa. Kiểm base layer/config và ngân sách dung lượng trước load, xóa đúngZIP của release sau xác minh/load. Không prune/xóa image rollback/volume.
- Disk trước tải1.822.703.616byte (~1.70GiB), sau1.807.790.080byte (~1.68GiB). Không cần dọn dữ liệu để phát hành.
- Chỉ recreate restaurant-app-1; appHTTP200 và originHTTPS200. Runtime env so sánh toàn bộ trước/sau giống nhau. QAVIO web/worker, hai PostgreSQL, maintenance worker và Portfolio giữ nguyên ID/start/restart count. Không migration, đủ5/27migration.
- Backup mới mã hóa tải off-host, restore cô lập đủ5/27migration PASS, đã dọn plaintext/bản restore. CiphertextSHA2562db8ba641a87ff257bf1adcd1deabc88dc3b0a21d8ea00784fc3b147835f11dd. Không restore hoặc sửa dữ liệu production.
- ProductionHTTPS: giao diện/nội dung mới, logo hash khớp file đã duyệt, link trial, anonymous guard, session rỗng khi chưa đăng nhập, CSRFcookie Secure/host-only và QAVIO/trial vẫn hoạt động PASS. Không đăng nhập bằng tài khoản khách hoặc tạo QA production; đúng/sai mật khẩu/session/tenant routing đã qua integration và browser trên DB cô lập.
- Browser production1280×720 và375×844: logo tải đủ, không overflow, nút đăng nhập nằm trong màn hình đầu, hiện/ẩn mật khẩu hoạt động, không warn/error/hydration. Không bấm submit dữ liệu QA trên production. Ảnh production-desktop.jpg và production-mobile.jpg, JSONproduction-http/browser/deployment trong docs/login-ui.
- Rollback giữ quanpilot-app:05ff9ad. Snapshot private `/opt/websites/qavio/.runtime/login-ui-release-20261022/snapshot/qp-overlay.yaml`; khôi phục đúng overlay rồi `docker compose --project-directory /opt/websites/restaurant -f /opt/websites/restaurant/docker-compose.yml -f /opt/websites/restaurant/.trial-runtime/production-release.yaml up -d --no-build --no-deps app`, kiểm HTTPS /restaurant-login. Không đổi secret/env/DB hoặc restart dịch vụ khác.
