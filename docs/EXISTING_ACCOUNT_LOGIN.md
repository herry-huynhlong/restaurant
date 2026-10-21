# Entry đăng nhập khách nhà hàng từ QAVIO

21/10/2026 — attachment943a7817. Chỉ bổ sung route và điều hướng, không migration. Sau chỉ đạo “deloy”, đã triển khai production như ghi nhận dưới đây.

- `/restaurant-login` dùng LoginForm/NextAuth Credentials hiện có, callback cố định `/restaurant-entry`. Session còn hiệu lực được giải quyết tại origin QuánPilot.
- `/restaurant-entry` lấy membership active, một nhà hàng chuyển đúng route theo role, nhiều nhà hàng dùng picker hiện có; bỏ qua platform role để không đưa khách sang `/platform`. Cơ chế `/login` của Platform Admin vẫn còn nguyên.
- Resolver từ chối tiếp tục bằng session trỏ tới user đã xóa/vô hiệu hóa. Login tenant chỉ bỏ qua form khi phiên có membership đúng slug; tenant guards và giới hạn gói tiếp tục áp dụng.
- Không thay JWT secret/TTL, OAuth Google, cookie domain, password hash, plan hoặc provisioning.
- Lint/TypeScript/build đạt (build cuối có DATABASE_URL test). HTTP integration tại3200/DB restaurant_trial_test đạt: anonymous/sai/đúng mật khẩu, session còn hạn/hết hạn, logout/relogin, đúng tenant/chặn tenant khác, platform separation, picker nhiều nhà hàng, user vô hiệu hóa/đã xóa, verification-cookie không thay login-session; TrialRegistration/SubscriptionRequest/Entitlement không đổi. Fixtures UUID riêng được dọn, không sửa Long Phụng.
- Trial regression22ca đạt, adapter Google cô lập; không tuyên bố đây là lần OAuth thật mới. Browser kiểm form và lỗi mật khẩu sai đạt.

Deploy: build Linux CI ngoài VPS, giữ image rollback2e8d0b1. Cập nhật riêng app QuánPilot trước, smoke hai route; QAVIO phát hành link sau đó. Không DB migration, không recreate PostgreSQL/worker, không build VPS hoặc xóa volume. Nếu lỗi, rollback QAVIO trước rồi QuánPilot. Production chưa thay đổi ở lượt này.

## Kết quả triển khai sau phê duyệt

- Đã deploy image `quanpilot-app:be133f2`, source `be133f24d5f5134f96427b6683089765f2f13af2`, CI39591262589 success. Chốt reserved slug cho hai entry và chạy lại integration/trial22ca đạt. Hai tên slug chưa có trong DB production.
- Image/archive/OCI config/layers/revision được kiểm chứng; build ngoài VPS. Backup mã hóa mới được tải off-host, restore cô lập27migration đạt; không migration production.
- `/restaurant-login`HTTPS200 hiển thị form email/mật khẩu, `/restaurant-entry` anonymous307 về login, cookie CSRF Secure host-only, API session anonymous rỗng. Browser qua link card và menu mobile QAVIO tới đúng trang login; không warn/error. Không đăng nhập bằng mật khẩu khách hoặc tạo QA production; các ca có phiên/tenant đã kiểm trên local cô lập.
- App Up, runtime env không đổi; PostgreSQL, maintenance worker và Portfolio giữ nguyên ID/start/restart count. QAVIO web mới697a6a1 healthy, contact/trial vẫn mở; email/newsletter/QUOTE/indexing vẫn đóng. PortfolioHTTPS200.
- Disk sau deploy/dọn hai archive của release:3.7G trống/85%. Giữ rollback image2e8d0b1; snapshot private `/opt/websites/qavio/.runtime/login-release-20261021/snapshot/qp-overlay.yaml`. Khôi phục overlay rồi recreate riêng app khi rollback, không restore DB.
- Báo cáo/bằng chứng chi tiết tại QAVIO `docs/EXISTING_ACCOUNT_LOGIN.md` và `docs/login-release/`. Bản hình ảnh/CMS/Roboto đang ở local QAVIO, không đưa vào release này.
