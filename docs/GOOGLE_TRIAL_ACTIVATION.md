# Kích hoạt Google OAuth và trial thật — 21/10/2026

Trạng thái: QA Google thật local đã đạt; đang chuẩn bị phát hành, production trial chưa mở.

## Quyết định đã được chủ dự án xác nhận

- QAVIO chính thức https://qavio.site; QuánPilot chuyển sang https://admin.qavio.site; CMS QAVIO chuyển về https://qavio.site/admin. Đây là thay đổi vai trò hostname được hỏi và xác nhận riêng, không tự suy diễn.
- Quota production tối đa100nhà hàng dùng thử.
- Client Secret đã rotate; người dùng xác nhận JSON hiện tại chứa secret mới. Client Web ID che bớt:1038026798441-…vgc5kui.apps.googleusercontent.com. Không in secret, không commit/upload JSON hoặc đưa vào image.
- QA Google thật được phép: huynhlong2303la@gmail.com. Không tạo nhà hàng QA production.
- Google Audience External/In production do chủ dự án xác nhận.

## Credential và callback

JSON gốc trong root QAVIO đã được gitignore/dockerignore, không tracked/staged và quét tracked files không có secret. Bản sao ngoài repository: C:/Users/LONG_IT/.codex/secrets/qavio/google-oauth-web.json; ACL chỉ current user/SYSTEM. Bản gốc chưa xóa vì người dùng yêu cầu xác nhận trước. HMAC production96ký tựhex được tạo bằng random cryptographic, giữ riêng ngoài repo; HMAC staging khác production. QAVIO chỉ nhận HMAC, không nhận Google client secret.

Callback production: https://admin.qavio.site/api/integrations/qavio/trial/google/callback . Callback local cô lập: http://127.0.0.1:3200/api/integrations/qavio/trial/google/callback . Chủ dự án đã lưu hai URI. Lần thử đầu Google trả redirect_uri_mismatch; sau khi chủ dự án cập nhật lại, Google chấp nhận và callback thật thành công. Không giả lập identity ở lượt QA này.

## QA thật local

Hai production build local Windows chạy loopback3100/3200, PostgreSQL loopback55432, qavio_test và restaurant_trial_test. Google credential được đọc từ thư mục bảo mật, NODE_ENV=production, QUANPILOT_TRIAL_TEST_MODE=false; không gọi adapter Google QA. Luồng thật: nút Google QAVIO → HMAC QuánPilot → Google sign-in → callback QuánPilot kiểm JWT/state/nonce/PKCE → callback QAVIO → email verified. DB xác minh Google subject/verifiedAt và PKCEverifier đã xóa sau callback.

Người dùng tạo nhà hàng local Long Phụng, slug long-phung, bằng email Google QA; không dùng tên QA gợi ý. DB xác nhận đúng1TrialRegistration/Googleidentity,1OWNER, TRAIN/BASIC/ACTIVE, settings, password hashbcrypt; bắt đầu2026-10-21T06:30:43.954Z, hết hạn2026-11-21T06:30:43.954Z. PaymentOrder/paidEntitlement cho nhà hàng=0. Thử request khác bằng chính proof Google thật bị409TRIAL_ALREADY_USED và vẫn đúng1nhà hàng. Người dùng xác nhận đăng nhập OWNER được; không hỏi/nhận mật khẩu thử trong chat. Chưa xóa dữ liệu local do người dùng vừa tạo khi vẫn đang nghiệm thu.

## Hồi quy và giới hạn

Restaurant lint/TypeScript PASS; integration22 PASS trên DBtest (identity adapter riêng của bộ hồi quy, không coi là chứng cứ OAuth thật). Sửa phép so contract để chuẩn hóa CRLF/LF giữa2checkout Windows; nội dung contract giống nhau, không thay businesslogic. QAVIO lint/TypeScript/Contact14 và origin checks PASS. Bộ22 xác nhận concurrent/retry/email/slug/quota/rollback/1month/BASIC/tenant isolation/shared Platform Admin factory/no paid records; forced failure trong log là lỗi QA chủ động.

Nginx dự kiến phục vụ CMS từ qavio.site và toàn bộ QuánPilot từ admin.qavio.site, cùng các container hiện có. TLS certificate đã bao phủ cả hai. Logging OAuth chỉ dùng format bỏ query/body/header, error log OAuth không ghi requestURL để tránh lộ code; no-store/no-referrer. Cookie CMS host-only trên qavio.site; cookie CMS cũ tại admin host được hết hạn, không sao chép phiên. NEXTAUTH_URL và origin trial QuánPilot chuyển sang admin.qavio.site/qavio.site.

Production chỉ bật2trial flags sau CI/build/backup/restore/hostname/API readiness đạt. Form Contact tiếp tục mở; email/QUOTE/newsletter/indexing không mở. Không migration/reset DB hoặc restart PostgreSQL/worker bảo trì/portfolio. Backup và rollback pin image/env/Nginx trước đổi.

Kết quả commit/image/digest/deploy/flags/smoke sẽ cập nhật sau phát hành. Chưa tuyên bố production tạo nhà hàng thật thành công từ kết quả local.
