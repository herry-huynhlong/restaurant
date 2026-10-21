# Entry đăng nhập khách nhà hàng từ QAVIO

21/10/2026 — attachment943a7817. Chỉ bổ sung route và điều hướng, không migration hoặc triển khai production.

- `/restaurant-login` dùng LoginForm/NextAuth Credentials hiện có, callback cố định `/restaurant-entry`. Session còn hiệu lực được giải quyết tại origin QuánPilot.
- `/restaurant-entry` lấy membership active, một nhà hàng chuyển đúng route theo role, nhiều nhà hàng dùng picker hiện có; bỏ qua platform role để không đưa khách sang `/platform`. Cơ chế `/login` của Platform Admin vẫn còn nguyên.
- Resolver từ chối tiếp tục bằng session trỏ tới user đã xóa/vô hiệu hóa. Login tenant chỉ bỏ qua form khi phiên có membership đúng slug; tenant guards và giới hạn gói tiếp tục áp dụng.
- Không thay JWT secret/TTL, OAuth Google, cookie domain, password hash, plan hoặc provisioning.
- Lint/TypeScript/build đạt (build cuối có DATABASE_URL test). HTTP integration tại3200/DB restaurant_trial_test đạt: anonymous/sai/đúng mật khẩu, session còn hạn/hết hạn, logout/relogin, đúng tenant/chặn tenant khác, platform separation, picker nhiều nhà hàng, user vô hiệu hóa/đã xóa, verification-cookie không thay login-session; TrialRegistration/SubscriptionRequest/Entitlement không đổi. Fixtures UUID riêng được dọn, không sửa Long Phụng.
- Trial regression22ca đạt, adapter Google cô lập; không tuyên bố đây là lần OAuth thật mới. Browser kiểm form và lỗi mật khẩu sai đạt.

Deploy: build Linux CI ngoài VPS, giữ image rollback2e8d0b1. Cập nhật riêng app QuánPilot trước, smoke hai route; QAVIO phát hành link sau đó. Không DB migration, không recreate PostgreSQL/worker, không build VPS hoặc xóa volume. Nếu lỗi, rollback QAVIO trước rồi QuánPilot. Production chưa thay đổi ở lượt này.
